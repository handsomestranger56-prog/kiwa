import { createSession, findAssessment } from '@/core/quiz/session';
import { type Course, type LibraryDocument, parseDocument } from '@/core/schema';
import { sampleCourseInput, sampleDeckInput, sampleQuizInput } from '@/core/templates/samples';
import { appendLesson, backupFile, readImport } from '@/core/transfer/files';

import { AttemptsRepository } from './attempts-repository';
import { BackupService } from './backup';
import { ChangeFeed } from './changes';
import { LibraryRepository } from './library-repository';
import { migrate } from './migrations';
import { ProvidersRepository } from './providers-repository';
import { SettingsRepository } from './settings-repository';
import { createMemoryDriver } from './testing/memory-driver';

function valid(input: unknown): LibraryDocument {
  const result = parseDocument(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.document;
}

async function device() {
  const db = createMemoryDriver();
  await migrate(db);
  let time = 5000;
  const now = () => (time += 10);
  const changes = new ChangeFeed();
  const library = new LibraryRepository(db, changes, now);
  const attempts = new AttemptsRepository(db, changes, now);
  const settings = new SettingsRepository(db, changes);
  const providers = new ProvidersRepository(db, changes, now);
  const backups = new BackupService(db, library, providers, changes, now);
  return { db, library, attempts, settings, providers, backups, changes };
}

/** A device with content, marks, a finished attempt, an open attempt, a trashed item and a name. */
async function usedDevice() {
  const d = await device();
  const course = valid(sampleCourseInput) as Course;
  await d.library.add(course, 'sample');
  await d.library.add(valid(sampleQuizInput), 'imported');
  await d.library.add(valid(sampleDeckInput), 'manual');

  await d.library.setMark(course.id, 'favorite', true);
  await d.library.setLessonMark(course.id, 'recall', 'completed', true);
  await d.library.setLessonMark(course.id, 'mixing', 'bookmark', true);
  await d.library.setLastLesson(course.id, 'spacing');
  await d.library.remove('sample-shortcuts');

  const exam = findAssessment(course, 'final')!.assessment;
  const done = await d.attempts.start({ itemId: course.id, lessonId: null, assessmentId: 'final', mode: 'exam', state: createSession(exam) });
  await d.attempts.finish(done.id, { ...done.state, answers: { 'final-q2': { type: 'true_false', value: false } } }, { earned: 1, total: 3, passed: false });
  const practice = findAssessment(course, 'recall-practice')!;
  const open = await d.attempts.start({ itemId: course.id, lessonId: 'recall', assessmentId: 'recall-practice', mode: 'practice', state: { ...createSession(practice.assessment), index: 2 } });

  await d.settings.set('profile.name', 'Ada');
  await d.settings.set('samples.seeded', '1');
  return { ...d, course, doneId: done.id, openId: open.id };
}

describe('LibraryRepository.replace', () => {
  it('swaps content and keeps marks, results and the creation date', async () => {
    const d = await usedDevice();
    const before = await d.library.get(d.course.id);
    const updated: Course = { ...d.course, title: 'Study better', lessons: d.course.lessons.slice(0, 2) };

    const item = await d.library.replace(updated, 'imported');
    expect(item).toMatchObject({ title: 'Study better', unitCount: 2, favorite: true, source: 'imported', createdAt: before?.createdAt });
    expect(item.updatedAt).toBeGreaterThan(before!.updatedAt);
    expect(await d.library.getDocument(d.course.id)).toEqual(updated);

    const lessons = await d.library.lessons(d.course.id);
    expect(lessons.map((lesson) => [lesson.id, lesson.completed])).toEqual([['recall', true], ['spacing', false]]);
    expect((await d.attempts.get(d.doneId))?.earned).toBe(1);
  });

  it('drops marks and the saved position for lessons that are gone', async () => {
    const d = await usedDevice();
    await d.library.setLastLesson(d.course.id, 'mixing');
    await d.library.replace({ ...d.course, lessons: d.course.lessons.slice(0, 1) });

    expect(await d.db.all("SELECT lesson_id, kind FROM marks WHERE item_id = ? AND lesson_id != ''", [d.course.id])).toEqual([
      { lesson_id: 'recall', kind: 'completed' },
    ]);
    expect(await d.library.lastLesson(d.course.id)).toBeNull();
  });

  it('keeps the saved position when its lesson survives', async () => {
    const d = await usedDevice();
    await d.library.replace(appendLesson(d.course, d.course.lessons[0]));
    expect(await d.library.lastLesson(d.course.id)).toBe('spacing');
    expect(await d.library.lessons(d.course.id)).toHaveLength(4);
  });

  it('brings a trashed item back and refuses an unknown id', async () => {
    const d = await usedDevice();
    const deck = valid(sampleDeckInput);
    expect((await d.library.replace(deck)).deletedAt).toBeNull();
    await expect(d.library.replace({ ...deck, id: 'missing' })).rejects.toThrow(/no item/);
    expect(await d.library.exists('missing')).toBe(false);
    expect(await d.library.exists(deck.id)).toBe(true);
  });
});

describe('BackupService', () => {
  it('captures content, marks, results, position and settings, but not local flags', async () => {
    const d = await usedDevice();
    const backup = await d.backups.create();

    expect(backup.format).toBe('backup/1');
    expect(backup.items.map((item) => item.document.id).sort()).toEqual(['sample-git', 'sample-learning', 'sample-shortcuts']);
    expect(backup.settings).toEqual({ 'profile.name': 'Ada' });

    const course = backup.items.find((item) => item.document.id === 'sample-learning')!;
    expect(course.source).toBe('sample');
    expect(course.lastLesson).toBe('spacing');
    expect(course.marks.map((mark) => `${mark.lessonId}:${mark.kind}`)).toEqual([':favorite', 'mixing:bookmark', 'recall:completed']);
    expect(course.attempts.map((attempt) => [attempt.id, attempt.finishedAt !== null, attempt.passed])).toEqual([
      [d.doneId, true, false],
      [d.openId, false, null],
    ]);
    expect(backup.items.find((item) => item.document.id === 'sample-shortcuts')?.deletedAt).not.toBeNull();
  });

  it('restores onto an empty device exactly, through the file format', async () => {
    const source = await usedDevice();
    const backup = await source.backups.create();
    const read = readImport(backupFile(backup).text);
    if (!read.ok || read.kind !== 'backup') throw new Error('backup did not read back');

    const target = await device();
    expect(await target.backups.restore(read.backup)).toEqual({ items: 3 });

    expect((await target.library.list()).map((item) => item.id).sort()).toEqual(['sample-git', 'sample-learning']);
    expect((await target.library.list({ trashed: true })).map((item) => item.id)).toEqual(['sample-shortcuts']);
    expect(await target.library.get('sample-learning')).toMatchObject({ favorite: true, source: 'sample' });
    expect(await target.library.getDocument('sample-learning')).toEqual(source.course);
    expect(await target.library.lastLesson('sample-learning')).toBe('spacing');
    expect((await target.library.lessons('sample-learning')).map((lesson) => [lesson.completed, lesson.bookmarked])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
    expect(await target.attempts.get(source.doneId)).toMatchObject({ earned: 1, total: 3, passed: false });
    expect((await target.attempts.findOpen('sample-learning', 'recall-practice'))?.state.index).toBe(2);
    expect(await target.settings.get('profile.name')).toBe('Ada');
    expect(await target.settings.get('samples.seeded')).toBeNull();

    // A backup of the restored device is the same backup.
    const again = await target.backups.create();
    expect({ ...again, createdAt: 0 }).toEqual({ ...backup, createdAt: 0 });
  });

  it('replaces items it contains and leaves the others alone', async () => {
    const source = await usedDevice();
    const backup = await source.backups.create();

    await source.library.rename('sample-learning', 'Changed after the backup');
    await source.library.setMark('sample-learning', 'favorite', false);
    await source.library.add({ ...valid(sampleDeckInput), id: 'made-later', title: 'Made later' });

    await source.backups.restore(backup);
    expect(await source.library.get('sample-learning')).toMatchObject({ title: 'How to study so it sticks', favorite: true });
    expect(await source.library.get('made-later')).not.toBeNull();
    expect(await source.db.first('SELECT COUNT(*) AS n FROM attempts')).toEqual({ n: 2 });
  });

  it('changes nothing if any part of the restore fails', async () => {
    const source = await usedDevice();
    const backup = await source.backups.create();
    const target = await device();
    await target.library.add(valid(sampleQuizInput));

    const broken = { ...backup, items: [...backup.items, { ...backup.items[0], attempts: [{ ...backup.items[0].attempts[0], mode: 'nonsense' as never }] }] };
    await expect(target.backups.restore(broken)).rejects.toThrow();
    expect((await target.library.list()).map((item) => item.id)).toEqual(['sample-git']);
    expect(await target.settings.get('profile.name')).toBeNull();
  });
});

describe('ProvidersRepository', () => {
  const claudeModels = [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  ];

  it('keeps only ticked models that were found, and offers them as choices', async () => {
    const d = await device();
    const id = await d.providers.save({ kind: 'claude', label: ' My Claude ', baseUrl: '  ', models: claudeModels, enabled: ['claude-haiku-5-5', 'gone', 'claude-haiku-5-5'] });
    expect(await d.providers.get(id)).toMatchObject({ label: 'My Claude', baseUrl: null, enabled: ['claude-haiku-5-5'] });
    expect(await d.providers.choices()).toEqual([{ providerId: id, providerLabel: 'My Claude', kind: 'claude', model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' }]);
  });

  it('keeps a default that still exists and moves it when it goes away', async () => {
    const d = await device();
    expect(await d.providers.defaultChoice()).toBeNull();

    const claude = await d.providers.save({ kind: 'claude', label: 'Claude', baseUrl: null, models: claudeModels, enabled: ['claude-opus-5-5', 'claude-haiku-5-5'] });
    expect((await d.providers.defaultChoice())?.model).toBe('claude-opus-5-5');

    const local = await d.providers.save({ kind: 'openai', label: 'Ollama', baseUrl: 'http://localhost:11434/v1', models: [{ id: 'llama4', label: 'llama4' }], enabled: ['llama4'] });
    await d.providers.setDefault(local, 'llama4');
    expect(await d.providers.defaultChoice()).toMatchObject({ providerId: local, model: 'llama4' });

    await d.providers.remove(local);
    expect(await d.providers.defaultChoice()).toMatchObject({ providerId: claude, model: 'claude-opus-5-5' });

    await d.providers.save({ id: claude, kind: 'claude', label: 'Claude', baseUrl: null, models: claudeModels, enabled: [] });
    expect(await d.providers.defaultChoice()).toBeNull();
    expect(await d.settings.get('ai.defaultModel')).toBeNull();
  });

  it('travels in a backup without any key, and comes back on restore', async () => {
    const source = await device();
    const id = await source.providers.save({ kind: 'gemini', label: 'Gemini', baseUrl: null, models: [{ id: 'gemini-3-pro', label: 'Gemini 3 Pro' }], enabled: ['gemini-3-pro'] });
    const backup = await source.backups.create();
    expect(backup.providers).toEqual([{ id, kind: 'gemini', label: 'Gemini', baseUrl: null, models: [{ id: 'gemini-3-pro', label: 'Gemini 3 Pro' }], enabled: ['gemini-3-pro'] }]);
    expect(JSON.stringify(backup)).not.toMatch(/key/i);

    const target = await device();
    const read = readImport(backupFile(backup).text);
    if (!read.ok || read.kind !== 'backup') throw new Error('backup did not read back');
    await target.backups.restore(read.backup);
    expect(await target.providers.defaultChoice()).toMatchObject({ providerId: id, model: 'gemini-3-pro' });
  });
});
