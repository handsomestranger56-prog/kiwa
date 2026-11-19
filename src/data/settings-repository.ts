import { ChangeFeed } from './changes';
import type { SqlDriver } from './sql';

export type SettingKey =
  | 'profile.name'
  | 'samples.seeded'
  | 'ai.defaultModel'
  | 'focus.settings'
  | 'focus.timer'
  | 'notify.settings'
  | 'notify.scheduled'
  | 'onboarding.done'
  | 'app.language'
  | 'notify.language';

/** Small non-secret values. API keys never go here. They belong in the device's secure store. */
export class SettingsRepository {
  constructor(
    private readonly db: SqlDriver,
    private readonly changes: ChangeFeed = new ChangeFeed(),
  ) {}

  async get(key: SettingKey): Promise<string | null> {
    const row = await this.db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return row?.value ?? null;
  }

  /** Like `set`, but screens are not told. For bookkeeping that nothing on screen shows. */
  async setQuietly(key: SettingKey, value: string): Promise<void> {
    await this.db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }

  async set(key: SettingKey, value: string): Promise<void> {
    await this.db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
    this.changes.notify();
  }

  async clear(key: SettingKey): Promise<void> {
    await this.db.run('DELETE FROM settings WHERE key = ?', [key]);
    this.changes.notify();
  }
}
