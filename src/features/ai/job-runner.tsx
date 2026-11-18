import { type PropsWithChildren, createContext, use, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { type Usage, AiError, retryWait } from '@/core/ai';
import { type Ask, type Job, type JobError, type JobState, GenerationError, missingLessons, nextStep, runStep } from '@/core/generate/plan';
import { type AppData, useData } from '@/data/provider';
import i18n from '@/i18n';
import { showNow } from '@/platform/notifications';

import { callModel } from './call';

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
   * Sends requests for one run. Every request is counted, failed ones too. A rate limit or a busy
   * server is waited out and the same request sent again, so the run carries on by itself.
   */
  private askFor(job: Job): Ask {
    return async (request) => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const reply = await callModel(this.data.providers, job.model, request);
          await this.count(job.id, reply.usage, false);
          return reply;
        } catch (error) {
          await this.count(job.id, error instanceof AiError ? error.usage : undefined, true);
          const wait = retryWait(error, attempt);
          if (wait === null) throw error;
          if (error instanceof AiError && error.kind === 'rate') this.throttled.add(job.id);
          this.setWait(job.id, Date.now() + wait);
          await new Promise((resolve) => setTimeout(resolve, wait));
          this.setWait(job.id, null);
          // Discarded while it waited: stop here instead of spending another request.
          const latest = await this.data.jobs.get(job.id);
          if (!latest || latest.status !== 'running') throw error;
        }
      }
    };
  }

  private count(id: string, usage: Usage | undefined, failed: boolean): Promise<void> {
    return this.merge(id, (latest) => ({
      ...latest,
      usage: {
        inputTokens: latest.usage.inputTokens + (usage?.inputTokens ?? 0),
        outputTokens: latest.usage.outputTokens + (usage?.outputTokens ?? 0),
        requests: latest.usage.requests + 1,
        failed: (latest.usage.failed ?? 0) + (failed ? 1 : 0),
      },
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
    // Usage is counted per request as it happens (see askFor), so the stored count wins.
    await this.merge(id, (latest) => ({ ...state, usage: latest.usage }));
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
        ? { kind: error.kind, message: error.message }
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
