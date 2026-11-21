import { parseInline, parseMarkdown } from '../markdown';
import { type Assessment, type Course, type Question, parseDocument } from '../schema';
import { sampleCourseInput, sampleDeckInput, sampleQuizInput } from '../templates/samples';
import { type Answer, answerFor, countWords, emptyAnswer, isAnswered, isSelfGraded } from './answers';
import { grade, hasPassed, matchesAccepted, normalizeText, summarize } from './grading';
import { seededOrder } from './shuffle';
import {
  DECK_ASSESSMENT_ID,
  createSession,
  findAssessment,
  goTo,
  isRevealed,
  markChecked,
  sessionQuestions,
  setAnswer,
  unansweredCount,
} from './session';

function load(input: unknown) {
  const result = parseDocument(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.document;
}

const course = load(sampleCourseInput) as Course;
const quiz = load(sampleQuizInput);
const deck = load(sampleDeckInput);

function question(id: string): Question {
  for (const document of [course, quiz, deck]) {
    const all =
      document.format === 'course/1'
        ? [...document.lessons.flatMap((lesson) => lesson.assessments), ...(document.finalExam ? [document.finalExam] : [])].flatMap(
            (assessment) => assessment.questions,
          )
        : document.format === 'quiz/1'
          ? document.assessment.questions
          : document.cards;
    const found = all.find((candidate) => candidate.id === id);
    if (found) return found;
  }
  throw new Error(`no question ${id}`);
}

describe('normalizeText', () => {
  it('ignores case, spacing and punctuation but keeps accents', () => {
    expect(normalizeText('  Retrieval   Practice! ')).toBe('retrieval practice');
    expect(normalizeText('“git-log”')).toBe('git log');
    expect(normalizeText('Café')).toBe('café');
    expect(normalizeText('Cafe')).not.toBe(normalizeText('Café'));
  });

  it('never matches an empty answer', () => {
    expect(matchesAccepted(['yes'], '   ')).toBe(false);
    expect(matchesAccepted(['...'], '...')).toBe(false);
    expect(matchesAccepted(['Git Log'], 'git log.')).toBe(true);
  });
});

describe('answers', () => {
  it('starts every type empty and unanswered', () => {
    for (const id of ['recall-q1', 'spacing-q1', 'recall-q2', 'recall-q3', 'spacing-q2', 'mixing-q2', 'k1']) {
      const q = question(id);
      expect(emptyAnswer(q).type).toBe(q.type);
      expect(isAnswered(q, undefined)).toBe(false);
      expect(grade(q, undefined)).toEqual({ score: 0, outcome: 'incorrect' });
    }
  });

  it('ignores a stored answer of the wrong type', () => {
    const q = question('recall-q1');
    expect(answerFor(q, { type: 'short_answer', text: 'x' })).toEqual({ type: 'single_choice', choice: null });
    expect(grade(q, { type: 'true_false', value: true }).score).toBe(0);
  });

  it('knows when each type has enough to grade', () => {
    expect(isAnswered(question('recall-q1'), { type: 'single_choice', choice: 0 })).toBe(true);
    expect(isAnswered(question('spacing-q1'), { type: 'multiple_choice', choices: [] })).toBe(false);
    expect(isAnswered(question('recall-q2'), { type: 'true_false', value: false })).toBe(true);
    expect(isAnswered(question('recall-q3'), { type: 'short_answer', text: '  ' })).toBe(false);
    expect(isAnswered(question('spacing-q2'), { type: 'cloze', gaps: { verb: 'fade' } })).toBe(false);
    expect(isAnswered(question('spacing-q2'), { type: 'cloze', gaps: { verb: 'fade', speed: 'slower' } })).toBe(true);
    expect(isAnswered(question('mixing-q2'), { type: 'essay', text: 'words', submitted: true, rating: null })).toBe(false);
    expect(isAnswered(question('mixing-q2'), { type: 'essay', text: 'words', submitted: true, rating: 0 })).toBe(true);
    expect(isAnswered(question('k1'), { type: 'flashcard', revealed: true, rating: null })).toBe(false);
  });

  it('separates self-graded types', () => {
    expect(isSelfGraded(question('mixing-q2'))).toBe(true);
    expect(isSelfGraded(question('k1'))).toBe(true);
    expect(isSelfGraded(question('recall-q1'))).toBe(false);
  });

  it('counts words', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  one   two\nthree ')).toBe(3);
  });
});

