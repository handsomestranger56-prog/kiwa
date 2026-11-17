import { type Answer, emptyAnswer, isAnswered } from '../quiz/answers';
import { grade } from '../quiz/grading';
import { DECK_ASSESSMENT_ID } from '../quiz/session';
import { stableShuffle } from '../quiz/shuffle';
import { type Course, type Deck, type Question, type Quiz, QUESTION_TYPES, parseDocument, questionSchema } from '../schema';
import { sampleCourseInput, sampleDeckInput, sampleQuizInput } from '../templates/samples';
import { readImport } from '../transfer/files';
import { buildPrompt, defaultRequest } from '../transfer/prompt';
import {
  freshId,
  moveLesson,
  moveQuestion,
  putLesson,
  putLessonAssessment,
  putQuestion,
  removeAssessment,
  removeLesson,
  removeQuestion,
  setFinalExam,
  updateAssessment,
  updateMeta,
} from './document';
import { blankDraft, clozeGapIds, draftFromQuestion, questionFromDraft } from './drafts';

function load<T>(input: unknown): T {
  const result = parseDocument(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.document as T;
}
const course = load<Course>(sampleCourseInput);
const quiz = load<Quiz>(sampleQuizInput);
const deck = load<Deck>(sampleDeckInput);
const valid = (document: unknown) => expect(parseDocument(document)).toMatchObject({ ok: true });

function parseQuestion(input: unknown): Question {
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return parsed.data;
}

const matching = parseQuestion({
  id: 'm1',
  type: 'matching',
  prompt: 'Match the country to its capital.',
  pairs: [
    { left: 'France', right: 'Paris' },
    { left: 'Peru', right: 'Lima' },
    { left: 'Japan', right: 'Tokyo' },
  ],
});
const ordering = parseQuestion({ id: 'o1', type: 'ordering', prompt: 'Order the planets from the sun.', items: ['Mercury', 'Venus', 'Earth', 'Mars'] });
const categorize = parseQuestion({
  id: 'c1',
  type: 'categorize',
  prompt: 'Sort the animals.',
  categories: ['Mammal', 'Bird'],
  items: [
    { text: 'Whale', category: 0 },
    { text: 'Eagle', category: 1 },
    { text: 'Bat', category: 0 },
    { text: 'Penguin', category: 1 },
  ],
});

describe('new question types', () => {
  it('validates their rules', () => {
    const issues = (input: object) => {
      const parsed = questionSchema.safeParse(input);
      return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
    };
    expect(issues({ ...categorize, items: [{ text: 'Whale', category: 5 }, { text: 'Eagle', category: 1 }] })).toEqual(
      expect.arrayContaining(['Group 5 does not exist. The last group is 1.', 'No item belongs to this group.']),
    );
    expect(issues({ ...matching, pairs: [{ left: 'A', right: '1' }, { left: 'A', right: '2' }] })).toContain('Two pairs have the same left side.');
    expect(issues({ ...ordering, items: ['only one'] })).toContain('Give at least two items to put in order.');
  });

  it('starts empty and unanswered', () => {
    for (const question of [matching, ordering, categorize]) {
      expect(isAnswered(question, emptyAnswer(question))).toBe(false);
      expect(grade(question, undefined).score).toBe(0);
    }
  });

  it('grades matching per pair', () => {
    const answer = (matches: (number | null)[]): Answer => ({ type: 'matching', matches });
    expect(grade(matching, answer([0, 1, 2]))).toEqual({ score: 1, outcome: 'correct' });
    expect(grade(matching, answer([0, 2, 1])).score).toBeCloseTo(1 / 3);
    expect(isAnswered(matching, answer([0, null, 2]))).toBe(false);
    expect(isAnswered(matching, answer([0, 2, 1]))).toBe(true);
  });

  it('treats identical right sides as interchangeable', () => {
    const twins = parseQuestion({ ...matching, pairs: [{ left: 'A', right: 'same' }, { left: 'B', right: 'same' }] });
    expect(grade(twins, { type: 'matching', matches: [1, 0] }).score).toBe(1);
  });

  it('grades ordering per position', () => {
    expect(grade(ordering, { type: 'ordering', order: [0, 1, 2, 3] }).outcome).toBe('correct');
    expect(grade(ordering, { type: 'ordering', order: [1, 0, 2, 3] }).score).toBe(0.5);
    expect(grade(ordering, { type: 'ordering', order: null }).score).toBe(0);
  });

  it('grades sorting per item', () => {
    const answer = (placements: (number | null)[]): Answer => ({ type: 'categorize', placements });
    expect(grade(categorize, answer([0, 1, 0, 1])).outcome).toBe('correct');
    expect(grade(categorize, answer([0, 1, 1, 1])).score).toBe(0.75);
    expect(isAnswered(categorize, answer([0, 1, null, 1]))).toBe(false);
  });

  it('are described in prompts and survive an import with loose answers', () => {
    const prompt = buildPrompt({ ...defaultRequest, kind: 'quiz', topic: 'x', questionTypes: ['matching', 'ordering', 'categorize'] });
    for (const type of ['`matching`', '`ordering`', '`categorize`']) expect(prompt).toContain(type);

    const reply = {
      title: 'Animals',
      assessment: {
        questions: [
          { type: 'Sort into groups'.toLowerCase().replace(/ /g, '-') === 'x' ? 'x' : 'categorize', prompt: 'Sort.', categories: ['Mammal', 'Bird'], items: [{ text: 'Whale', category: 'Mammal' }, { text: 'Eagle', category: 'Bird' }] },
          { type: 'ordering', prompt: 'Order.', items: [{ text: 'one' }, { text: 'two' }] },
        ],
      },
    };
    const outcome = readImport(JSON.stringify(reply));
    if (!outcome.ok || outcome.kind !== 'document' || outcome.document.format !== 'quiz/1') throw new Error(JSON.stringify(outcome));
    expect(outcome.document.assessment.questions[0]).toMatchObject({ items: [{ category: 0 }, { category: 1 }] });
    expect(outcome.document.assessment.questions[1]).toMatchObject({ items: ['one', 'two'] });
  });
});

describe('stableShuffle', () => {
  it('is the same every time for the same seed and never the original order', () => {
    for (const seed of ['a', 'q-17', 'final-q3', '']) {
      for (const count of [2, 3, 5, 10]) {
        const order = stableShuffle(count, seed);
        expect(stableShuffle(count, seed)).toEqual(order);
        expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, index) => index));
        expect(order).not.toEqual(Array.from({ length: count }, (_, index) => index));
      }
    }
    expect(stableShuffle(1, 'x')).toEqual([0]);
    expect(stableShuffle(0, 'x')).toEqual([]);
  });
});

