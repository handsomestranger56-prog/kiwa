import { clozeSegments } from '@/core/quiz/cloze';
import { type Course, parseDocument } from '@/core/schema';
import { sampleCourseInput } from '@/core/templates/samples';

import { nextLessonId, resumeLessonId } from './completion';

const parsed = parseDocument(sampleCourseInput);
if (!parsed.ok) throw new Error('sample rejected');
const course = parsed.document as Course;

describe('nextLessonId', () => {
  it('walks the lessons in order and stops at the end', () => {
    expect(nextLessonId(course, 'recall')).toBe('spacing');
    expect(nextLessonId(course, 'spacing')).toBe('mixing');
    expect(nextLessonId(course, 'mixing')).toBeNull();
    expect(nextLessonId(course, 'unknown')).toBeNull();
  });
});

describe('resumeLessonId', () => {
  const lessons = (done: string[]) => course.lessons.map((lesson) => ({ id: lesson.id, completed: done.includes(lesson.id) }));

  it('starts a new course at the first lesson', () => {
    expect(resumeLessonId(lessons([]), null)).toBe('recall');
  });

  it('returns to the lesson last opened while it is unfinished', () => {
    expect(resumeLessonId(lessons(['recall']), 'mixing')).toBe('mixing');
  });

  it('moves on to the first unfinished lesson once the last opened one is done', () => {
    expect(resumeLessonId(lessons(['recall', 'spacing']), 'spacing')).toBe('mixing');
    expect(resumeLessonId(lessons(['spacing']), 'spacing')).toBe('recall');
  });

  it('offers the first lesson again when everything is done', () => {
    expect(resumeLessonId(lessons(['recall', 'spacing', 'mixing']), 'mixing')).toBe('recall');
  });

  it('has nowhere to go in an empty course', () => {
    expect(resumeLessonId([], 'gone')).toBeNull();
  });
});

describe('clozeSegments', () => {
  it('numbers gaps in reading order and keeps the text between them', () => {
    expect(clozeSegments('Run git {{stage}} then git {{ save }}.')).toEqual([
      { kind: 'text', text: 'Run git ' },
      { kind: 'gap', gapId: 'stage', number: 1 },
      { kind: 'text', text: ' then git ' },
      { kind: 'gap', gapId: 'save', number: 2 },
      { kind: 'text', text: '.' },
    ]);
    expect(clozeSegments('{{a}}')).toEqual([{ kind: 'gap', gapId: 'a', number: 1 }]);
    expect(clozeSegments('plain')).toEqual([{ kind: 'text', text: 'plain' }]);
  });
});
