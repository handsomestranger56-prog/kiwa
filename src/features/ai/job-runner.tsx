import { type PropsWithChildren, createContext, use, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { AiError } from '@/core/ai';
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

  constructor(private readonly data: AppData) {}

  /** Starts every run that was still going when the app last closed. */
  async resumeAll(): Promise<void> {
    for (const job of await this.data.jobs.running()) this.start(job.id);
  }

  isActive(id: string): boolean {
    return this.active.has(id);
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

      const ask: Ask = (request) => callModel(this.data.providers, job.model, request);
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

  /** Writes several missing lessons at once. Each is saved as soon as it is done. */
  private async writeLessons(job: Job, ask: Ask): Promise<void> {
    const batch = missingLessons(job.state).slice(0, PARALLEL_LESSONS);
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
              usage: {
                inputTokens: latest.usage.inputTokens + result.state.usage.inputTokens - job.state.usage.inputTokens,
                outputTokens: latest.usage.outputTokens + result.state.usage.outputTokens - job.state.usage.outputTokens,
                requests: latest.usage.requests + result.state.usage.requests - job.state.usage.requests,
              },
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
    await this.merge(id, () => state);
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

export function useJobRunner(): JobRunner {
  const runner = use(RunnerContext);
  if (!runner) throw new Error('useJobRunner must be used inside JobRunnerProvider.');
  return runner;
}
