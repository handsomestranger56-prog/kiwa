import { type PropsWithChildren, createContext, use, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { type Usage, AiError, retryWait } from '@/core/ai';
import { type Ask, type FailedRequest, type Job, type JobError, type JobState, GenerationError, MAX_FAILURES_KEPT, missingLessons, nextStep, runStep } from '@/core/generate/plan';
import { type AppData, useData } from '@/data/provider';
import i18n from '@/i18n';
import { showNow } from '@/platform/notifications';

import { type RequestRecord, callModel } from './call';

/** How many lessons of one course are written at the same time. */
const PARALLEL_LESSONS = 2;

/**
 * Works through generation runs in the background of the app. Every finished step is saved,
 * so a run cut short by the phone closing the app carries on from there the next time it opens.
 */
export class JobRunner {
  private active = new Set<string>();
  /** Runs that hit a rate limit write one lesson at a time from then on. */
  private throttled = new Set<string>();
  /** When a run paused for a rate limit or a busy server will try again. */
  private waits = new Map<string, number>();
  /** Ends a wait early: used when the person picks another model for a waiting run. */
  private wakers = new Map<string, Set<() => void>>();
  private listeners = new Set<() => void>();

  constructor(private readonly data: AppData) {}

  /** Starts every run that was still going when the app last closed. */
  async resumeAll(): Promise<void> {
    for (const job of await this.data.jobs.running()) this.start(job.id);
  }

  isActive(id: string): boolean {
    return this.active.has(id);
  }

  /** The time a paused run tries again, or null when it is not waiting. */
  waitingUntil(id: string): number | null {
    return this.waits.get(id) ?? null;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setWait(id: string, until: number | null): void {
    if (until === null) this.waits.delete(id);
    else this.waits.set(id, Math.max(until, this.waits.get(id) ?? 0));
    for (const listener of this.listeners) listener();
  }

  /** Starts a run unless it is already going. Returns at once. */
  start(id: string): void {
    if (this.active.has(id)) return;
    this.active.add(id);
    void this.loop(id).finally(() => this.active.delete(id));
  }

  private async loop(id: string): Promise<void> {
    for (;;) {
      const job = await this.data.jobs.get(id);
      if (!job) return;
      const step = nextStep(job);
      if (!step) return;

      const ask = this.askFor(job);
      try {
        if (step.type === 'lesson') {
          await this.writeLessons(job, ask);
        } else {
          const result = await runStep(step, job, ask);
          await this.save(id, result.state, result.status);
        }
      } catch (error) {
        await this.fail(id, error);
        return;
      }
    }
  }

  /**
   * Sends requests for one run. Every HTTP request is counted, failed ones too, and failures are
   * kept so the run screen can show them. A per-minute limit or a busy server is waited out and
   * the request sent again. A daily limit or used-up credit stops the run, so another model can
   * take over. A model picked while waiting takes over at once.
   */
  private askFor(job: Job): Ask {
    return async (request) => {
      let model = job.model;
      for (let attempt = 0; ; attempt += 1) {
        const records: RequestRecord[] = [];
        try {
          const reply = await callModel(this.data.providers, model, request, (record) => records.push(record));
          await this.count(job.id, model.label, records, reply.usage, null);
          return reply;
        } catch (error) {
          await this.count(job.id, model.label, records, error instanceof AiError ? error.usage : undefined, error);
          const wait = retryWait(error, attempt);
          if (wait === null) throw error;
          if (error instanceof AiError && error.kind === 'rate') this.throttled.add(job.id);
          await this.pause(job.id, wait);
          // Discarded while it waited: stop here instead of spending another request.
          const latest = await this.data.jobs.get(job.id);
          if (!latest || latest.status !== 'running') throw error;
          if (latest.model.providerId !== model.providerId || latest.model.model !== model.model) {
            // Another model was picked while waiting: it starts fresh, with its own retries.
            model = latest.model;
            attempt = -1;
          }
        }
      }
    };
  }

  /** Waits, unless a new model is picked first. */
  private pause(id: string, ms: number): Promise<void> {
    this.setWait(id, Date.now() + ms);
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wakers.get(id)?.delete(done);
        this.setWait(id, null);
        resolve();
      };
      const timer = setTimeout(done, ms);
      const set = this.wakers.get(id) ?? new Set<() => void>();
      set.add(done);
      this.wakers.set(id, set);
    });
  }

  /** Hands the rest of a run to another model. A request waiting on a limit goes to it at once. */
  async switchModel(id: string, model: Job['model']): Promise<void> {
    await this.data.jobs.update(id, { model });
    this.throttled.delete(id);
    for (const wake of [...(this.wakers.get(id) ?? [])]) wake();
  }

  private count(id: string, model: string, records: RequestRecord[], usage: Usage | undefined, error: unknown): Promise<void> {
    const failures: FailedRequest[] = records
      .filter((record) => !record.ok)
      .map((record) => ({ at: record.at, model, status: record.status, message: record.message ?? '' }));
    if (error) {
      const info = error instanceof AiError ? { kind: error.kind, limit: error.limit, message: error.message } : { kind: 'network', message: error instanceof Error ? error.message : String(error) };
      const last = records.at(-1);
      // Name the kind of problem on the request that caused it. A reply that arrived but was cut
      // off or refused is a failure too, though the network saw a success.
      if (last && !last.ok) Object.assign(failures[failures.length - 1], info);
      else failures.push({ at: last?.at ?? Date.now(), model, ...info });
    }
    // Requests that never reached the network (no key, removed provider) still count once.
    const sent = Math.max(records.length, error ? 1 : 0);
    return this.merge(id, (latest) => ({
      ...latest,
      usage: {
        inputTokens: latest.usage.inputTokens + (usage?.inputTokens ?? 0),
        outputTokens: latest.usage.outputTokens + (usage?.outputTokens ?? 0),
        requests: latest.usage.requests + sent,
        failed: (latest.usage.failed ?? 0) + failures.length,
      },
      failures: failures.length > 0 ? [...(latest.failures ?? []), ...failures].slice(-MAX_FAILURES_KEPT) : latest.failures,
    }));
  }

  /** Writes several missing lessons at once. Each is saved as soon as it is done. */
  private async writeLessons(job: Job, ask: Ask): Promise<void> {
    const batch = missingLessons(job.state).slice(0, this.throttled.has(job.id) ? 1 : PARALLEL_LESSONS);
    let firstError: unknown = null;
    await Promise.all(
      batch.map(async (index) => {
        try {
          const result = await runStep({ type: 'lesson', index }, job, ask);
          await this.merge(job.id, (latest) => {
            const lessons = [...latest.lessons];
            lessons[index] = result.state.lessons[index];
            return {
              ...latest,
              lessons,
              fixes: [...latest.fixes, ...result.state.fixes.slice(job.state.fixes.length)],
            };
          });
        } catch (error) {
          firstError ??= error;
        }
      }),
    );
    if (firstError) throw firstError;
  }

  // Lessons finish in any order. Saves go one at a time so none overwrites another.
  private saving: Promise<void> = Promise.resolve();

  private merge(id: string, change: (latest: JobState) => JobState): Promise<void> {
    const next = this.saving.then(async () => {
      const latest = await this.data.jobs.get(id);
      if (latest) await this.data.jobs.update(id, { state: change(latest.state) });
    });
    this.saving = next.catch(() => {});
    return next;
  }

  private async save(id: string, state: JobState, status?: Job['status']): Promise<void> {
    // Usage and failures are recorded per request as they happen (see askFor), so the stored ones win.
    await this.merge(id, (latest) => ({ ...state, usage: latest.usage, failures: latest.failures }));
    if (!status) return;
    await this.data.jobs.update(id, { status, error: null });
    // Someone who left the app while it worked hears that it needs them.
    if ((status === 'ready' || status === 'outline') && AppState.currentState !== 'active') {
      const job = await this.data.jobs.get(id);
      const topic = job?.request.topic.split('\n')[0] ?? '';
      await showNow(i18n.t(status === 'ready' ? 'notify.generated.title' : 'notify.outline.title'), topic).catch(() => {});
    }
  }

  private async fail(id: string, error: unknown): Promise<void> {
    const info: JobError =
      error instanceof AiError
        ? { kind: error.kind, message: error.message, ...(error.limit ? { limit: error.limit } : {}) }
        : error instanceof GenerationError
          ? { kind: 'invalid', message: error.message, issues: error.issues }
          : { kind: 'network', message: error instanceof Error ? error.message : String(error) };
    await this.data.jobs.update(id, { status: 'failed', error: info }).catch(() => {});
  }
}

const RunnerContext = createContext<JobRunner | null>(null);

/** Starts the runner once the data is open, and picks up interrupted runs. */
export function JobRunnerProvider({ children }: PropsWithChildren) {
  const data = useData();
  const [runner] = useState(() => new JobRunner(data));

  useEffect(() => {
    runner.resumeAll().catch(() => {});
  }, [runner]);

  return <RunnerContext value={runner}>{children}</RunnerContext>;
}

/** When the run will try again after a rate limit or a busy server, or null. */
export function useJobWait(id: string): number | null {
  const runner = useJobRunner();
  return useSyncExternalStore(runner.subscribe, () => runner.waitingUntil(id));
}

export function useJobRunner(): JobRunner {
  const runner = use(RunnerContext);
  if (!runner) throw new Error('useJobRunner must be used inside JobRunnerProvider.');
  return runner;
}
