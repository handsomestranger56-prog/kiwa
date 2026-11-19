import { type LibraryDocument, parseDocument } from '@/core/schema';
import { sampleCourseInput, sampleDeckInput, sampleQuizInput } from '@/core/templates/samples';
import { readImport } from '@/core/transfer/files';

import { BackupService } from './backup';
import { ChangeFeed } from './changes';
import { GroupsRepository } from './groups-repository';
import { LibraryRepository } from './library-repository';
import { migrate } from './migrations';
import { ProvidersRepository } from './providers-repository';
import { createMemoryDriver } from './testing/memory-driver';

function valid(input: unknown): LibraryDocument {
  const result = parseDocument(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.document;
}

async function device() {
  const db = createMemoryDriver();
  await migrate(db);
  let time = 1000;
  const now = () => (time += 1);
  const changes = new ChangeFeed();
  const library = new LibraryRepository(db, changes, now);
  const groups = new GroupsRepository(db, changes, now);
  const backups = new BackupService(db, library, new ProvidersRepository(db, changes, now), changes, now);
  const course = valid(sampleCourseInput);
  const quiz = valid(sampleQuizInput);
  const deck = valid(sampleDeckInput);
  await library.add(course);
  await library.add(quiz);
  await library.add(deck);
  return { db, library, groups, backups, course, quiz, deck };
}

describe('groups', () => {
  it('sorts items into groups and lists them with counts', async () => {
    const d = await device();
    const biology = await d.groups.ensure('  Biology  ');
    const languages = await d.groups.ensure('Languages');
    await d.library.setGroup([d.course.id, d.quiz.id], biology.id);
    await d.library.setGroup([d.deck.id], languages.id);

    expect((await d.groups.list()).map((group) => [group.name, group.itemCount])).toEqual([
      ['Biology', 2],
      ['Languages', 1],
    ]);
    expect((await d.library.list({ groupId: biology.id })).map((item) => item.id).sort()).toEqual([d.course.id, d.quiz.id].sort());
    await d.library.setGroup([d.quiz.id], null);
    expect((await d.library.list({ groupId: 'none' })).map((item) => item.id)).toEqual([d.quiz.id]);
    expect((await d.library.get(d.course.id))?.groupId).toBe(biology.id);
  });

  it('reuses a group with the same name, whatever the case', async () => {
    const d = await device();
    const first = await d.groups.ensure('Biology');
    expect((await d.groups.ensure('biology')).id).toBe(first.id);
    expect(await d.groups.list()).toHaveLength(1);
  });

  it('keeps the items of a removed group, ungrouped', async () => {
    const d = await device();
    const group = await d.groups.ensure('Old');
    await d.library.setGroup([d.course.id], group.id);
    await d.groups.remove(group.id);
    expect(await d.groups.list()).toEqual([]);
    expect((await d.library.get(d.course.id))?.groupId).toBeNull();
  });

  it('keeps an item in its group when its content is replaced', async () => {
    const d = await device();
    const group = await d.groups.ensure('Keep');
    await d.library.setGroup([d.quiz.id], group.id);
    await d.library.replace({ ...d.quiz, title: 'New title' });
    expect((await d.library.get(d.quiz.id))?.groupId).toBe(group.id);
  });

  it('travels in a backup', async () => {
    const source = await device();
    const group = await source.groups.ensure('Biology');
    await source.library.setGroup([source.course.id], group.id);
    const backup = readImport(JSON.stringify(await source.backups.create()));
    if (!backup.ok || backup.kind !== 'backup') throw new Error('backup did not read back');

    const target = await device();
    await target.backups.restore(backup.backup);
    expect((await target.groups.list()).map((entry) => entry.name)).toEqual(['Biology']);
    expect((await target.library.get(source.course.id))?.groupId).toBe(group.id);
  });

  it('restores an old backup without groups', async () => {
    const source = await device();
    const old = await source.backups.create();
    const legacy = { ...old, groups: undefined, items: old.items.map(({ groupId: _drop, ...item }) => item) };
    const backup = readImport(JSON.stringify(legacy));
    if (!backup.ok || backup.kind !== 'backup') throw new Error('backup did not read back');
    const target = await device();
    await target.backups.restore(backup.backup);
    expect((await target.library.get(source.course.id))?.groupId).toBeNull();
  });
});
