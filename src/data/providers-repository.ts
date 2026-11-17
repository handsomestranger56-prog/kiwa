import type { ModelInfo, ProviderKind } from '@/core/ai/types';
import { newId } from '@/core/ids';

import { ChangeFeed } from './changes';
import type { SqlDriver } from './sql';

/** A provider the user added. The API key is not here: it lives in the device's secure store. */
export type Provider = {
  id: string;
  kind: ProviderKind;
  label: string;
  /** Only used by the OpenAI-compatible kind, or to send Claude or Gemini requests through a proxy. */
  baseUrl: string | null;
  /** Models found by the last "Test and detect". */
  models: ModelInfo[];
  /** Model ids the user ticked. These are the ones offered when generating. */
  enabled: string[];
  createdAt: number;
  updatedAt: number;
};

/** One model the user can pick, with the provider it belongs to. */
export type ModelChoice = { providerId: string; providerLabel: string; kind: ProviderKind; model: string; label: string };

type Row = {
  id: string;
  kind: ProviderKind;
  label: string;
  base_url: string | null;
  models: string;
  enabled: string;
  created_at: number;
  updated_at: number;
};

const DEFAULT_KEY = 'ai.defaultModel';

export class ProvidersRepository {
  constructor(
    private readonly db: SqlDriver,
    private readonly changes: ChangeFeed = new ChangeFeed(),
    private readonly now: () => number = Date.now,
  ) {}

  async list(): Promise<Provider[]> {
    const rows = await this.db.all<Row>('SELECT * FROM providers ORDER BY created_at, id');
    return rows.map(toProvider);
  }

  async get(id: string): Promise<Provider | null> {
    const row = await this.db.first<Row>('SELECT * FROM providers WHERE id = ?', [id]);
    return row ? toProvider(row) : null;
  }

  /** Adds a provider, or updates the one with the same id. Returns its id. */
  async save(input: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
    const id = input.id ?? newId('p');
    const timestamp = this.now();
    // Only ticked models that were actually found are kept.
    const found = new Set(input.models.map((model) => model.id));
    const enabled = [...new Set(input.enabled)].filter((model) => found.has(model));

    await this.db.run(
      `INSERT INTO providers (id, kind, label, base_url, models, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, label = excluded.label, base_url = excluded.base_url,
         models = excluded.models, enabled = excluded.enabled, updated_at = excluded.updated_at`,
      [id, input.kind, input.label.trim(), input.baseUrl?.trim() || null, JSON.stringify(input.models), JSON.stringify(enabled), timestamp, timestamp],
    );
    await this.repairDefault();
    this.changes.notify();
    return id;
  }

  async remove(id: string): Promise<void> {
    await this.db.run('DELETE FROM providers WHERE id = ?', [id]);
    await this.repairDefault();
    this.changes.notify();
  }

  /** Every ticked model of every provider, in the order the providers were added. */
  async choices(): Promise<ModelChoice[]> {
    const providers = await this.list();
    return providers.flatMap((provider) =>
      provider.enabled.map((model) => ({
        providerId: provider.id,
        providerLabel: provider.label,
        kind: provider.kind,
        model,
        label: provider.models.find((info) => info.id === model)?.label ?? model,
      })),
    );
  }

  /** The model preselected when generating. Falls back to the first ticked model. */
  async defaultChoice(): Promise<ModelChoice | null> {
    const choices = await this.choices();
    const stored = await this.storedDefault();
    return choices.find((choice) => choice.providerId === stored?.providerId && choice.model === stored?.model) ?? choices[0] ?? null;
  }

  async setDefault(providerId: string, model: string): Promise<void> {
    await this.writeDefault({ providerId, model });
    this.changes.notify();
  }

  /** Keeps the stored default pointing at a model that is still ticked. */
  private async repairDefault(): Promise<void> {
    const stored = await this.storedDefault();
    const choices = await this.choices();
    if (stored && choices.some((choice) => choice.providerId === stored.providerId && choice.model === stored.model)) return;
    const first = choices[0];
    if (first) await this.writeDefault({ providerId: first.providerId, model: first.model });
    else await this.db.run('DELETE FROM settings WHERE key = ?', [DEFAULT_KEY]);
  }

  private async storedDefault(): Promise<{ providerId: string; model: string } | null> {
    const row = await this.db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', [DEFAULT_KEY]);
    if (!row) return null;
    try {
      const value = JSON.parse(row.value) as { providerId?: unknown; model?: unknown };
      return typeof value.providerId === 'string' && typeof value.model === 'string' ? { providerId: value.providerId, model: value.model } : null;
    } catch {
      return null;
    }
  }

  private async writeDefault(value: { providerId: string; model: string }): Promise<void> {
    await this.db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [DEFAULT_KEY, JSON.stringify(value)],
    );
  }
}

function toProvider(row: Row): Provider {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    baseUrl: row.base_url,
    models: JSON.parse(row.models) as ModelInfo[],
    enabled: JSON.parse(row.enabled) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