describe('grade', () => {
  it('single choice and true or false are all or nothing', () => {
    expect(grade(question('recall-q1'), { type: 'single_choice', choice: 2 })).toEqual({ score: 1, outcome: 'correct' });
    expect(grade(question('recall-q1'), { type: 'single_choice', choice: 0 }).outcome).toBe('incorrect');
    expect(grade(question('recall-q2'), { type: 'true_false', value: false }).outcome).toBe('correct');
    expect(grade(question('recall-q2'), { type: 'true_false', value: true }).outcome).toBe('incorrect');
  });

  it('multiple choice gives partial credit and punishes guessing', () => {
    const q = question('spacing-q1'); // correct: 0 and 2
    const pick = (choices: number[]): Answer => ({ type: 'multiple_choice', choices });
    expect(grade(q, pick([0, 2]))).toEqual({ score: 1, outcome: 'correct' });
    expect(grade(q, pick([2, 0])).score).toBe(1);
    expect(grade(q, pick([0]))).toEqual({ score: 0.5, outcome: 'partial' });
    expect(grade(q, pick([0, 1])).score).toBe(0);
    expect(grade(q, pick([0, 1, 2]))).toEqual({ score: 0.5, outcome: 'partial' });
    expect(grade(q, pick([0, 1, 2, 3])).score).toBe(0);
    expect(grade(q, pick([1, 3])).score).toBe(0);
  });

  it('short answer accepts any listed answer, loosely typed', () => {
    const q = question('recall-q3');
    expect(grade(q, { type: 'short_answer', text: ' Retrieval practice. ' }).outcome).toBe('correct');
    expect(grade(q, { type: 'short_answer', text: 'ACTIVE RECALL' }).outcome).toBe('correct');
    expect(grade(q, { type: 'short_answer', text: 'rereading' }).outcome).toBe('incorrect');
  });

  it('cloze is graded gap by gap', () => {
    const q = question('spacing-q2');
    expect(grade(q, { type: 'cloze', gaps: { verb: 'Fade', speed: 'slower' } }).outcome).toBe('correct');
    expect(grade(q, { type: 'cloze', gaps: { verb: 'weaken', speed: 'faster' } })).toEqual({ score: 0.5, outcome: 'partial' });
    expect(grade(q, { type: 'cloze', gaps: { verb: 'grow' } }).outcome).toBe('incorrect');
  });

  it('essays and flashcards use the learner’s own rating', () => {
    const essay = question('mixing-q2');
    expect(grade(essay, { type: 'essay', text: 'x', submitted: true, rating: 0.5 })).toEqual({ score: 0.5, outcome: 'partial' });
    expect(grade(essay, { type: 'essay', text: 'x', submitted: true, rating: 1 }).outcome).toBe('correct');
    expect(grade(essay, { type: 'essay', text: 'x', submitted: false, rating: null }).score).toBe(0);

    const card = question('k1');
    const rate = (rating: 'again' | 'hard' | 'good' | 'easy'): Answer => ({ type: 'flashcard', revealed: true, rating });
    expect(['again', 'hard', 'good', 'easy'].map((r) => grade(card, rate(r as never)).score)).toEqual([0, 0.5, 1, 1]);
  });
});

