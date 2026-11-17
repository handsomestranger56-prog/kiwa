import type { AssessmentMode, Question } from '../schema';
import { type Answer, type FlashcardRating, answerFor } from './answers';

export type Outcome = 'correct' | 'partial' | 'incorrect';

/** `score` is the share of the question's points earned, from 0 to 1. */
export type Grade = { score: number; outcome: Outcome };

const FLASHCARD_SCORE: Record<FlashcardRating, number> = { again: 0, hard: 0.5, good: 1, easy: 1 };

const PUNCTUATION = /[!-/:-@[-`{-~¡¿‘’“”«»…–—]/g;

/** Makes typed text comparable: case, spacing and punctuation are ignored, accents are kept. */
export function normalizeText(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(PUNCTUATION, ' ').replace(/\s+/g, ' ').trim();
}

export function matchesAccepted(accepted: readonly string[], text: string): boolean {
  const given = normalizeText(text);
  return given !== '' && accepted.some((candidate) => normalizeText(candidate) === given);
}

export function grade(question: Question, stored: Answer | undefined): Grade {
  return toGrade(scoreOf(question, answerFor(question, stored)));
}

function scoreOf(question: Question, answer: Answer): number {
  switch (question.type) {
    case 'single_choice':
      return answer.type === 'single_choice' && answer.choice === question.answer ? 1 : 0;

    case 'multiple_choice': {
      if (answer.type !== 'multiple_choice') return 0;
      const correct = new Set(question.answers);
      const chosen = new Set(answer.choices);
      let hits = 0;
      let misses = 0;
      for (const choice of chosen) {
        if (correct.has(choice)) hits += 1;
        else misses += 1;
      }
      // A wrong pick cancels a right one, so ticking everything earns nothing.
      return Math.max(0, hits - misses) / correct.size;
    }

    case 'true_false':
      return answer.type === 'true_false' && answer.value === question.answer ? 1 : 0;

    case 'short_answer':
      return answer.type === 'short_answer' && matchesAccepted(question.accepted, answer.text) ? 1 : 0;

    case 'cloze': {
      if (answer.type !== 'cloze') return 0;
      const right = question.gaps.filter((gap) => matchesAccepted(gap.accepted, answer.gaps[gap.id] ?? '')).length;
      return right / question.gaps.length;
    }

    case 'essay':
      return answer.type === 'essay' ? (answer.rating ?? 0) : 0;

    case 'flashcard':
      return answer.type === 'flashcard' && answer.rating ? FLASHCARD_SCORE[answer.rating] : 0;
  }
}

function toGrade(score: number): Grade {
  if (score >= 1) return { score: 1, outcome: 'correct' };
  if (score <= 0) return { score: 0, outcome: 'incorrect' };
  return { score, outcome: 'partial' };
}

export type QuestionResult = { questionId: string; grade: Grade; points: number; earned: number };

export type Summary = {
  results: QuestionResult[];
  earned: number;
  total: number;
  /** Whole percent, 0 to 100. */
  percent: number;
  counts: Record<Outcome, number>;
};

export function summarize(questions: readonly Question[], answers: Record<string, Answer>): Summary {
  const counts: Record<Outcome, number> = { correct: 0, partial: 0, incorrect: 0 };
  let earned = 0;
  let total = 0;

  const results = questions.map((question) => {
    const result = grade(question, answers[question.id]);
    counts[result.outcome] += 1;
    total += question.points;
    earned += question.points * result.score;
    return { questionId: question.id, grade: result, points: question.points, earned: question.points * result.score };
  });

  return { results, earned, total, percent: total > 0 ? Math.round((earned / total) * 100) : 0, counts };
}

/** Practice has no pass mark. Tests and exams pass at or above theirs. */
export function hasPassed(mode: AssessmentMode, passMark: number, summary: Pick<Summary, 'earned' | 'total'>): boolean | null {
  if (mode === 'practice') return null;
  if (summary.total <= 0) return false;
  // Compare with a small tolerance so 7 of 10 passes a 0.7 mark despite floating point.
  return summary.earned / summary.total + 1e-9 >= passMark;
}
