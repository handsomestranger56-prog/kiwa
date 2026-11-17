import { type LibraryDocument, parseDocument } from '@/core/schema';
import { blankDocument } from '@/core/templates/blank';
import { sampleCourseInput, sampleDeckInput, sampleQuizInput } from '@/core/templates/samples';

import { ChangeFeed } from './changes';
import { DuplicateItemError, LibraryRepository } from './library-repository';
import { LATEST_VERSION, migrate, migrations } from './migrations';
import { seedSamples } from './seed';
import { SettingsRepository } from './settings-repository';
import { likePattern } from './sql';
import { createMemoryDriver } from './testing/memory-driver';

function valid(input: unknown): LibraryDocument {
  const result = parseDocument(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.document;
}

async function setup() {
  const db = createMemoryDriver();
  await migrate(db);
  let time = 1000;
  const changes = new ChangeFeed();
  const library = new LibraryRepository(db, changes, () => (time += 1));
  const settings = new SettingsRepository(db, changes);
  return { db, changes, library, settings };
}

describe('migrate', () => {
  it('creates the schema and records the version', async () => {
    const db = createMemoryDriver();
    await migrate(db);
    expect(await db.first('PRAGMA user_version')).toEqual({ user_version: LATEST_VERSION });
    const tables = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    expect(tables.map((table) => table.name)).toEqual(['attempts', 'items', 'lessons', 'marks', 'progress', 'settings']);
  });

  it('does nothing when already up to date', async () => {
    const db = createMemoryDriver();
    await migrate(db);
    await expect(migrate(db)).resolves.toBeUndefined();
  });

  it('applies only the steps a database is missing and keeps its data', async () => {
    const db = createMemoryDriver();
    await migrate(db, ['CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT);']);
    await db.run('INSERT INTO notes (text) VALUES (?)', ['kept']);
    await migrate(db, [
      'CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT);',
      'ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;',
    ]);
    expect(await db.all('SELECT text, pinned FROM notes')).toEqual([{ text: 'kept', pinned: 0 }]);
    expect(await db.first('PRAGMA user_version')).toEqual({ user_version: 2 });
  });

  it('rolls a failed step back completely', async () => {
    const db = createMemoryDriver();
    const broken = ['CREATE TABLE a (id INTEGER); CREATE TABLE a (id INTEGER);'];
    await expect(migrate(db, broken)).rejects.toThrow();
    expect(await db.first('PRAGMA user_version')).toEqual({ user_version: 0 });
    expect(await db.all("SELECT name FROM sqlite_master WHERE type = 'table'")).toEqual([]);
  });

  it('refuses a database written by a newer app', async () => {
    const db = createMemoryDriver();
    await db.exec(`PRAGMA user_version = ${migrations.length + 1}`);
    await expect(migrate(db)).rejects.toThrow(/newer version/);
  });
});

describe('LibraryRepository', () => {
  it('stores each kind and returns it unchanged', async () => {
    const { library } = await setup();
    for (const input of [sampleCourseInput, sampleQuizInput, sampleDeckInput]) {
      const document = valid(input);
      await library.add(document, 'sample');
      expect(await library.getDocument(document.id)).toEqual(document);
    }
  });

  it('lists newest first with what a row needs to show', async () => {
    const { library } = await setup();
    await library.add(valid(sampleCourseInput), 'sample');
    await library.add(valid(sampleDeckInput), 'sample');

    const items = await library.list();
    expect(items.map((item) => item.id)).toEqual(['sample-shortcuts', 'sample-learning']);
    expect(items[1]).toMatchObject({
      kind: 'course',
      title: 'How to study so it sticks',
      unitCount: 3,
      level: 'beginner',
      tags: ['study skills', 'memory'],
      source: 'sample',
      favorite: false,
      completed: false,
      deletedAt: null,
    });
  });

  it('filters by kind, favorite and search text', async () => {
    const { library } = await setup();
    await library.add(valid(sampleCourseInput));
    await library.add(valid(sampleQuizInput));
    await library.add(valid(sampleDeckInput));
    await library.setMark('sample-git', 'favorite', true);

    const ids = async (filter: Parameters<LibraryRepository['list']>[0]) =>
      (await library.list(filter)).map((item) => item.id);

    expect(await ids({ kind: 'deck' })).toEqual(['sample-shortcuts']);
    expect(await ids({ favorite: true })).toEqual(['sample-git']);
    expect(await ids({ search: 'STICKS' })).toEqual(['sample-learning']);
    expect(await ids({ search: 'handful of Git' })).toEqual(['sample-git']);
    expect(await ids({ search: 'productivity' })).toEqual(['sample-shortcuts']);
    expect(await ids({ search: '  ' })).toHaveLength(3);
    expect(await ids({ search: 'git', kind: 'course' })).toEqual([]);
  });

  it('treats % and _ in a search as plain characters', async () => {
    const { library } = await setup();
    await library.add(blankDocument('deck', '100% recall'));
    await library.add(blankDocument('deck', 'snake_case names'));
    await library.add(blankDocument('deck', 'Other'));

    expect((await library.list({ search: '%' })).map((item) => item.title)).toEqual(['100% recall']);
    expect((await library.list({ search: '_' })).map((item) => item.title)).toEqual(['snake_case names']);
    expect(likePattern('50%_\\')).toBe('%50\\%\\_\\\\%');
  });

  it('refuses a second item with the same id and leaves the first intact', async () => {
    const { library, db } = await setup();
    const course = valid(sampleCourseInput);
    await library.add(course);
    await expect(library.add({ ...course, title: 'Impostor' })).rejects.toBeInstanceOf(DuplicateItemError);
    expect((await library.get(course.id))?.title).toBe(course.title);
    expect(await db.first('SELECT COUNT(*) AS n FROM lessons')).toEqual({ n: 3 });
  });

  it('renames and moves the item to the top', async () => {
    const { library } = await setup();
    await library.add(valid(sampleCourseInput));
    await library.add(valid(sampleDeckInput));
    await library.rename('sample-learning', '  Study better ');

    const items = await library.list();
    expect(items[0]).toMatchObject({ id: 'sample-learning', title: 'Study better' });
    await expect(library.rename('sample-learning', '   ')).rejects.toThrow('A title is required.');
  });

  it('sets and clears marks on items', async () => {
    const { library } = await setup();
    await library.add(valid(sampleDeckInput));

    await library.setMark('sample-shortcuts', 'favorite', true);
    await library.setMark('sample-shortcuts', 'favorite', true);
    await library.setMark('sample-shortcuts', 'completed', true);
    expect(await library.get('sample-shortcuts')).toMatchObject({ favorite: true, completed: true });

    await library.setMark('sample-shortcuts', 'favorite', false);
    expect(await library.get('sample-shortcuts')).toMatchObject({ favorite: false, completed: true });
  });

  it('lists lessons in order with their own marks', async () => {
    const { library } = await setup();
    await library.add(valid(sampleCourseInput));
    await library.setLessonMark('sample-learning', 'spacing', 'completed', true);
    await library.setLessonMark('sample-learning', 'mixing', 'bookmark', true);

    const lessons = await library.lessons('sample-learning');
    expect(lessons.map((lesson) => [lesson.id, lesson.questionCount, lesson.completed, lesson.bookmarked])).toEqual([
      ['recall', 3, false, false],
      ['spacing', 2, true, false],
      ['mixing', 2, false, true],
    ]);
    // A lesson mark is not an item mark.
    expect(await library.get('sample-learning')).toMatchObject({ completed: false });
  });

  it('moves items to the trash and back without losing anything', async () => {
    const { library } = await setup();
    const course = valid(sampleCourseInput);
    await library.add(course);
    await library.setMark(course.id, 'favorite', true);
    await library.setLessonMark(course.id, 'recall', 'completed', true);

    await library.remove(course.id);
    expect(await library.list()).toEqual([]);
    expect(await library.trashCount()).toBe(1);
    expect((await library.list({ trashed: true }))[0]).toMatchObject({ id: course.id, favorite: true });

    await library.restore(course.id);
    expect(await library.trashCount()).toBe(0);
    expect(await library.get(course.id)).toMatchObject({ favorite: true, deletedAt: null });
    expect((await library.lessons(course.id))[0].completed).toBe(true);
    expect(await library.getDocument(course.id)).toEqual(course);
  });

  it('only deletes for good from the trash, and takes lessons and marks along', async () => {
    const { library, db } = await setup();
    const course = valid(sampleCourseInput);
    await library.add(course);
    await library.setMark(course.id, 'favorite', true);

    await library.purge(course.id);
    expect(await library.get(course.id)).not.toBeNull();

    await library.remove(course.id);
    await library.purge(course.id);
    expect(await library.get(course.id)).toBeNull();
    expect(await library.getDocument(course.id)).toBeNull();
    expect(await db.first('SELECT COUNT(*) AS n FROM lessons')).toEqual({ n: 0 });
    expect(await db.first('SELECT COUNT(*) AS n FROM marks')).toEqual({ n: 0 });
  });

  it('empties the trash and leaves the library alone', async () => {
    const { library } = await setup();
    await library.add(valid(sampleCourseInput));
    await library.add(valid(sampleQuizInput));
    await library.add(valid(sampleDeckInput));
    await library.remove('sample-git');
    await library.remove('sample-shortcuts');

    expect(await library.emptyTrash()).toBe(2);
    expect((await library.list()).map((item) => item.id)).toEqual(['sample-learning']);
    expect(await library.trashCount()).toBe(0);
  });

  it('reports stored content that no longer matches the format', async () => {
    const { library, db } = await setup();
    await library.add(valid(sampleQuizInput));
    await db.run('UPDATE items SET body = ? WHERE id = ?', ['{"assessment":{"id":"a","questions":[{"id":"x"}]}}', 'sample-git']);
    await expect(library.getDocument('sample-git')).rejects.toThrow(/Stored quiz "sample-git" is damaged/);
  });

  it('tells listeners about every write', async () => {
    const { library, changes } = await setup();
    const listener = jest.fn();
    const unsubscribe = changes.subscribe(listener);

    const deck = blankDocument('deck', 'Verbs');
    await library.add(deck);
    await library.rename(deck.id, 'Irregular verbs');
    await library.setMark(deck.id, 'favorite', true);
    await library.remove(deck.id);
    await library.restore(deck.id);
    expect(listener).toHaveBeenCalledTimes(5);

    unsubscribe();
    await library.remove(deck.id);
    expect(listener).toHaveBeenCalledTimes(5);
  });
});

describe('SettingsRepository', () => {
  it('reads, overwrites and clears values', async () => {
    const { settings } = await setup();
    expect(await settings.get('profile.name')).toBeNull();
    await settings.set('profile.name', 'Ada');
    await settings.set('profile.name', 'Grace');
    expect(await settings.get('profile.name')).toBe('Grace');
    await settings.clear('profile.name');
    expect(await settings.get('profile.name')).toBeNull();
  });
});

describe('seedSamples', () => {
  it('adds one sample of each kind on first launch only', async () => {
    const { library, settings } = await setup();
    await seedSamples(library, settings);
    expect((await library.list()).map((item) => item.kind).sort()).toEqual(['course', 'deck', 'quiz']);
    expect((await library.list()).every((item) => item.source === 'sample')).toBe(true);

    await library.remove('sample-git');
    await library.purge('sample-git');
    await seedSamples(library, settings);
    expect(await library.get('sample-git')).toBeNull();
    expect(await library.list()).toHaveLength(2);
  });
});
