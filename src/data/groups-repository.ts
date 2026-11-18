import { newId } from '@/core/ids';

import { ChangeFeed } from './changes';
import type { SqlDriver } from './sql';

export type Group = { id: string; name: string; createdAt: number };
export type GroupSummary = Group & { itemCount: number };

export const GROUP_NAME_MAX = 60;

const clean = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, GROUP_NAME_MAX);

/** Groups the person sorts items into. Removing a group keeps its items, ungrouped. */
export class GroupsRepository {
  constructor(
    private readonly db: SqlDriver,
    private readonly changes: ChangeFeed = new ChangeFeed(),
    private readonly now: () => number = Date.now,
  ) {}

  /** Every group by name, with how many items outside the trash it holds. */
  async list(): Promise<GroupSummary[]> {
    const rows = await this.db.all<{ id: string; name: string; created_at: number; item_count: number }>(
      `SELECT g.id, g.name, g.created_at,
         (SELECT COUNT(*) FROM items i WHERE i.group_id = g.id AND i.deleted_at IS NULL) AS item_count
       FROM groups g ORDER BY g.name COLLATE NOCASE, g.id`,
    );
    return rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at, itemCount: row.item_count }));
  }

  async get(id: string): Promise<Group | null> {
    const row = await this.db.first<{ id: string; name: string; created_at: number }>('SELECT id, name, created_at FROM groups WHERE id = ?', [id]);
    return row ? { id: row.id, name: row.name, createdAt: row.created_at } : null;
  }

  /** The group with this name, ignoring case, or a new one. Imports use it so names do not repeat. */
  async ensure(name: string): Promise<Group> {
    const wanted = clean(name);
    if (!wanted) throw new Error('A group needs a name.');
    const existing = await this.db.first<{ id: string; name: string; created_at: number }>(
      'SELECT id, name, created_at FROM groups WHERE name = ? COLLATE NOCASE ORDER BY created_at LIMIT 1',
      [wanted],
    );
    if (existing) return { id: existing.id, name: existing.name, createdAt: existing.created_at };
    const group = { id: newId('g'), name: wanted, createdAt: this.now() };
    await this.db.run('INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)', [group.id, group.name, group.createdAt]);
    this.changes.notify();
    return group;
  }

  async rename(id: string, name: string): Promise<void> {
    const wanted = clean(name);
    if (!wanted) return;
    await this.db.run('UPDATE groups SET name = ? WHERE id = ?', [wanted, id]);
    this.changes.notify();
  }

  /** Deletes the group. Its items stay in the library without a group. */
  async remove(id: string): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.run('UPDATE items SET group_id = NULL WHERE group_id = ?', [id]);
      await this.db.run('DELETE FROM groups WHERE id = ?', [id]);
    });
    this.changes.notify();
  }

  /** Writes a group with a known id, as a restore does. Inside a transaction. */
  async put(group: Group): Promise<void> {
    await this.db.run(
      'INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name',
      [group.id, clean(group.name) || group.id, group.createdAt],
    );
  }
}