describe('summarize', () => {
  const assessment: Assessment = {
    id: 'a',
    mode: 'test',
    passMark: 0.7,
    questions: [
      { ...question('recall-q1'), points: 2 },
      { ...question('spacing-q1'), points: 2 },
      { ...question('recall-q2'), points: 1 },
    ],
  };

  it('weights questions by their points', () => {
    const summary = summarize(assessment.questions, {
      'recall-q1': { type: 'single_choice', choice: 2 },
      'spacing-q1': { type: 'multiple_choice', choices: [0] },
    });
    expect(summary.earned).toBe(3);
    expect(summary.total).toBe(5);
    expect(summary.percent).toBe(60);
    expect(summary.counts).toEqual({ correct: 1, partial: 1, incorrect: 1 });
    expect(summary.results.map((result) => result.earned)).toEqual([2, 1, 0]);
  });

  it('handles an empty assessment', () => {
    expect(summarize([], {})).toMatchObject({ earned: 0, total: 0, percent: 0 });
    expect(hasPassed('test', 0.7, { earned: 0, total: 0 })).toBe(false);
  });

  it('applies the pass mark to tests and exams only', () => {
    expect(hasPassed('practice', 0.7, { earned: 0, total: 5 })).toBeNull();
    expect(hasPassed('test', 0.7, { earned: 7, total: 10 })).toBe(true);
    expect(hasPassed('exam', 0.7, { earned: 6.9, total: 10 })).toBe(false);
    expect(hasPassed('test', 0.7, { earned: 0.7 * 3, total: 3 })).toBe(true);
  });
});

describe('findAssessment', () => {
  it('finds lesson assessments, the final exam, a quiz and a deck', () => {
    expect(findAssessment(course, 'spacing-practice')).toMatchObject({ lessonId: 'spacing', isFinalExam: false });
    expect(findAssessment(course, 'final')).toMatchObject({ lessonId: null, isFinalExam: true });
    expect(findAssessment(quiz, 'git-quiz')?.assessment.questions).toHaveLength(5);
    expect(findAssessment(course, 'nope')).toBeNull();
    expect(findAssessment(quiz, 'final')).toBeNull();
  });

  it('studies a deck as one practice round of its cards', () => {
    const located = findAssessment(deck, DECK_ASSESSMENT_ID);
    expect(located?.assessment.mode).toBe('practice');
    expect(located?.assessment.questions).toHaveLength(10);
    expect(findAssessment(deck, 'other')).toBeNull();
  });
});

describe('session', () => {
  const assessment = findAssessment(quiz, 'git-quiz')!.assessment;

  it('starts with every question in order', () => {
    const state = createSession(assessment);
    expect(state).toEqual({ questionIds: ['git-q1', 'git-q2', 'git-q3', 'git-q4', 'git-q5'], index: 0, answers: {}, checked: [] });
  });

  it('draws a random sample when asked', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const state = createSession({ ...assessment, sampleSize: 3 }, random);
    expect(state.questionIds).toHaveLength(3);
    expect(new Set(state.questionIds).size).toBe(3);
    expect(state.questionIds.every((id) => id.startsWith('git-q'))).toBe(true);
    expect(createSession({ ...assessment, sampleSize: 99 }).questionIds).toHaveLength(5);
  });

  it('skips questions that were removed from the content', () => {
    const state = { ...createSession(assessment), questionIds: ['git-q2', 'deleted', 'git-q1'] };
    expect(sessionQuestions(assessment, state).map((q) => q.id)).toEqual(['git-q2', 'git-q1']);
  });

  it('records answers until a question is checked, then locks it', () => {
    let state = createSession(assessment);
    state = setAnswer(state, 'git-q1', { type: 'single_choice', choice: 1 });
    state = setAnswer(state, 'git-q1', { type: 'single_choice', choice: 0 });
    state = markChecked(markChecked(state, 'git-q1'), 'git-q1');
    state = setAnswer(state, 'git-q1', { type: 'single_choice', choice: 2 });
    expect(state.answers['git-q1']).toEqual({ type: 'single_choice', choice: 0 });
    expect(state.checked).toEqual(['git-q1']);
  });

  it('keeps the position inside the attempt', () => {
    const state = createSession(assessment);
    expect(goTo(state, 3).index).toBe(3);
    expect(goTo(state, -4).index).toBe(0);
    expect(goTo(state, 40).index).toBe(4);
  });

  it('counts what is still unanswered', () => {
    let state = createSession(assessment);
    const questions = sessionQuestions(assessment, state);
    expect(unansweredCount(questions, state)).toBe(5);
    state = setAnswer(state, 'git-q2', { type: 'true_false', value: false });
    state = setAnswer(state, 'git-q3', { type: 'cloze', gaps: { stage: 'add' } });
    expect(unansweredCount(questions, state)).toBe(4);
  });

  it('reveals answers in practice only, and only when earned', () => {
    let state = createSession(assessment);
    const first = question('git-q1');
    state = setAnswer(state, 'git-q1', { type: 'single_choice', choice: 0 });
    expect(isRevealed(first, state, true)).toBe(false);
    state = markChecked(state, 'git-q1');
    expect(isRevealed(first, state, true)).toBe(true);
    expect(isRevealed(first, state, false)).toBe(false);

    const card = question('k1');
    const rated = { ...state, answers: { k1: { type: 'flashcard', revealed: true, rating: 'good' } as Answer } };
    expect(isRevealed(card, state, true)).toBe(false);
    expect(isRevealed(card, rated, true)).toBe(true);
    expect(isRevealed(card, rated, false)).toBe(false);
  });
});

