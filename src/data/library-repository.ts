import {
  type Assessment,
  type Course,
  type Deck,
  type DocumentKind,
  type Lesson,
  type Level,
  type LibraryDocument,
  type Quiz,
  COURSE_FORMAT,
  DECK_FORMAT,
  QUIZ_FORMAT,
  formatPath,
  kindOf,
  documentSchemas,
  unitCount,
} from '@/core/schema';

import { ChangeFeed } from './changes';
import { type SqlDriver, type SqlValue, likePattern } from './sql';

export type ItemSource = 'manual' | 'sample' | 'imported' | 'generated';
export type ItemMark = 'favorite' | 'completed';
export type LessonMark = 'bookmark' | 'completed';

/** What the library list shows. The full content is loaded only when an item is opened. */
export type LibraryItem = {
  id: string;
  kind: DocumentKind;
  title: string;
  description: string | null;
  language: string;
  level: Level | null;
  tags: string[];
  /** Lessons in a course, questions in a quiz, cards in a deck. */
  unitCount: number;
  source: ItemSource;
  favorite: boolean;
  completed: boolean;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type LessonSummary = {
  id: string;
  title: string;
  summary: string | null;
  minutes: number | null;
  questionCount: number;
  bookmarked: boolean;
  completed: boolean;
};

export type LibraryFilter = {
  kind?: DocumentKind;
  /** Matches title, description and tags. */
  search?: string;
  favorite?: boolean;
  /** List the trash instead of the library. */
  trashed?: boolean;
};

export class DuplicateItemError extends Error {
  constructor(public readonly id: string) {
    super(`An item with the id "${id}" already exists.`);
    this.name = 'DuplicateItemError';
  }
}

type ItemRow = {
  id: string;
  kind: DocumentKind;
  title: string;
  description: string | null;
  language: string;
  level: Level | null;
  tags: string;
  body: string;
  unit_count: number;
  source: ItemSource;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
  favorite: number;
  completed: number;
};

type LessonRow = {
  id: string;
  title: string;
  summary: string | null;
  minutes: number | null;
  body: string;
  bookmarked: number;
  completed: number;
};

const ITEM_COLUMNS = `
  i.id, i.kind, i.title, i.description, i.language, i.level, i.tags, i.body, i.unit_count, i.source,
  i.deleted_at, i.created_at, i.updated_at,
  EXISTS (SELECT 1 FROM marks m WHERE m.item_id = i.id AND m.lesson_id = '' AND m.kind = 'favorite') AS favorite,
  EXISTS (SELECT 1 FROM marks m WHERE m.item_id = i.id AND m.lesson_id = '' AND m.kind = 'completed') AS completed
`;

export class LibraryRepository {
  constructor(
    private readonly db: SqlDriver,
    private readonly changes: ChangeFeed = new ChangeFeed(),
    private readonly now: () => number = Date.now,
  ) {}

  async list(filter: LibraryFilter = {}): Promise<LibraryItem[]> {
    const where: string[] = [filter.trashed ? 'i.deleted_at IS NOT NULL' : 'i.deleted_at IS NULL'];
    const params: SqlValue[] = [];

    if (filter.kind) {
      where.push('i.kind = ?');
      params.push(filter.kind);
    }
    if (filter.favorite) {
      where.push(
        "EXISTS (SELECT 1 FROM marks m WHERE m.item_id = i.id AND m.lesson_id = '' AND m.kind = 'favorite')",
      );
    }
    const search = filter.search?.trim();
    if (search) {
      const pattern = likePattern(search);
      where.push(
        "(i.title LIKE ? ESCAPE '\\' OR i.description LIKE ? ESCAPE '\\' OR i.tags LIKE ? ESCAPE '\\')",
      );
      params.push(pattern, pattern, pattern);
    }

    const order = filter.trashed ? 'i.deleted_at DESC' : 'i.updated_at DESC';
    const rows = await this.db.all<ItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM items i WHERE ${where.join(' AND ')} ORDER BY ${order}, i.id`,
      params,
    );
    return rows.map(toItem);
  }

  async get(id: string): Promise<LibraryItem | null> {
    const row = await this.db.first<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM items i WHERE i.id = ?`, [id]);
    return row ? toItem(row) : null;
  }

  async trashCount(): Promise<number> {
    const row = await this.db.first<{ total: number }>(
      'SELECT COUNT(*) AS total FROM items WHERE deleted_at IS NOT NULL',
    );
    return row?.total ?? 0;
  }

  /** Lessons of a course, in order, with this device's marks. */
  async lessons(itemId: string): Promise<LessonSummary[]> {
    const rows = await this.db.all<LessonRow>(
      `SELECT l.id, l.title, l.summary, l.minutes, l.body,
         EXISTS (SELECT 1 FROM marks m WHERE m.item_id = l.item_id AND m.lesson_id = l.id AND m.kind = 'bookmark') AS bookmarked,
         EXISTS (SELECT 1 FROM marks m WHERE m.item_id = l.item_id AND m.lesson_id = l.id AND m.kind = 'completed') AS completed
       FROM lessons l WHERE l.item_id = ? ORDER BY l.position`,
      [itemId],
    );
    return rows.map((row) => {
      const body = JSON.parse(row.body) as Pick<Lesson, 'assessments'>;
      return {
        id: row.id,
        title: row.title,
        summary: row.summary,
        minutes: row.minutes,
        questionCount: body.assessments.reduce((total, assessment) => total + assessment.questions.length, 0),
        bookmarked: row.bookmarked === 1,
        completed: row.completed === 1,
      };
    });
  }

  /** The full course, quiz or deck, in the same shape a file has. */
  async getDocument(id: string): Promise<LibraryDocument | null> {
    const row = await this.db.first<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM items i WHERE i.id = ?`, [id]);
    if (!row) return null;

    const meta = {
      id: row.id,
      title: row.title,
      ...(row.description ? { description: row.description } : {}),
      language: row.language,
      ...(row.level ? { level: row.level } : {}),
      tags: JSON.parse(row.tags) as string[],
    };
    const body = JSON.parse(row.body);

    let candidate: unknown;
    if (row.kind === 'course') {
      const lessonRows = await this.db.all<LessonRow>(
        `SELECT id, title, summary, minutes, body, 0 AS bookmarked, 0 AS completed
         FROM lessons WHERE item_id = ? ORDER BY position`,
        [id],
      );
      candidate = {
        format: COURSE_FORMAT,
        ...meta,
        lessons: lessonRows.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          ...(lesson.summary ? { summary: lesson.summary } : {}),
          ...(lesson.minutes ? { minutes: lesson.minutes } : {}),
          ...JSON.parse(lesson.body),
        })),
        ...(body.finalExam ? { finalExam: body.finalExam } : {}),
      };
    } else if (row.kind === 'quiz') {
      candidate = { format: QUIZ_FORMAT, ...meta, assessment: body.assessment };
    } else {
      candidate = { format: DECK_FORMAT, ...meta, cards: body.cards };
    }

    const parsed = documentSchemas[row.kind].safeParse(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(`Stored ${row.kind} "${id}" is damaged at ${formatPath(first.path)}: ${first.message}`);
    }
    return parsed.data;
  }

  /** Adds a validated document to the library. Fails if its id is already taken. */
  async add(document: LibraryDocument, source: ItemSource = 'manual'): Promise<LibraryItem> {
    const kind = kindOf(document);
    const timestamp = this.now();

    await this.db.transaction(async () => {
      const existing = await this.db.first<{ id: string }>('SELECT id FROM items WHERE id = ?', [document.id]);
      if (existing) throw new DuplicateItemError(document.id);

      await this.db.run(
        `INSERT INTO items (id, kind, title, description, language, level, tags, body, unit_count, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          document.id,
          kind,
          document.title,
          document.description ?? null,
          document.language,
          document.level ?? null,
          JSON.stringify(document.tags),
          JSON.stringify(itemBody(document)),
          unitCount(document),
          source,
          timestamp,
          timestamp,
        ],
      );

      if (document.format === COURSE_FORMAT) {
        for (const [position, lesson] of document.lessons.entries()) {
          await this.db.run(
            `INSERT INTO lessons (item_id, id, position, title, summary, minutes, body) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              document.id,
              lesson.id,
              position,
              lesson.title,
              lesson.summary ?? null,
              lesson.minutes ?? null,
              JSON.stringify({ blocks: lesson.blocks, assessments: lesson.assessments }),
            ],
          );
        }
      }
    });

    this.changes.notify();
    return (await this.get(document.id)) as LibraryItem;
  }

  async rename(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) throw new Error('A title is required.');
    await this.db.run('UPDATE items SET title = ?, updated_at = ? WHERE id = ?', [trimmed, this.now(), id]);
    this.changes.notify();
  }

  async setMark(id: string, mark: ItemMark, on: boolean): Promise<void> {
    await this.writeMark(id, '', mark, on);
  }

  async setLessonMark(itemId: string, lessonId: string, mark: LessonMark, on: boolean): Promise<void> {
    await this.writeMark(itemId, lessonId, mark, on);
  }

  /** Moves an item to the trash. Nothing is lost until the trash is emptied. */
  async remove(id: string): Promise<void> {
    await this.db.run('UPDATE items SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [this.now(), id]);
    this.changes.notify();
  }

  async restore(id: string): Promise<void> {
    await this.db.run('UPDATE items SET deleted_at = NULL WHERE id = ?', [id]);
    this.changes.notify();
  }

  /** Deletes a trashed item for good, with its lessons and marks. */
  async purge(id: string): Promise<void> {
    await this.db.run('DELETE FROM items WHERE id = ? AND deleted_at IS NOT NULL', [id]);
    this.changes.notify();
  }

  async emptyTrash(): Promise<number> {
    const result = await this.db.run('DELETE FROM items WHERE deleted_at IS NOT NULL');
    this.changes.notify();
    return result.changes;
  }

  private async writeMark(itemId: string, lessonId: string, kind: string, on: boolean): Promise<void> {
    if (on) {
      await this.db.run(
        'INSERT OR IGNORE INTO marks (item_id, lesson_id, kind, created_at) VALUES (?, ?, ?, ?)',
        [itemId, lessonId, kind, this.now()],
      );
    } else {
      await this.db.run('DELETE FROM marks WHERE item_id = ? AND lesson_id = ? AND kind = ?', [
        itemId,
        lessonId,
        kind,
      ]);
    }
    this.changes.notify();
  }
}

type ItemBody = { finalExam?: Assessment } | { assessment: Quiz['assessment'] } | { cards: Deck['cards'] };

/** The part of a document that is not stored in its own columns or rows. */
function itemBody(document: LibraryDocument): ItemBody {
  switch (document.format) {
    case COURSE_FORMAT:
      return (document as Course).finalExam ? { finalExam: document.finalExam } : {};
    case QUIZ_FORMAT:
      return { assessment: document.assessment };
    case DECK_FORMAT:
      return { cards: document.cards };
  }
}

function toItem(row: ItemRow): LibraryItem {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    language: row.language,
    level: row.level,
    tags: JSON.parse(row.tags) as string[],
    unitCount: row.unit_count,
    source: row.source,
    favorite: row.favorite === 1,
    completed: row.completed === 1,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
