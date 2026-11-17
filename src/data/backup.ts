import type { Backup, BackupItem } from '@/core/transfer/files';
import { BACKUP_FORMAT } from '@/core/transfer/repair';

import { ChangeFeed } from './changes';
import type { ItemSource, LibraryRepository } from './library-repository';
import type { ProvidersRepository } from './providers-repository';
import type { SqlDriver } from './sql';

type ItemMeta = { id: string; source: ItemSource; created_at: number; updated_at: number; deleted_at: number | null };
type MarkRow = { lesson_id: string; kind: BackupItem['marks'][number]['kind']; created_at: number };
type AttemptRow = {
  id: string;
  lesson_id: string;
  assessment_id: string;
  mode: BackupItem['attempts'][number]['mode'];
  state: string;
  started_at: number;
  finished_at: number | null;
  earned: number | null;
  total: number | null;
  passed: number | null;
};

/** Settings that describe this install and should not travel to another device. */
const LOCAL_SETTINGS = new Set(['samples.seeded', 'focus.timer', 'notify.scheduled', 'onboarding.done']);

/**
 * Copies everything on the device into one file and back: content, marks, results and settings.
 * API keys are kept in the device's secure store and are never part of a backup.
 */
export class BackupService {
  constructor(
    private readonly db: SqlDriver,
    private readonly library: LibraryRepository,
    private readonly providers: ProvidersRepository,
    private readonly changes: ChangeFeed = new ChangeFeed(),
    private readonly now: () => number = Date.now,
  ) {}

  async create(): Promise<Backup> {
    const metas = await this.db.all<ItemMeta>(
      'SELECT id, source, created_at, updated_at, deleted_at FROM items ORDER BY created_at, id',
    );

    const items: BackupItem[] = [];
    for (const meta of metas) {
      const document = await this.library.getDocument(meta.id);
      if (!document) continue;

      const marks = await this.db.all<MarkRow>(
        'SELECT lesson_id, kind, created_at FROM marks WHERE item_id = ? ORDER BY lesson_id, kind',
        [meta.id],
      );
      const progress = await this.db.first<{ lesson_id: string }>('SELECT lesson_id FROM progress WHERE item_id = ?', [
        meta.id,
      ]);
      const attempts = await this.db.all<AttemptRow>('SELECT * FROM attempts WHERE item_id = ? ORDER BY started_at, id', [
        meta.id,
      ]);

      items.push({
        document,
        source: meta.source,
        createdAt: meta.created_at,
        updatedAt: meta.updated_at,
        deletedAt: meta.deleted_at,
        marks: marks.map((mark) => ({ lessonId: mark.lesson_id, kind: mark.kind, createdAt: mark.created_at })),
        lastLesson: progress?.lesson_id ?? null,
        attempts: attempts.map((attempt) => ({
          id: attempt.id,
          lessonId: attempt.lesson_id,
          assessmentId: attempt.assessment_id,
          mode: attempt.mode,
          state: JSON.parse(attempt.state) as BackupItem['attempts'][number]['state'],
          startedAt: attempt.started_at,
          finishedAt: attempt.finished_at,
          earned: attempt.earned,
          total: attempt.total,
          passed: attempt.passed === null ? null : attempt.passed === 1,
        })),
      });
    }

    const settingRows = await this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings ORDER BY key');
    const settings: Record<string, string> = {};
    for (const row of settingRows) {
      if (!LOCAL_SETTINGS.has(row.key)) settings[row.key] = row.value;
    }

    const providers = (await this.providers.list()).map(({ id, kind, label, baseUrl, models, enabled }) => ({ id, kind, label, baseUrl, models, enabled }));
    const focusSessions = await this.db.all<{ id: string; item_id: string | null; started_at: number; ended_at: number; minutes: number; interruptions: number }>(
      'SELECT * FROM focus_sessions ORDER BY ended_at',
    );
    return {
      format: BACKUP_FORMAT,
      createdAt: this.now(),
      items,
      settings,
      providers,
      reviewCards: (
        await this.db.all<{ item_id: string; question_id: string; due_at: number; interval: number; ease: number; streak: number; lapses: number; last_reviewed_at: number | null }>(
          'SELECT * FROM review_cards ORDER BY item_id, question_id',
        )
      ).map((row) => ({ itemId: row.item_id, questionId: row.question_id, dueAt: row.due_at, interval: row.interval, ease: row.ease, streak: row.streak, lapses: row.lapses, lastReviewedAt: row.last_reviewed_at })),
      focusSessions: focusSessions.map((row) => ({ id: row.id, itemId: row.item_id, startedAt: row.started_at, endedAt: row.ended_at, minutes: row.minutes, interruptions: row.interruptions })),
    };
  }

