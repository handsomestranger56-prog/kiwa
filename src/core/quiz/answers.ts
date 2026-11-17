import type { Question } from '../schema';

export type FlashcardRating = 'again' | 'hard' | 'good' | 'easy';
export const FLASHCARD_RATINGS = ['again', 'hard', 'good', 'easy'] as const satisfies readonly FlashcardRating[];

/** Self-ratings for an essay: missed it, partly, got it. */
export const ESSAY_RATINGS = [0, 0.5, 1] as const;
export type EssayRating = (typeof ESSAY_RATINGS)[number];

/** What a learner has entered for one question. One shape per question type. */
export type Answer =
  | { type: 'single_choice'; choice: number | null }
  | { type: 'multiple_choice'; choices: number[] }
  | { type: 'true_false'; value: boolean | null }
  | { type: 'short_answer'; text: string }
  | { type: 'cloze'; gaps: Record<string, string> }
  /** `submitted` locks the text and reveals the model answer. `rating` is the learner's own score. */
  | { type: 'essay'; text: string; submitted: boolean; rating: EssayRating | null }
  | { type: 'flashcard'; revealed: boolean; rating: FlashcardRating | null }
  /** For each left item, the position of the chosen right item in the question's `pairs`. */
  | { type: 'matching'; matches: (number | null)[] }
  /** Positions in the question's `items`, in the order the learner arranged them. Null until they move one. */
  | { type: 'ordering'; order: number[] | null }
  /** For each item, the position of the group it was put in. */
  | { type: 'categorize'; placements: (number | null)[] };

export type AnswerOf<T extends Answer['type']> = Extract<Answer, { type: T }>;

export function emptyAnswer(question: Question): Answer {
  switch (question.type) {
    case 'single_choice':
      return { type: 'single_choice', choice: null };
    case 'multiple_choice':
      return { type: 'multiple_choice', choices: [] };
    case 'true_false':
      return { type: 'true_false', value: null };
    case 'short_answer':
      return { type: 'short_answer', text: '' };
    case 'cloze':
      return { type: 'cloze', gaps: {} };
    case 'essay':
      return { type: 'essay', text: '', submitted: false, rating: null };
    case 'flashcard':
      return { type: 'flashcard', revealed: false, rating: null };
    case 'matching':
      return { type: 'matching', matches: question.pairs.map(() => null) };
    case 'ordering':
      return { type: 'ordering', order: null };
    case 'categorize':
      return { type: 'categorize', placements: question.items.map(() => null) };
  }
}

/** The stored answer if it fits the question, otherwise a fresh empty one. */
export function answerFor(question: Question, stored: Answer | undefined): Answer {
  return stored && stored.type === question.type ? stored : emptyAnswer(question);
}

/**
 * Essays and flashcards are graded by the learner: they reveal the answer and rate themselves.
 * Every other type is checked by the app.
 */
export function isSelfGraded(question: Question): boolean {
  return question.type === 'essay' || question.type === 'flashcard';
}

/** True once there is enough to grade. */
export function isAnswered(question: Question, stored: Answer | undefined): boolean {
  const answer = answerFor(question, stored);
  switch (answer.type) {
    case 'single_choice':
      return answer.choice !== null;
    case 'multiple_choice':
      return answer.choices.length > 0;
    case 'true_false':
      return answer.value !== null;
    case 'short_answer':
      return answer.text.trim() !== '';
    case 'cloze':
      return question.type === 'cloze' && question.gaps.every((gap) => (answer.gaps[gap.id] ?? '').trim() !== '');
    case 'essay':
    case 'flashcard':
      return answer.rating !== null;
    case 'matching':
      return question.type === 'matching' && question.pairs.every((_, index) => typeof answer.matches[index] === 'number');
    case 'ordering':
      return answer.order !== null;
    case 'categorize':
      return question.type === 'categorize' && question.items.every((_, index) => typeof answer.placements[index] === 'number');
  }
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
