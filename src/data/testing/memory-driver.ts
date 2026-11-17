import Database from 'better-sqlite3';

import type { SqlDriver, SqlValue } from '../sql';

/** A real SQLite database in memory, for tests. Never imported by the app. */
export function createMemoryDriver(): SqlDriver & { close(): void } {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params: SqlValue[] = []) {
      return { changes: db.prepare(sql).run(...params).changes };
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async first<T>(sql: string, params: SqlValue[] = []) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async transaction<T>(work: () => Promise<T>) {
      db.exec('BEGIN');
      try {
        const result = await work();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}