describe('parseMarkdown', () => {
  it('splits paragraphs, headings and lists', () => {
    const blocks = parseMarkdown('# Title\n\nFirst line\nsame paragraph.\n\n- one\n- two\n  continued\n\n1. a\n2) b\n\nLast.');
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'paragraph']);
    expect(blocks[0]).toMatchObject({ level: 1, inlines: [{ text: 'Title' }] });
    expect(blocks[1]).toMatchObject({ inlines: [{ text: 'First line same paragraph.' }] });
    expect(blocks[2]).toMatchObject({ ordered: false, items: [[{ text: 'one' }], [{ text: 'two continued' }]] });
    expect(blocks[3]).toMatchObject({ ordered: true, items: [[{ text: 'a' }], [{ text: 'b' }]] });
  });

  it('separates a bulleted list from a numbered one', () => {
    const blocks = parseMarkdown('- a\n1. b');
    expect(blocks).toHaveLength(2);
  });

  it('handles inline styles', () => {
    expect(parseInline('Use **bold**, *italic*, _also_ and `code` here.')).toEqual([
      { text: 'Use ' },
      { text: 'bold', bold: true },
      { text: ', ' },
      { text: 'italic', italic: true },
      { text: ', ' },
      { text: 'also', italic: true },
      { text: ' and ' },
      { text: 'code', code: true },
      { text: ' here.' },
    ]);
  });

  it('leaves arithmetic and snake_case alone', () => {
    expect(parseInline('2 * 3 * 4 and snake_case_name')).toEqual([{ text: '2 * 3 * 4 and snake_case_name' }]);
    expect(parseInline('`a * b` stays code')).toEqual([{ text: 'a * b', code: true }, { text: ' stays code' }]);
  });

  it('follows web links only', () => {
    expect(parseInline('See [the docs](https://example.com/a).')).toEqual([
      { text: 'See ' },
      { text: 'the docs', href: 'https://example.com/a' },
      { text: '.' },
    ]);
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ text: '[x](javascript:alert(1))' }]);
  });

  it('returns nothing for empty text', () => {
    expect(parseMarkdown('  \n\n ')).toEqual([]);
  });
});

describe('seededOrder', () => {
  it('gives the same order for the same seed, and every position once', () => {
    expect(seededOrder(5, 'q1')).toEqual(seededOrder(5, 'q1'));
    expect([...seededOrder(5, 'q1')].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(seededOrder(1, 'q1')).toEqual([0]);
  });

  it('shows an option written first in every place about equally often', () => {
    for (const count of [2, 3, 4]) {
      const places = Array.from({ length: count }, () => 0);
      for (let index = 0; index < 600; index += 1) {
        places[seededOrder(count, `lesson-${index % 7}-q${index}`).indexOf(0)] += 1;
      }
      for (const times of places) expect(times / 600).toBeGreaterThan(0.6 / count);
    }
  });
});
