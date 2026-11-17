import type { SQLiteDatabase } from 'expo-sqlite';

import type { SqlDriver, SqlValue } from './sql';

/** Adapts an expo-sqlite database to the small interface the repositories use. */
export function createExpoDriver(db: SQLiteDatabase): SqlDriver {
  return {
    exec: (sql) => db.execAsync(sql),
    async run(sql, params: SqlValue[] = []) {
      const result = await db.runAsync(sql, params);
      return { changes: result.changes };
    },
    all: <T>(sql: string, params: SqlValue[] = []) => db.getAllAsync<T>(sql, params),
    first: <T>(sql: string, params: SqlValue[] = []) => db.getFirstAsync<T>(sql, params),
    async transaction<T>(work: () => Promise<T>) {
      let result!: T;
      await db.withTransactionAsync(async () => {
        result = await work();
      });
      return result;
    },
  };
}
