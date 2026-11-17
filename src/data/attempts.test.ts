import { createSession, findAssessment, setAnswer } from '@/core/quiz/session';
import { type LibraryDocument, parseDocument } from '@/core/schema';
import { sampleCourseInput, sampleQuizInput } from '@/core/templates/samples';

import { AttemptsRepository } from './attempts-repository';
import { ChangeFeed } from './changes';
import { LibraryRepository } from './library-repository';
import { migrate } from './migrations';
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
  const now = () => (time += 10);
  const changes = new ChangeFeed();
  const library = new LibraryRepository(db, changes, now);
  const attempts = new AttemptsRepository(db, changes, now);
  const quiz = valid(sampleQuizInput);
  await library.add(quiz);
  await library.add(valid(sampleCourseInput));
  const assessment = findAssessment(quiz, 'git-quiz')!.assessment;
  const begin = () =>
    attempts.start({
      itemId: quiz.id,
      lessonId: null,
      assessmentId: assessment.id,
      mode: assessment.mode,
      state: createSession(assessment),
    });
  return { db, library, attempts, changes, quiz, assessment, begin };
}

describe('AttemptsRepository', () => {
  it('starts an attempt that can be found and resumed', async () => {
    const { attempts, begin } = await setup();
    const attempt = await begin();
    expect(attempt).toMatchObject({ itemId: 'sample-git', lessonId: null, mode: 'practice', finishedAt: null, passed: null });
    expect(attempt.state.questionIds).toHaveLength(5);
    expect((await attempts.findOpen('sample-git', 'git-quiz'))?.id).toBe(attempt.id);
    expect(await attempts.findOpen('sample-git', 'other')).toBeNull();
  });

  it('saves progress so an interrupted attempt continues where it stopped', async () => {
    const { attempts, begin } = await setup();
    const attempt = await begin();
    const state = { ...setAnswer(attempt.state, 'git-q1', { type: 'single_choice', choice: 0 }), index: 1 };
    await attempts.save(attempt.id, state);

    const resumed = await attempts.findOpen('sample-git', 'git-quiz');
    expect(resumed?.state.index).toBe(1);
    expect(resumed?.state.answers['git-q1']).toEqual({ type: 'single_choice', choice: 0 });
  });

  it('keeps only one unfinished attempt per assessment', async () => {
    const { attempts, begin, db } = await setup();
    const first = await begin();
    const second = await begin();
    expect(await attempts.get(first.id)).toBeNull();
    expect((await attempts.findOpen('sample-git', 'git-quiz'))?.id).toBe(second.id);
    expect(await db.first('SELECT COUNT(*) AS n FROM attempts')).toEqual({ n: 1 });
  });

  it('finishes an attempt once and then leaves it alone', async () => {
    const { attempts, begin } = await setup();
    const attempt = await begin();
    await attempts.finish(attempt.id, attempt.state, { earned: 4, total: 5, passed: null });
    await attempts.finish(attempt.id, attempt.state, { earned: 0, total: 5, passed: false });
    await attempts.save(attempt.id, { ...attempt.state, index: 3 });

    const stored = await attempts.get(attempt.id);
    expect(stored).toMatchObject({ earned: 4, total: 5, passed: null });
    expect(stored?.state.index).toBe(0);
    expect(stored?.finishedAt).not.toBeNull();
    expect(await attempts.findOpen('sample-git', 'git-quiz')).toBeNull();
  });

  it('summarises past results per assessment', async () => {
    const { attempts, begin } = await setup();
    expect(await attempts.records('sample-git')).toEqual({});

    const first = await begin();
    await attempts.finish(first.id, first.state, { earned: 5, total: 5, passed: true });
    const second = await begin();
    await attempts.finish(second.id, second.state, { earned: 2, total: 5, passed: false });
    const third = await begin();

    const record = (await attempts.records('sample-git'))['git-quiz'];
    expect(record.finishedCount).toBe(2);
    expect(record.openAttemptId).toBe(third.id);
    expect(record.bestPercent).toBe(100);
    expect(record.last).toMatchObject({ attemptId: second.id, percent: 40, passed: false });
  });

  it('records the lesson an attempt belongs to', async () => {
    const { attempts } = await setup();
    const course = valid(sampleCourseInput);
    const located = findAssessment(course, 'spacing-practice')!;
    const attempt = await attempts.start({
      itemId: course.id,
      lessonId: located.lessonId,
      assessmentId: located.assessment.id,
      mode: located.assessment.mode,
      state: createSession(located.assessment),
    });
    expect(attempt.lessonId).toBe('spacing');
  });

  it('discards an attempt on request', async () => {
    const { attempts, begin } = await setup();
    const attempt = await begin();
    await attempts.discard(attempt.id);
    expect(await attempts.get(attempt.id)).toBeNull();
  });

  it('goes away with its item', async () => {
    const { attempts, begin, library } = await setup();
    const attempt = await begin();
    await attempts.finish(attempt.id, attempt.state, { earned: 1, total: 5, passed: null });
    await library.remove('sample-git');
    expect(await attempts.get(attempt.id)).not.toBeNull();
    await library.purge('sample-git');
    expect(await attempts.get(attempt.id)).toBeNull();
  });

  it('notifies on start and finish but not on every saved answer', async () => {
    const { attempts, begin, changes } = await setup();
    const listener = jest.fn();
    changes.subscribe(listener);
    const attempt = await begin();
    await attempts.save(attempt.id, attempt.state);
    await attempts.save(attempt.id, attempt.state);
    expect(listener).toHaveBeenCalledTimes(1);
    await attempts.finish(attempt.id, attempt.state, { earned: 0, total: 5, passed: null });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('course position', () => {
  it('remembers the last opened lesson and forgets it with the course', async () => {
    const { library, db } = await setup();
    expect(await library.lastLesson('sample-learning')).toBeNull();
    await library.setLastLesson('sample-learning', 'recall');
    await library.setLastLesson('sample-learning', 'spacing');
    expect(await library.lastLesson('sample-learning')).toBe('spacing');

    await library.remove('sample-learning');
    await library.purge('sample-learning');
    expect(await db.first('SELECT COUNT(*) AS n FROM progress')).toEqual({ n: 0 });
  });
});
