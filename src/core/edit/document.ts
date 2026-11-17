import { DECK_ASSESSMENT_ID } from '../quiz/session';
import {
  type Assessment,
  type Course,
  type Flashcard,
  type Lesson,
  type LibraryDocument,
  type Question,
  COURSE_FORMAT,
  DECK_FORMAT,
  QUIZ_FORMAT,
} from '../schema';

/**
 * Pure edits on a course, quiz or deck. Each returns a new document and leaves the old one alone,
 * so "undo" is simply saving the previous document again.
 */

/** Every id in use, so a new one can be chosen that clashes with nothing. */
function usedIds(document: LibraryDocument): Set<string> {
  const ids = new Set<string>();
  const collect = (assessment: Assessment | undefined) => {
    if (!assessment) return;
    ids.add(assessment.id);
    assessment.questions.forEach((question) => ids.add(question.id));
  };
  if (document.format === COURSE_FORMAT) {
    document.lessons.forEach((lesson) => {
      ids.add(lesson.id);
      lesson.assessments.forEach(collect);
    });
    collect(document.finalExam);
  } else if (document.format === QUIZ_FORMAT) {
    collect(document.assessment);
  } else {
    document.cards.forEach((card) => ids.add(card.id));
  }
  return ids;
}

/** An id such as `lesson-3` that nothing in the document uses yet. */
export function freshId(document: LibraryDocument, prefix: string): string {
  const used = usedIds(document);
  for (let number = 1; ; number += 1) {
    const candidate = `${prefix}-${number}`;
    if (!used.has(candidate)) return candidate;
  }
}

function move<T>(items: readonly T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (from < 0 || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function upsert<T extends { id: string }>(items: readonly T[], item: T): T[] {
  return items.some((existing) => existing.id === item.id)
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item];
}

export type Meta = Pick<LibraryDocument, 'title' | 'description' | 'language' | 'level' | 'tags'>;

export function updateMeta<T extends LibraryDocument>(document: T, meta: Meta): T {
  const next = { ...document, title: meta.title, language: meta.language, tags: meta.tags } as T;
  if (meta.description) next.description = meta.description;
  else delete next.description;
  if (meta.level) next.level = meta.level;
  else delete next.level;
  return next;
}

// ---- lessons

export function putLesson(course: Course, lesson: Lesson): Course {
  return { ...course, lessons: upsert(course.lessons, lesson) };
}

export function removeLesson(course: Course, lessonId: string): Course {
  return { ...course, lessons: course.lessons.filter((lesson) => lesson.id !== lessonId) };
}

export function moveLesson(course: Course, lessonId: string, delta: number): Course {
  const index = course.lessons.findIndex((lesson) => lesson.id === lessonId);
  return { ...course, lessons: move(course.lessons, index, delta) };
}

// ---- assessments

/** Applies a change to one assessment wherever it lives. A deck's cards count as an assessment. */
function mapAssessment(document: LibraryDocument, assessmentId: string, change: (assessment: Assessment) => Assessment): LibraryDocument {
  if (document.format === DECK_FORMAT) {
    if (assessmentId !== DECK_ASSESSMENT_ID) return document;
    const changed = change({ id: DECK_ASSESSMENT_ID, mode: 'practice', passMark: 0, questions: document.cards });
    return { ...document, cards: changed.questions.filter((question): question is Flashcard => question.type === 'flashcard') };
  }
  if (document.format === QUIZ_FORMAT) {
    return document.assessment.id === assessmentId ? { ...document, assessment: change(document.assessment) } : document;
  }
  return {
    ...document,
    lessons: document.lessons.map((lesson) => ({
      ...lesson,
      assessments: lesson.assessments.map((assessment) => (assessment.id === assessmentId ? change(assessment) : assessment)),
    })),
    ...(document.finalExam?.id === assessmentId ? { finalExam: change(document.finalExam) } : {}),
  };
}

/** Adds an assessment to a lesson, or replaces the one with the same id. */
export function putLessonAssessment(course: Course, lessonId: string, assessment: Assessment): Course {
  return {
    ...course,
    lessons: course.lessons.map((lesson) => (lesson.id === lessonId ? { ...lesson, assessments: upsert(lesson.assessments, assessment) } : lesson)),
  };
}

export function setFinalExam(course: Course, exam: Assessment | null): Course {
  const { finalExam: _removed, ...rest } = course;
  return exam ? { ...rest, finalExam: exam } : rest;
}

export function removeAssessment(course: Course, assessmentId: string): Course {
  const withoutExam = course.finalExam?.id === assessmentId ? setFinalExam(course, null) : course;
  return {
    ...withoutExam,
    lessons: withoutExam.lessons.map((lesson) => ({
      ...lesson,
      assessments: lesson.assessments.filter((assessment) => assessment.id !== assessmentId),
    })),
  };
}

export type AssessmentSettings = Pick<Assessment, 'title' | 'mode' | 'passMark' | 'timeLimitMinutes' | 'sampleSize'>;

export function updateAssessment(document: LibraryDocument, assessmentId: string, settings: AssessmentSettings): LibraryDocument {
  return mapAssessment(document, assessmentId, (assessment) => {
    const next: Assessment = { id: assessment.id, mode: settings.mode, passMark: settings.passMark, questions: assessment.questions };
    if (settings.title) next.title = settings.title;
    if (settings.timeLimitMinutes) next.timeLimitMinutes = settings.timeLimitMinutes;
    if (settings.sampleSize) next.sampleSize = settings.sampleSize;
    return next;
  });
}

// ---- questions

/** Adds a question to the end of an assessment, or replaces the one with the same id. */
export function putQuestion(document: LibraryDocument, assessmentId: string, question: Question): LibraryDocument {
  return mapAssessment(document, assessmentId, (assessment) => ({ ...assessment, questions: upsert(assessment.questions, question) }));
}

export function removeQuestion(document: LibraryDocument, assessmentId: string, questionId: string): LibraryDocument {
  return mapAssessment(document, assessmentId, (assessment) => ({
    ...assessment,
    questions: assessment.questions.filter((question) => question.id !== questionId),
  }));
}

export function moveQuestion(document: LibraryDocument, assessmentId: string, questionId: string, delta: number): LibraryDocument {
  return mapAssessment(document, assessmentId, (assessment) => {
    const index = assessment.questions.findIndex((question) => question.id === questionId);
    return { ...assessment, questions: move(assessment.questions, index, delta) };
  });
}
