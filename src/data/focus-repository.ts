import type { CompletedFocus } from '@/core/focus/pomodoro';
import { dayKey } from '@/core/focus/days';
import { newId } from '@/core/ids';

import { ChangeFeed } from './changes';
import type { SqlDriver } from './sql';

export type FocusSession = CompletedFocus & { id: string };

export type DayStats = { sessions: number; minutes: number; interruptions: number };

/** Finished focus sessions, and which days had any study at all. */
export class FocusRepository {
  constructor(
    private readonly db: SqlDriver,
    private readonly changes: ChangeFeed = new ChangeFeed(),
  ) {}

  async log(session: CompletedFocus): Promise<void> {
    await this.db.run(
      'INSERT INTO focus_sessions (id, item_id, started_at, ended_at, minutes, interruptions) VALUES (?, ?, ?, ?, ?, ?)',
      [newId('f'), session.itemId, session.startedAt, session.endedAt, session.minutes, session.interruptions],
    );
    this.changes.notify();
  }

  async all(): Promise<FocusSession[]> {
    const rows = await this.db.all<{ id: string; item_id: string | null; started_at: number; ended_at: number; minutes: number; interruptions: number }>(
      'SELECT * FROM focus_sessions ORDER BY ended_at',
    );
    return rows.map((row) => ({ id: row.id, itemId: row.item_id, startedAt: row.started_at, endedAt: row.ended_at, minutes: row.minutes, interruptions: row.interruptions }));
  }

  /** Totals for the local day that contains `now`. */
  async day(now: number, offsetMinutes: number): Promise<DayStats> {
    const today = dayKey(now, offsetMinutes);
    const sessions = (await this.all()).filter((session) => dayKey(session.endedAt, offsetMinutes) === today);
    return {
      sessions: sessions.length,
      minutes: sessions.reduce((total, session) => total + session.minutes, 0),
      interruptions: sessions.reduce((total, session) => total + session.interruptions, 0),
    };
  }

  /**
   * Local days with any study: a finished quiz, test, exam or card round, or a finished focus session.
   */
  async studyDays(offsetMinutes: number): Promise<Set<string>> {
    const rows = await this.db.all<{ at: number }>(
      `SELECT finished_at AS at FROM attempts WHERE finished_at IS NOT NULL
       UNION ALL SELECT ended_at AS at FROM focus_sessions`,
    );
    return new Set(rows.map((row) => dayKey(row.at, offsetMinutes)));
  }
}
