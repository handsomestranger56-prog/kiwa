import type { LocatedAssessment } from '@/core/quiz/session';
import { type Course, type LibraryDocument, COURSE_FORMAT, QUIZ_FORMAT } from '@/core/schema';
import type { AppData } from '@/data/provider';

/**
 * Marks an item as completed when finishing an attempt completes it:
 * a quiz that was finished and not failed, or a course whose final exam was passed.
 */
export async function applyAttemptCompletion(
  data: AppData,
  document: LibraryDocument,
  located: LocatedAssessment,
  passed: boolean | null,
): Promise<void> {
  const quizDone = document.format === QUIZ_FORMAT && passed !== false;
  const courseDone = document.format === COURSE_FORMAT && located.isFinalExam && passed === true;
  if (quizDone || courseDone) {
    await data.library.setMark(document.id, 'completed', true);
  }
}

/**
 * Marks a lesson as completed and returns the lesson to go to next, if any.
 * A course without a final exam is completed with its last lesson.
 */
export async function completeLesson(data: AppData, course: Course, lessonId: string): Promise<string | null> {
  await data.library.setLessonMark(course.id, lessonId, 'completed', true);

  const lessons = await data.library.lessons(course.id);
  if (!course.finalExam && lessons.length > 0 && lessons.every((lesson) => lesson.completed)) {
    await data.library.setMark(course.id, 'completed', true);
  }
  return nextLessonId(course, lessonId);
}

export function nextLessonId(course: Course, lessonId: string): string | null {
  const index = course.lessons.findIndex((lesson) => lesson.id === lessonId);
  return index >= 0 ? (course.lessons[index + 1]?.id ?? null) : null;
}

/** Where "Continue" should lead: the lesson last opened if unfinished, else the first unfinished one. */
export function resumeLessonId(
  lessons: readonly { id: string; completed: boolean }[],
  lastOpened: string | null,
): string | null {
  const last = lessons.find((lesson) => lesson.id === lastOpened);
  if (last && !last.completed) return last.id;
  return lessons.find((lesson) => !lesson.completed)?.id ?? lessons[0]?.id ?? null;
}
