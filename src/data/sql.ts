export type SqlValue = string | number | null;

/**
 * The few database operations the app needs. The device uses expo-sqlite,
 * tests use an in-memory SQLite, and repositories only ever see this interface.
 */
export interface SqlDriver {
  /** Runs one or more statements with no parameters. For schema changes only. */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  /** Commits if `work` resolves and rolls everything back if it throws. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

/** Escapes text for use inside a LIKE pattern with `ESCAPE '\'`. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