describe('document edits', () => {
  it('picks ids that nothing uses', () => {
    expect(freshId(course, 'lesson')).toBe('lesson-1');
    expect(freshId(deck, 'k')).toBe('k-1');
    const withOne = putLesson(course, { id: 'lesson-1', title: 'New', blocks: [], assessments: [] });
    expect(freshId(withOne, 'lesson')).toBe('lesson-2');
  });

  it('updates details and clears optional ones', () => {
    const next = updateMeta(course, { title: 'Renamed', description: undefined, language: 'es', level: undefined, tags: ['a'] });
    expect(next).toMatchObject({ title: 'Renamed', language: 'es', tags: ['a'] });
    expect(next).not.toHaveProperty('description');
    expect(next).not.toHaveProperty('level');
    expect(course.title).toBe('How to study so it sticks');
    valid(next);
  });

  it('adds, replaces, moves and removes lessons', () => {
    const added = putLesson(course, { id: 'extra', title: 'Extra', blocks: [], assessments: [] });
    expect(added.lessons.map((lesson) => lesson.id)).toEqual(['recall', 'spacing', 'mixing', 'extra']);
    expect(putLesson(added, { ...added.lessons[3], title: 'Changed' }).lessons[3].title).toBe('Changed');
    expect(moveLesson(added, 'extra', -2).lessons.map((lesson) => lesson.id)).toEqual(['recall', 'extra', 'spacing', 'mixing']);
    expect(moveLesson(added, 'recall', -1).lessons[0].id).toBe('recall');
    expect(moveLesson(added, 'extra', 1).lessons[3].id).toBe('extra');
    expect(removeLesson(added, 'spacing').lessons.map((lesson) => lesson.id)).toEqual(['recall', 'mixing', 'extra']);
    valid(removeLesson(added, 'spacing'));
  });

  it('adds assessments to a lesson and manages the final exam', () => {
    const withTest = putLessonAssessment(course, 'recall', { id: 'recall-test', mode: 'test', passMark: 0.8, questions: [] });
    expect(withTest.lessons[0].assessments.map((assessment) => assessment.id)).toEqual(['recall-practice', 'recall-test']);
    valid(withTest);

    const noExam = setFinalExam(course, null);
    expect(noExam).not.toHaveProperty('finalExam');
    expect(removeAssessment(course, 'final')).not.toHaveProperty('finalExam');
    expect(removeAssessment(course, 'recall-practice').lessons[0].assessments).toEqual([]);
    valid(setFinalExam(noExam, { id: 'exam', mode: 'exam', passMark: 0.7, questions: [] }));
  });

  it('changes assessment settings wherever the assessment lives', () => {
    const inLesson = updateAssessment(course, 'mixing-test', { title: undefined, mode: 'exam', passMark: 0.9, timeLimitMinutes: 10, sampleSize: undefined }) as Course;
    expect(inLesson.lessons[2].assessments[0]).toMatchObject({ mode: 'exam', passMark: 0.9, timeLimitMinutes: 10 });
    expect(inLesson.lessons[2].assessments[0]).not.toHaveProperty('title');
    expect(inLesson.lessons[2].assessments[0].questions).toHaveLength(2);

    const exam = updateAssessment(course, 'final', { title: 'Big one', mode: 'exam', passMark: 0.5 }) as Course;
    expect(exam.finalExam).toMatchObject({ title: 'Big one', passMark: 0.5 });
    const inQuiz = updateAssessment(quiz, 'git-quiz', { mode: 'test', passMark: 0.6 }) as Quiz;
    expect(inQuiz.assessment.mode).toBe('test');
    valid(inLesson);
    valid(inQuiz);
  });

  it('adds, replaces, moves and removes questions in lessons, exams, quizzes and decks', () => {
    const inLesson = putQuestion(course, 'recall-practice', matching) as Course;
    expect(inLesson.lessons[0].assessments[0].questions.map((question) => question.id)).toEqual(['recall-q1', 'recall-q2', 'recall-q3', 'm1']);
    valid(inLesson);

    const inExam = putQuestion(course, 'final', ordering) as Course;
    expect(inExam.finalExam?.questions).toHaveLength(4);

    const replaced = putQuestion(quiz, 'git-quiz', { ...quiz.assessment.questions[0], prompt: 'Changed?' }) as Quiz;
    expect(replaced.assessment.questions).toHaveLength(5);
    expect(replaced.assessment.questions[0].prompt).toBe('Changed?');

    const moved = moveQuestion(quiz, 'git-quiz', 'git-q5', -4) as Quiz;
    expect(moved.assessment.questions.map((question) => question.id)).toEqual(['git-q5', 'git-q1', 'git-q2', 'git-q3', 'git-q4']);
    expect((removeQuestion(quiz, 'git-quiz', 'git-q2') as Quiz).assessment.questions).toHaveLength(4);

    const card = parseQuestion({ id: 'k11', type: 'flashcard', prompt: 'Print', back: 'Ctrl + P' });
    const biggerDeck = putQuestion(deck, DECK_ASSESSMENT_ID, card) as Deck;
    expect(biggerDeck.cards).toHaveLength(11);
    expect((moveQuestion(biggerDeck, DECK_ASSESSMENT_ID, 'k11', -10) as Deck).cards[0].id).toBe('k11');
    expect((removeQuestion(biggerDeck, DECK_ASSESSMENT_ID, 'k1') as Deck).cards).toHaveLength(10);
    // A deck holds flashcards only.
    expect((putQuestion(deck, DECK_ASSESSMENT_ID, ordering) as Deck).cards).toHaveLength(10);
    valid(biggerDeck);
  });

  it('leaves the document alone when the assessment is unknown', () => {
    expect(putQuestion(course, 'nope', matching)).toEqual(course);
    expect(putQuestion(deck, 'nope', matching)).toBe(deck);
  });
});

