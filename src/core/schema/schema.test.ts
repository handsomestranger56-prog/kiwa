import { blankDocument } from '../templates/blank';
import { sampleCourseInput, sampleDeckInput, sampleInputs, sampleQuizInput } from '../templates/samples';
import { clozePlaceholders, documentJsonSchema, kindOf, parseDocument, unitCount } from './index';

function issuesOf(input: unknown) {
  const result = parseDocument(input);
  if (result.ok) throw new Error('Expected the document to be rejected.');
  return result.issues;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

describe('parseDocument', () => {
  it('accepts every bundled sample', () => {
    for (const input of sampleInputs) {
      const result = parseDocument(input);
      expect(result).toMatchObject({ ok: true });
    }
  });

  it('recognises the three kinds and counts their units', () => {
    const [course, quiz, deck] = sampleInputs.map((input) => {
      const result = parseDocument(input);
      if (!result.ok) throw new Error('sample rejected');
      return result.document;
    });
    expect([kindOf(course), kindOf(quiz), kindOf(deck)]).toEqual(['course', 'quiz', 'deck']);
    expect([unitCount(course), unitCount(quiz), unitCount(deck)]).toEqual([3, 5, 10]);
  });

  it('fills in defaults a hand-written file may leave out', () => {
    const result = parseDocument({
      format: 'quiz/1',
      id: 'q',
      title: '  Capitals  ',
      assessment: {
        id: 'a',
        questions: [{ id: 'q1', type: 'true_false', prompt: 'Paris is in France.', answer: true }],
      },
    });
    if (!result.ok || result.document.format !== 'quiz/1') throw new Error('rejected');
    expect(result.document.title).toBe('Capitals');
    expect(result.document.language).toBe('en');
    expect(result.document.tags).toEqual([]);
    expect(result.document.assessment.mode).toBe('practice');
    expect(result.document.assessment.questions[0].points).toBe(1);
  });

  it('drops unknown fields instead of failing', () => {
    const result = parseDocument({ ...clone(sampleDeckInput), madeBy: 'someone', cards: [] });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.document).not.toHaveProperty('madeBy');
  });

  it('explains a missing or unknown format', () => {
    expect(issuesOf({ title: 'x' })[0]).toMatchObject({ path: 'format' });
    expect(issuesOf({ format: 'course/9' })[0].message).toContain('"course/1"');
    expect(issuesOf('nope')[0].message).toBe('Expected a JSON object.');
    expect(issuesOf(null)).toHaveLength(1);
  });

  it('points at the exact field that is wrong', () => {
    const course = clone(sampleCourseInput) as any;
    course.lessons[0].assessments[0].questions[0].answer = 7;
    expect(issuesOf(course)).toEqual([
      {
        path: 'lessons[0].assessments[0].questions[0].answer',
        message: 'Answer 7 points past the last option (2).',
      },
    ]);
  });

  it('rejects question ids reused anywhere in a course', () => {
    const course = clone(sampleCourseInput) as any;
    course.finalExam.questions[0].id = 'recall-q1';
    const issues = issuesOf(course);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe('finalExam.questions[0].id');
  });

  it('rejects duplicate lesson and card ids', () => {
    const course = clone(sampleCourseInput) as any;
    course.lessons[1].id = course.lessons[0].id;
    expect(issuesOf(course)[0].path).toBe('lessons[1].id');

    const deck = clone(sampleDeckInput) as any;
    deck.cards[3].id = 'k1';
    expect(issuesOf(deck)[0].path).toBe('cards[3].id');
  });

  it('checks multiple choice answers', () => {
    const quiz = clone(sampleQuizInput) as any;
    quiz.assessment.questions[3].answers = [0, 0, 9];
    const paths = issuesOf(quiz).map((issue) => issue.path);
    expect(paths).toContain('assessment.questions[3].answers[2]');
    expect(paths).toContain('assessment.questions[3].answers');
  });

  it('checks that cloze gaps and placeholders match', () => {
    const quiz = clone(sampleQuizInput) as any;
    quiz.assessment.questions[2].text = 'Run git {{stage}} and then git {{other}}.';
    const messages = issuesOf(quiz).map((issue) => issue.message);
    expect(messages).toContain('The text has no {{save}} placeholder.');
    expect(messages).toContain('{{other}} has no matching gap.');
  });

  it('requires a pickable cloze gap to contain a right answer', () => {
    const course = clone(sampleCourseInput) as any;
    course.lessons[1].assessments[0].questions[1].gaps[1].options = ['faster', 'the same'];
    expect(issuesOf(course)[0].message).toBe('None of the options is an accepted answer.');
  });

  it('rejects an unknown question type', () => {
    const quiz = clone(sampleQuizInput) as any;
    quiz.assessment.questions[0].type = 'riddle';
    expect(issuesOf(quiz)[0].path).toBe('assessment.questions[0].type');
  });
});

describe('clozePlaceholders', () => {
  it('finds gap ids in order', () => {
    expect(clozePlaceholders('A {{one}} and {{ two }} then {{3}}.')).toEqual(['one', 'two', '3']);
    expect(clozePlaceholders('No gaps here.')).toEqual([]);
  });
});

describe('blankDocument', () => {
  it('produces a valid empty document of each kind', () => {
    for (const kind of ['course', 'quiz', 'deck'] as const) {
      const document = blankDocument(kind, '  My title ');
      const result = parseDocument(document);
      expect(result).toMatchObject({ ok: true });
      expect(document.title).toBe('My title');
      expect(kindOf(document)).toBe(kind);
      expect(unitCount(document)).toBe(0);
    }
  });

  it('gives each new document its own id', () => {
    expect(blankDocument('deck', 'a').id).not.toBe(blankDocument('deck', 'b').id);
  });
});

describe('documentJsonSchema', () => {
  it('describes each kind for use in prompts and structured output', () => {
    for (const kind of ['course', 'quiz', 'deck'] as const) {
      const schema = documentJsonSchema(kind) as any;
      expect(schema.type).toBe('object');
      expect(schema.required).toEqual(expect.arrayContaining(['format', 'id', 'title']));
      expect(JSON.stringify(schema)).toContain(kind === 'deck' ? 'flashcard' : 'single_choice');
    }
    const deck = documentJsonSchema('deck') as any;
    expect(deck.properties.format.const).toBe('deck/1');
    expect(JSON.stringify(deck)).not.toContain('single_choice');
  });
});
