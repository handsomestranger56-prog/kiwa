import type { SqlDriver } from './sql';

/**
 * Schema changes in order. Entry N brings the database to version N + 1.
 * Never edit an entry that has shipped. Add a new one.
 */
export const migrations: readonly string[] = [
  // 1: library content, marks and key-value settings
  `
  CREATE TABLE items (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('course', 'quiz', 'deck')),
    title TEXT NOT NULL,
    description TEXT,
    language TEXT NOT NULL,
    level TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    body TEXT NOT NULL,
    unit_count INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'sample', 'imported', 'generated')),
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX items_listing ON items (deleted_at, updated_at);

  CREATE TABLE lessons (
    item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    minutes INTEGER,
    body TEXT NOT NULL,
    PRIMARY KEY (item_id, id)
  );
  CREATE INDEX lessons_order ON lessons (item_id, position);

  CREATE TABLE marks (
    item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL CHECK (kind IN ('favorite', 'bookmark', 'completed')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (item_id, lesson_id, kind)
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export const LATEST_VERSION = migrations.length;

/** Brings the database up to date. Each step commits together with its version number. */
export async function migrate(db: SqlDriver, steps: readonly string[] = migrations): Promise<void> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current > steps.length) {
    throw new Error(
      `This data was created by a newer version of the app (schema ${current}, this app supports ${steps.length}).`,
    );
  }

  for (let version = current; version < steps.length; version += 1) {
    await db.transaction(async () => {
      await db.exec(steps[version]);
      await db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