describe('question drafts', () => {
  const everyQuestion: Question[] = [
    ...course.lessons.flatMap((lesson) => lesson.assessments.flatMap((assessment) => assessment.questions)),
    ...quiz.assessment.questions,
    deck.cards[0],
    matching,
    ordering,
    categorize,
  ];

  it('round-trips every question type without change', () => {
    expect(new Set(everyQuestion.map((question) => question.type)).size).toBe(QUESTION_TYPES.length);
    for (const question of everyQuestion) {
      expect(questionFromDraft(draftFromQuestion(question), question.id)).toEqual({ ok: true, question });
    }
  });

  it('reports what a blank draft still needs', () => {
    for (const type of QUESTION_TYPES) {
      const result = questionFromDraft(blankDraft(type), 'new');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues.map((issue) => issue.path)).toContain('prompt');
    }
  });

  it('drops empty option rows and keeps the right answer pointing at the same option', () => {
    const draft = { ...blankDraft('single_choice'), prompt: 'Pick', options: ['', 'wrong', '', 'right', ''], correct: [3] };
    const result = questionFromDraft(draft, 'q');
    expect(result).toMatchObject({ ok: true, question: { options: ['wrong', 'right'], answer: 1 } });

    const multi = { ...blankDraft('multiple_choice'), prompt: 'Pick', options: ['a', '', 'b', 'c'], correct: [3, 0] };
    expect(questionFromDraft(multi, 'q')).toMatchObject({ ok: true, question: { options: ['a', 'b', 'c'], answers: [0, 2] } });
  });

  it('needs a correct option to be chosen', () => {
    const draft = { ...blankDraft('single_choice'), prompt: 'Pick', options: ['a', 'b'], correct: [] };
    expect(questionFromDraft(draft, 'q').ok).toBe(false);
  });

  it('builds cloze gaps from the placeholders in the text', () => {
    const draft = {
      ...blankDraft('cloze'),
      prompt: 'Fill in.',
      text: 'The {{a}} is {{b}}.',
      gaps: { a: { accepted: 'sky, heavens', options: '' }, b: { accepted: 'blue', options: 'blue, green' }, old: { accepted: 'unused', options: '' } },
    };
    expect(clozeGapIds(draft)).toEqual(['a', 'b']);
    expect(questionFromDraft(draft, 'q')).toMatchObject({
      ok: true,
      question: { gaps: [{ id: 'a', accepted: ['sky', 'heavens'] }, { id: 'b', accepted: ['blue'], options: ['blue', 'green'] }] },
    });
    expect(questionFromDraft({ ...draft, gaps: {} }, 'q').ok).toBe(false);
  });

  it('keeps group positions right when an empty group row is dropped', () => {
    const draft = {
      ...blankDraft('categorize'),
      prompt: 'Sort',
      categories: ['', 'Fruit', 'Vegetable'],
      sortItems: [{ text: 'Apple', category: 1 }, { text: 'Carrot', category: 2 }, { text: '', category: 0 }],
    };
    expect(questionFromDraft(draft, 'q')).toMatchObject({
      ok: true,
      question: { categories: ['Fruit', 'Vegetable'], items: [{ text: 'Apple', category: 0 }, { text: 'Carrot', category: 1 }] },
    });
  });

  it('reads the optional essay fields', () => {
    const draft = { ...blankDraft('essay'), prompt: 'Explain.', modelAnswer: 'Because.', minWords: '30' };
    expect(questionFromDraft(draft, 'q')).toMatchObject({ ok: true, question: { minWords: 30 } });
    expect(questionFromDraft({ ...draft, minWords: 'many' }, 'q').ok).toBe(false);
  });
});
