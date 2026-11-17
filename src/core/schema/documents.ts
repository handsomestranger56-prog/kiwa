import { z } from 'zod';

import { blockSchema } from './blocks';
import { idSchema, languageSchema, levelSchema, tagsSchema, textSchema, titleSchema } from './primitives';
import { flashcardSchema, questionSchema } from './questions';

/**
 * How an assessment behaves.
 * - practice: feedback after every answer, unlimited retries
 * - test: score at the end, with a pass mark
 * - exam: like a test, optionally timed and drawn from a larger pool
 */
export const assessmentModeSchema = z.enum(['practice', 'test', 'exam']);
export type AssessmentMode = z.infer<typeof assessmentModeSchema>;

export const assessmentSchema = z.object({
  id: idSchema,
  title: titleSchema.optional(),
  mode: assessmentModeSchema.default('practice'),
  /** Share of points needed to pass, from 0 to 1. Used by test and exam. */
  passMark: z.number().min(0).max(1).default(0.7),
  timeLimitMinutes: z.number().int().positive().max(600).optional(),
  /** When set, each attempt draws this many questions at random. */
  sampleSize: z.number().int().positive().optional(),
  questions: z.array(questionSchema).default([]),
});
export type Assessment = z.infer<typeof assessmentSchema>;

export const lessonSchema = z.object({
  id: idSchema,
  title: titleSchema,
  summary: textSchema.optional(),
  /** Estimated reading time. */
  minutes: z.number().int().positive().max(600).optional(),
  blocks: z.array(blockSchema).default([]),
  assessments: z.array(assessmentSchema).default([]),
});
export type Lesson = z.infer<typeof lessonSchema>;

const meta = {
  id: idSchema,
  title: titleSchema,
  description: textSchema.optional(),
  language: languageSchema,
  level: levelSchema.optional(),
  tags: tagsSchema,
};

export const COURSE_FORMAT = 'course/1';
export const QUIZ_FORMAT = 'quiz/1';
export const DECK_FORMAT = 'deck/1';

export const courseSchema = z
  .object({
    format: z.literal(COURSE_FORMAT),
    ...meta,
    lessons: z.array(lessonSchema).default([]),
    finalExam: assessmentSchema.optional(),
  })
  .superRefine((course, ctx) => {
    reportDuplicates(ctx, 'lesson', course.lessons.map((lesson, index) => ({ id: lesson.id, path: ['lessons', index, 'id'] })));

    const assessments: Located[] = [];
    const questions: Located[] = [];
    course.lessons.forEach((lesson, lessonIndex) => {
      lesson.assessments.forEach((assessment, assessmentIndex) => {
        const path = ['lessons', lessonIndex, 'assessments', assessmentIndex];
        assessments.push({ id: assessment.id, path: [...path, 'id'] });
        assessment.questions.forEach((question, questionIndex) => {
          questions.push({ id: question.id, path: [...path, 'questions', questionIndex, 'id'] });
        });
      });
    });
    if (course.finalExam) {
      assessments.push({ id: course.finalExam.id, path: ['finalExam', 'id'] });
      course.finalExam.questions.forEach((question, questionIndex) => {
        questions.push({ id: question.id, path: ['finalExam', 'questions', questionIndex, 'id'] });
      });
    }
    reportDuplicates(ctx, 'assessment', assessments);
    reportDuplicates(ctx, 'question', questions);
  });
export type Course = z.infer<typeof courseSchema>;

export const quizSchema = z
  .object({
    format: z.literal(QUIZ_FORMAT),
    ...meta,
    assessment: assessmentSchema,
  })
  .superRefine((quiz, ctx) => {
    reportDuplicates(
      ctx,
      'question',
      quiz.assessment.questions.map((question, index) => ({
        id: question.id,
        path: ['assessment', 'questions', index, 'id'],
      })),
    );
  });
export type Quiz = z.infer<typeof quizSchema>;

export const deckSchema = z
  .object({
    format: z.literal(DECK_FORMAT),
    ...meta,
    cards: z.array(flashcardSchema).default([]),
  })
  .superRefine((deck, ctx) => {
    reportDuplicates(ctx, 'card', deck.cards.map((card, index) => ({ id: card.id, path: ['cards', index, 'id'] })));
  });
export type Deck = z.infer<typeof deckSchema>;

/** Anything the library can hold and a file can carry. */
export type LibraryDocument = Course | Quiz | Deck;
export type DocumentKind = 'course' | 'quiz' | 'deck';

export const DOCUMENT_KINDS = ['course', 'quiz', 'deck'] as const satisfies readonly DocumentKind[];

export const documentSchemas = {
  course: courseSchema,
  quiz: quizSchema,
  deck: deckSchema,
} as const;

export const formatByKind = {
  course: COURSE_FORMAT,
  quiz: QUIZ_FORMAT,
  deck: DECK_FORMAT,
} as const satisfies Record<DocumentKind, string>;

export function kindOf(document: LibraryDocument): DocumentKind {
  switch (document.format) {
    case COURSE_FORMAT:
      return 'course';
    case QUIZ_FORMAT:
      return 'quiz';
    case DECK_FORMAT:
      return 'deck';
  }
}

/** Lessons in a course, questions in a quiz, cards in a deck. */
export function unitCount(document: LibraryDocument): number {
  switch (document.format) {
    case COURSE_FORMAT:
      return document.lessons.length;
    case QUIZ_FORMAT:
      return document.assessment.questions.length;
    case DECK_FORMAT:
      return document.cards.length;
  }
}

type Located = { id: string; path: (string | number)[] };

function reportDuplicates(ctx: z.RefinementCtx, noun: string, entries: Located[]) {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      ctx.addIssue({
        code: 'custom',
        path: entry.path,
        message: `Another ${noun} already uses the id "${entry.id}".`,
      });
    }
    seen.add(entry.id);
  }
}