  /**
   * Puts a backup onto the device. Items in the backup replace items with the same id,
   * together with their marks and results. Items that are not in the backup are left alone.
   * Either the whole backup is restored or nothing changes.
   */
  async restore(backup: Backup): Promise<{ items: number }> {
    await this.db.transaction(async () => {
      for (const item of backup.items) {
        const id = item.document.id;
        // Deleting the item removes its lessons, marks, results and position with it.
        await this.db.run('DELETE FROM items WHERE id = ?', [id]);
        await this.library.insertRows(item.document, {
          source: item.source,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          deletedAt: item.deletedAt,
        });

        for (const mark of item.marks) {
          await this.db.run('INSERT OR IGNORE INTO marks (item_id, lesson_id, kind, created_at) VALUES (?, ?, ?, ?)', [
            id,
            mark.lessonId,
            mark.kind,
            mark.createdAt,
          ]);
        }
        if (item.lastLesson) {
          await this.db.run('INSERT INTO progress (item_id, lesson_id, updated_at) VALUES (?, ?, ?)', [
            id,
            item.lastLesson,
            item.updatedAt,
          ]);
        }
        for (const attempt of item.attempts) {
          // The same attempt id under another item would be a different attempt, so it gets replaced too.
          await this.db.run('DELETE FROM attempts WHERE id = ?', [attempt.id]);
          await this.db.run(
            `INSERT INTO attempts (id, item_id, lesson_id, assessment_id, mode, state, started_at, finished_at, earned, total, passed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              attempt.id,
              id,
              attempt.lessonId,
              attempt.assessmentId,
              attempt.mode,
              JSON.stringify(attempt.state),
              attempt.startedAt,
              attempt.finishedAt,
              attempt.earned,
              attempt.total,
              attempt.passed === null ? null : attempt.passed ? 1 : 0,
            ],
          );
        }
      }

      for (const card of backup.reviewCards) {
        // A card is only kept when its item is on the device.
        await this.db.run(
          `INSERT OR REPLACE INTO review_cards (item_id, question_id, due_at, interval, ease, streak, lapses, last_reviewed_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM items WHERE id = ?)`,
          [card.itemId, card.questionId, card.dueAt, card.interval, card.ease, card.streak, card.lapses, card.lastReviewedAt, card.itemId],
        );
      }

      for (const session of backup.focusSessions) {
        await this.db.run(
          'INSERT OR REPLACE INTO focus_sessions (id, item_id, started_at, ended_at, minutes, interruptions) VALUES (?, ?, ?, ?, ?, ?)',
          [session.id, session.itemId, session.startedAt, session.endedAt, session.minutes, session.interruptions],
        );
      }

      for (const provider of backup.providers) {
        await this.db.run(
          `INSERT INTO providers (id, kind, label, base_url, models, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, label = excluded.label, base_url = excluded.base_url,
             models = excluded.models, enabled = excluded.enabled, updated_at = excluded.updated_at`,
          [provider.id, provider.kind, provider.label, provider.baseUrl, JSON.stringify(provider.models), JSON.stringify(provider.enabled), this.now(), this.now()],
        );
      }

      for (const [key, value] of Object.entries(backup.settings)) {
        if (LOCAL_SETTINGS.has(key)) continue;
        await this.db.run(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
          [key, value],
        );
      }
    });

    this.changes.notify();
    return { items: backup.items.length };
  }
}
