import type { ReviewCard } from '@/core/review/scheduler';

import { ChangeFeed } from './changes';
import type { SqlDriver } from './sql';

type Row = {
  item_id: string;
  question_id: string;
  due_at: number;
  interval: number;
  ease: number;
  streak: number;
  lapses: number;
  last_reviewed_at: number | null;
};

const toCard = (row: Row): ReviewCard => ({
  itemId: row.item_id,
  questionId: row.question_id,
  dueAt: row.due_at,
  interval: row.interval,
  ease: row.ease,
  streak: row.streak,
  lapses: row.lapses,
  lastReviewedAt: row.last_reviewed_at,
});

/** Questions scheduled for review. Cards of items in the trash are left out until restored. */
export class ReviewsRepository {
  constructor(
    private readonly db: SqlDriver,
    private readonly changes: ChangeFeed = new ChangeFeed(),
  ) {}

  async forItem(itemId: string): Promise<Map<string, ReviewCard>> {
    const rows = await this.db.all<Row>('SELECT * FROM review_cards WHERE item_id = ?', [itemId]);
    return new Map(rows.map((row) => [row.question_id, toCard(row)]));
  }

  async save(cards: ReviewCard[]): Promise<void> {
    if (cards.length === 0) return;
    await this.db.transaction(async () => {
      for (const card of cards) {
        await this.db.run(
          `INSERT INTO review_cards (item_id, question_id, due_at, interval, ease, streak, lapses, last_reviewed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (item_id, question_id) DO UPDATE SET due_at = excluded.due_at, interval = excluded.interval,
             ease = excluded.ease, streak = excluded.streak, lapses = excluded.lapses, last_reviewed_at = excluded.last_reviewed_at`,
          [card.itemId, card.questionId, card.dueAt, card.interval, card.ease, card.streak, card.lapses, card.lastReviewedAt],
        );
      }
    });
    this.changes.notify();
  }

  async remove(itemId: string, questionId: string): Promise<void> {
    await this.db.run('DELETE FROM review_cards WHERE item_id = ? AND question_id = ?', [itemId, questionId]);
    this.changes.notify();
  }

  /** Cards due by `now`, oldest first. */
  async due(now: number, limit = 50): Promise<ReviewCard[]> {
    const rows = await this.db.all<Row>(
      `SELECT r.* FROM review_cards r JOIN items i ON i.id = r.item_id
       WHERE i.deleted_at IS NULL AND r.due_at <= ? ORDER BY r.due_at, r.item_id, r.question_id LIMIT ?`,
      [now, limit],
    );
    return rows.map(toCard);
  }

  async counts(now: number, tomorrowEnd: number): Promise<{ due: number; dueTomorrow: number; total: number }> {
    const row = await this.db.first<{ due: number; tomorrow: number; total: number }>(
      `SELECT
         SUM(CASE WHEN r.due_at <= ? THEN 1 ELSE 0 END) AS due,
         SUM(CASE WHEN r.due_at > ? AND r.due_at <= ? THEN 1 ELSE 0 END) AS tomorrow,
         COUNT(*) AS total
       FROM review_cards r JOIN items i ON i.id = r.item_id WHERE i.deleted_at IS NULL`,
      [now, now, tomorrowEnd],
    );
    return { due: row?.due ?? 0, dueTomorrow: row?.tomorrow ?? 0, total: row?.total ?? 0 };
  }

  /** When the earliest card falls due, for the reminder. */
  async nextDueAt(): Promise<number | null> {
    const row = await this.db.first<{ at: number | null }>(
      'SELECT MIN(r.due_at) AS at FROM review_cards r JOIN items i ON i.id = r.item_id WHERE i.deleted_at IS NULL',
    );
    return row?.at ?? null;
  }

  async all(): Promise<ReviewCard[]> {
    return (await this.db.all<Row>('SELECT * FROM review_cards ORDER BY item_id, question_id')).map(toCard);
  }
}
