import {
  type Assessment,
  type LibraryDocument,
  type Question,
  COURSE_FORMAT,
  DECK_FORMAT,
  QUIZ_FORMAT,
} from '../schema';
import { type Answer, isAnswered, isSelfGraded } from './answers';

/** Everything needed to put an attempt back exactly where it was left. */
export type SessionState = {
  /** The questions of this attempt, in the order shown. */
  questionIds: string[];
  index: number;
  answers: Record<string, Answer>;
  /** Practice only: questions whose feedback has been shown. Their answers are locked. */
  checked: string[];
};

/** The id under which a deck's cards are studied. Decks have no assessment of their own. */
export const DECK_ASSESSMENT_ID = 'cards';

export type LocatedAssessment = { assessment: Assessment; lessonId: string | null; isFinalExam: boolean };

/** Finds an assessment anywhere in a document. A deck is studied as one practice round of its cards. */
export function findAssessment(document: LibraryDocument, assessmentId: string): LocatedAssessment | null {
  switch (document.format) {
    case COURSE_FORMAT: {
      for (const lesson of document.lessons) {
        const assessment = lesson.assessments.find((candidate) => candidate.id === assessmentId);
        if (assessment) return { assessment, lessonId: lesson.id, isFinalExam: false };
      }
      if (document.finalExam?.id === assessmentId) {
        return { assessment: document.finalExam, lessonId: null, isFinalExam: true };
      }
      return null;
    }
    case QUIZ_FORMAT:
      return document.assessment.id === assessmentId
        ? { assessment: document.assessment, lessonId: null, isFinalExam: false }
        : null;
    case DECK_FORMAT:
      return assessmentId === DECK_ASSESSMENT_ID
        ? {
            assessment: { id: DECK_ASSESSMENT_ID, mode: 'practice', passMark: 0, questions: document.cards },
            lessonId: null,
            isFinalExam: false,
          }
        : null;
  }
}

/** Starts an attempt. With `sampleSize`, a random subset in random order. Otherwise every question in order. */
export function createSession(assessment: Assessment, random: () => number = Math.random): SessionState {
  let ids = assessment.questions.map((question) => question.id);
  if (assessment.sampleSize && assessment.sampleSize < ids.length) {
    ids = shuffle(ids, random).slice(0, assessment.sampleSize);
  }
  return { questionIds: ids, index: 0, answers: {}, checked: [] };
}

/** The questions of an attempt. Ids that no longer exist, because the content was edited, are skipped. */
export function sessionQuestions(assessment: Assessment, state: SessionState): Question[] {
  const byId = new Map(assessment.questions.map((question) => [question.id, question]));
  return state.questionIds.flatMap((id) => byId.get(id) ?? []);
}

export function setAnswer(state: SessionState, questionId: string, answer: Answer): SessionState {
  if (state.checked.includes(questionId)) return state;
  return { ...state, answers: { ...state.answers, [questionId]: answer } };
}

export function markChecked(state: SessionState, questionId: string): SessionState {
  return state.checked.includes(questionId) ? state : { ...state, checked: [...state.checked, questionId] };
}

export function goTo(state: SessionState, index: number): SessionState {
  const last = Math.max(0, state.questionIds.length - 1);
  return { ...state, index: Math.min(Math.max(0, index), last) };
}

export function unansweredCount(questions: readonly Question[], state: SessionState): number {
  return questions.filter((question) => !isAnswered(question, state.answers[question.id])).length;
}

/**
 * Whether a question's right answer and explanation may be shown.
 * In practice that is after Check, or as soon as a self-graded question is rated.
 * Tests and exams reveal nothing until the attempt is submitted.
 */
export function isRevealed(question: Question, state: SessionState, practice: boolean): boolean {
  if (!practice) return false;
  if (isSelfGraded(question)) return isAnswered(question, state.answers[question.id]);
  return state.checked.includes(question.id);
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
