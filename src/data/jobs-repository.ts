import { type Job, type JobError, type JobState, type JobStatus, emptyState } from '@/core/generate/plan';
import { newId } from '@/core/ids';
import type { CreateRequest } from '@/core/transfer/prompt';

import { ChangeFeed } from './changes';
import type { SqlDriver } from './sql';

type Row = {
  id: string;
  request: string;
  model: string;
  status: JobStatus;
  state: string;
  error: string | null;
  saved_item_id: string | null;
  created_at: number;
  updated_at: number;
};

/** Generation runs, saved after every step so an interrupted run can carry on. */
export class JobsRepository {
  constructor(
    private readonly db: SqlDriver,
    private readonly changes: ChangeFeed = new ChangeFeed(),
    private readonly now: () => number = Date.now,
  ) {}

  async create(request: CreateRequest, model: Job['model']): Promise<Job> {
    const id = newId('j');
    const timestamp = this.now();
    await this.db.run(
      `INSERT INTO jobs (id, request, model, status, state, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, ?, ?)`,
      [id, JSON.stringify(request), JSON.stringify(model), JSON.stringify(emptyState()), timestamp, timestamp],
    );
    this.changes.notify();
    return (await this.get(id)) as Job;
  }

  async get(id: string): Promise<Job | null> {
    const row = await this.db.first<Row>('SELECT * FROM jobs WHERE id = ?', [id]);
    return row ? toJob(row) : null;
  }

  /** Runs that are going, waiting for the user, or finished but not yet added to the library. */
  async open(): Promise<Job[]> {
    const rows = await this.db.all<Row>(
      "SELECT * FROM jobs WHERE status IN ('running', 'outline', 'ready', 'failed') ORDER BY created_at DESC",
    );
    return rows.map(toJob);
  }

  async running(): Promise<Job[]> {
    const rows = await this.db.all<Row>("SELECT * FROM jobs WHERE status = 'running' ORDER BY created_at");
    return rows.map(toJob);
  }

  async update(id: string, changes: { status?: JobStatus; state?: JobState; error?: JobError | null; savedItemId?: string; model?: Job['model'] }): Promise<void> {
    const sets: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [this.now()];
    if (changes.status) {
      sets.push('status = ?');
      params.push(changes.status);
    }
    if (changes.state) {
      sets.push('state = ?');
      params.push(JSON.stringify(changes.state));
    }
    if (changes.error !== undefined) {
      sets.push('error = ?');
      params.push(changes.error ? JSON.stringify(changes.error) : null);
    }
    if (changes.model) {
      sets.push('model = ?');
      params.push(JSON.stringify(changes.model));
    }
    if (changes.savedItemId) {
      sets.push('saved_item_id = ?');
      params.push(changes.savedItemId);
    }
    await this.db.run(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    this.changes.notify();
  }

  async remove(id: string): Promise<void> {
    await this.db.run('DELETE FROM jobs WHERE id = ?', [id]);
    this.changes.notify();
  }
}

function toJob(row: Row): Job {
  return {
    id: row.id,
    request: JSON.parse(row.request) as CreateRequest,
    model: JSON.parse(row.model) as Job['model'],
    status: row.status,
    state: JSON.parse(row.state) as JobState,
    error: row.error ? (JSON.parse(row.error) as JobError) : null,
    savedItemId: row.saved_item_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
