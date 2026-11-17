import type { QuestionResult } from '@/core/quiz/grading';
import type { LocatedAssessment, SessionState } from '@/core/quiz/session';
import { cardsAfterAttempt, qualityFromOutcome, qualityFromRating } from '@/core/review/scheduler';
import { type Course, type LibraryDocument, type Question, COURSE_FORMAT, QUIZ_FORMAT } from '@/core/schema';
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

/** Puts missed questions and studied flashcards into the review queue, and moves known cards on. */
export async function scheduleReviews(data: AppData, itemId: string, questions: readonly Question[], session: SessionState, results: QuestionResult[]): Promise<void> {
  const existing = await data.reviews.forItem(itemId);
  const byId = new Map(questions.map((question) => [question.id, question]));
  const graded = results.flatMap((result) => {
    const question = byId.get(result.questionId);
    if (!question) return [];
    const answer = session.answers[result.questionId];
    const quality = answer?.type === 'flashcard' && answer.rating ? qualityFromRating(answer.rating) : qualityFromOutcome(result.grade.outcome);
    return [{ questionId: result.questionId, quality, flashcard: question.type === 'flashcard' }];
  });
  await data.reviews.save(cardsAfterAttempt(graded, existing, itemId, Date.now()));
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
