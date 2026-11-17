import { z } from 'zod';

import { idSchema, textSchema } from './primitives';

const base = {
  id: idSchema,
  prompt: textSchema,
  /** Shown after answering. Every question should have one. */
  explanation: textSchema.optional(),
  hint: textSchema.optional(),
  points: z.number().positive().max(100).default(1),
};

const optionsSchema = z.array(textSchema).min(2, 'Give at least two options.').max(8);
const acceptedSchema = z.array(textSchema).min(1, 'Give at least one accepted answer.');

export const singleChoiceSchema = z.object({
  ...base,
  type: z.literal('single_choice'),
  options: optionsSchema,
  /** Index into `options`, starting at 0. */
  answer: z.number().int().nonnegative(),
});

export const multipleChoiceSchema = z.object({
  ...base,
  type: z.literal('multiple_choice'),
  options: optionsSchema,
  /** Indexes into `options`, starting at 0. */
  answers: z.array(z.number().int().nonnegative()).min(1, 'Mark at least one correct option.'),
});

export const trueFalseSchema = z.object({
  ...base,
  type: z.literal('true_false'),
  answer: z.boolean(),
});

export const shortAnswerSchema = z.object({
  ...base,
  type: z.literal('short_answer'),
  /** Compared ignoring case, spacing and punctuation. */
  accepted: acceptedSchema,
});

export const clozeGapSchema = z.object({
  id: idSchema,
  accepted: acceptedSchema,
  /** When present the learner picks from these instead of typing. */
  options: optionsSchema.optional(),
});

export const clozeSchema = z.object({
  ...base,
  type: z.literal('cloze'),
  /** Text with one `{{gapId}}` placeholder per gap, for example "Git stores {{1}}." */
  text: textSchema,
  gaps: z.array(clozeGapSchema).min(1, 'Add at least one gap.'),
});

export const essaySchema = z.object({
  ...base,
  type: z.literal('essay'),
  /** What a good answer contains. Shown to the learner after answering and sent to the model on Check. */
  modelAnswer: textSchema,
  /** How to score the answer. Sent to the model on Check. */
  rubric: textSchema.optional(),
  minWords: z.number().int().positive().max(5000).optional(),
});

export const flashcardSchema = z.object({
  ...base,
  type: z.literal('flashcard'),
  /** The reverse side. `prompt` is the front. */
  back: textSchema,
});

export const questionSchema = z
  .discriminatedUnion('type', [
    singleChoiceSchema,
    multipleChoiceSchema,
    trueFalseSchema,
    shortAnswerSchema,
    clozeSchema,
    essaySchema,
    flashcardSchema,
  ])
  .superRefine((question, ctx) => {
    for (const issue of questionIssues(question)) {
      ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }
  });

export type Question = z.infer<typeof questionSchema>;
export type QuestionType = Question['type'];
export type Flashcard = z.infer<typeof flashcardSchema>;
export type ClozeQuestion = z.infer<typeof clozeSchema>;

export const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'short_answer',
  'cloze',
  'essay',
  'flashcard',
] as const satisfies readonly QuestionType[];

const GAP_PATTERN = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;

/** Gap ids in the order they appear in a cloze text. */
export function clozePlaceholders(text: string): string[] {
  return Array.from(text.matchAll(GAP_PATTERN), (match) => match[1]);
}

type Issue = { path: (string | number)[]; message: string };

/** Checks that span several fields of one question. */
function questionIssues(question: z.infer<typeof questionSchema>): Issue[] {
  const issues: Issue[] = [];

  if (question.type === 'single_choice' && question.answer >= question.options.length) {
    issues.push({
      path: ['answer'],
      message: `Answer ${question.answer} points past the last option (${question.options.length - 1}).`,
    });
  }

  if (question.type === 'multiple_choice') {
    question.answers.forEach((answer, index) => {
      if (answer >= question.options.length) {
        issues.push({
          path: ['answers', index],
          message: `Answer ${answer} points past the last option (${question.options.length - 1}).`,
        });
      }
    });
    if (new Set(question.answers).size !== question.answers.length) {
      issues.push({ path: ['answers'], message: 'The same option is listed twice.' });
    }
  }

  if (question.type === 'cloze') {
    const placeholders = clozePlaceholders(question.text);
    const gapIds = question.gaps.map((gap) => gap.id);
    if (new Set(gapIds).size !== gapIds.length) {
      issues.push({ path: ['gaps'], message: 'Two gaps share the same id.' });
    }
    if (new Set(placeholders).size !== placeholders.length) {
      issues.push({ path: ['text'], message: 'The same gap appears twice in the text.' });
    }
    gapIds.forEach((id, index) => {
      if (!placeholders.includes(id)) {
        issues.push({ path: ['gaps', index, 'id'], message: `The text has no {{${id}}} placeholder.` });
      }
    });
    for (const placeholder of new Set(placeholders)) {
      if (!gapIds.includes(placeholder)) {
        issues.push({ path: ['text'], message: `{{${placeholder}}} has no matching gap.` });
      }
    }
    question.gaps.forEach((gap, index) => {
      if (gap.options && !gap.accepted.some((answer) => gap.options?.includes(answer))) {
        issues.push({
          path: ['gaps', index, 'options'],
          message: 'None of the options is an accepted answer.',
        });
      }
    });
  }

  return issues;
}
