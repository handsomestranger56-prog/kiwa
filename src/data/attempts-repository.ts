import { newId } from '@/core/ids';
import type { SessionState } from '@/core/quiz/session';
import type { AssessmentMode } from '@/core/schema';

import { ChangeFeed } from './changes';
import type { SqlDriver } from './sql';

export type Attempt = {
  id: string;
  itemId: string;
  lessonId: string | null;
  assessmentId: string;
  mode: AssessmentMode;
  state: SessionState;
  startedAt: number;
  /** Null while the attempt is still in progress. */
  finishedAt: number | null;
  earned: number | null;
  total: number | null;
  /** Null for practice, which has no pass mark. */
  passed: boolean | null;
};

export type AttemptResult = { earned: number; total: number; passed: boolean | null };

/** What is known about one assessment from past attempts. */
export type AssessmentRecord = {
  finishedCount: number;
  /** An attempt that can be resumed. */
  openAttemptId: string | null;
  last: { attemptId: string; percent: number; passed: boolean | null; finishedAt: number } | null;
  bestPercent: number | null;
};

type AttemptRow = {
  id: string;
  item_id: string;
  lesson_id: string;
  assessment_id: string;
  mode: AssessmentMode;
  state: string;
  started_at: number;
  finished_at: number | null;
  earned: number | null;
  total: number | null;
  passed: number | null;
};

export class AttemptsRepository {
  constructor(
    private readonly db: SqlDriver,
    private readonly changes: ChangeFeed = new ChangeFeed(),
    private readonly now: () => number = Date.now,
  ) {}

  /** Begins a new attempt. An unfinished earlier attempt at the same assessment is dropped. */
  async start(input: {
    itemId: string;
    lessonId: string | null;
    assessmentId: string;
    mode: AssessmentMode;
    state: SessionState;
  }): Promise<Attempt> {
    const id = newId('t');
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM attempts WHERE item_id = ? AND assessment_id = ? AND finished_at IS NULL', [
        input.itemId,
        input.assessmentId,
      ]);
      await this.db.run(
        `INSERT INTO attempts (id, item_id, lesson_id, assessment_id, mode, state, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, input.itemId, input.lessonId ?? '', input.assessmentId, input.mode, JSON.stringify(input.state), this.now()],
      );
    });
    this.changes.notify();
    return (await this.get(id)) as Attempt;
  }

  async get(id: string): Promise<Attempt | null> {
    const row = await this.db.first<AttemptRow>('SELECT * FROM attempts WHERE id = ?', [id]);
    return row ? toAttempt(row) : null;
  }

  /** The attempt in progress for an assessment, if there is one. */
  async findOpen(itemId: string, assessmentId: string): Promise<Attempt | null> {
    const row = await this.db.first<AttemptRow>(
      `SELECT * FROM attempts WHERE item_id = ? AND assessment_id = ? AND finished_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      [itemId, assessmentId],
    );
    return row ? toAttempt(row) : null;
  }

  /**
   * Saves progress within an attempt. Does not notify listeners:
   * this runs on every answer and nothing on other screens depends on it.
   */
  async save(id: string, state: SessionState): Promise<void> {
    await this.db.run('UPDATE attempts SET state = ? WHERE id = ? AND finished_at IS NULL', [
      JSON.stringify(state),
      id,
    ]);
  }

  async finish(id: string, state: SessionState, result: AttemptResult): Promise<void> {
    await this.db.run(
      `UPDATE attempts SET state = ?, finished_at = ?, earned = ?, total = ?, passed = ?
       WHERE id = ? AND finished_at IS NULL`,
      [
        JSON.stringify(state),
        this.now(),
        result.earned,
        result.total,
        result.passed === null ? null : result.passed ? 1 : 0,
        id,
      ],
    );
    this.changes.notify();
  }

  async discard(id: string): Promise<void> {
    await this.db.run('DELETE FROM attempts WHERE id = ?', [id]);
    this.changes.notify();
  }

  /** Past results for every assessment of an item, keyed by assessment id. */
  async records(itemId: string): Promise<Record<string, AssessmentRecord>> {
    const rows = await this.db.all<Omit<AttemptRow, 'state'>>(
      `SELECT id, item_id, lesson_id, assessment_id, mode, started_at, finished_at, earned, total, passed
       FROM attempts WHERE item_id = ? ORDER BY COALESCE(finished_at, started_at)`,
      [itemId],
    );

    const records: Record<string, AssessmentRecord> = {};
    for (const row of rows) {
      const record = (records[row.assessment_id] ??= {
        finishedCount: 0,
        openAttemptId: null,
        last: null,
        bestPercent: null,
      });
      if (row.finished_at === null) {
        record.openAttemptId = row.id;
        continue;
      }
      const percent = toPercent(row.earned, row.total);
      record.finishedCount += 1;
      record.last = {
        attemptId: row.id,
        percent,
        passed: row.passed === null ? null : row.passed === 1,
        finishedAt: row.finished_at,
      };
      record.bestPercent = Math.max(record.bestPercent ?? 0, percent);
    }
    return records;
  }
}

function toPercent(earned: number | null, total: number | null): number {
  return earned !== null && total ? Math.round((earned / total) * 100) : 0;
}

function toAttempt(row: AttemptRow): Attempt {
  return {
    id: row.id,
    itemId: row.item_id,
    lessonId: row.lesson_id || null,
    assessmentId: row.assessment_id,
    mode: row.mode,
    state: JSON.parse(row.state) as SessionState,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    earned: row.earned,
    total: row.total,
    passed: row.passed === null ? null : row.passed === 1,
  };
}
