import { type Course, type Lesson, parseDocument } from '../schema';
import { sampleCourseInput, sampleDeckInput, sampleInputs, sampleQuizInput } from '../templates/samples';
import { extractJson } from './extract';
import { appendLesson, asCopy, backupFile, documentFile, lessonFile, lessonText, readImport } from './files';
import { CREATE_KINDS, buildFixPrompt, buildPrompt, defaultRequest, example, promptFileName } from './prompt';
import { repairImport, slugify } from './repair';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const course = (() => {
  const parsed = parseDocument(sampleCourseInput);
  if (!parsed.ok) throw new Error('sample rejected');
  return parsed.document as Course;
})();

describe('extractJson', () => {
  it('reads plain JSON', () => {
    expect(extractJson(' {"a": 1} ')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('finds JSON inside a chatbot reply', () => {
    const reply = 'Sure! Here is your course:\n\n```json\n{"format": "deck/1", "note": "has } and { inside"}\n```\n\nLet me know if you want changes.';
    expect(extractJson(reply)).toEqual({ ok: true, value: { format: 'deck/1', note: 'has } and { inside' } });
    expect(extractJson('Here you go: {"a": {"b": "x\\"}"}} Enjoy!')).toEqual({ ok: true, value: { a: { b: 'x"}' } } });
  });

  it('forgives trailing commas but not commas inside strings', () => {
    expect(extractJson('{"a": [1, 2,], "b": "x,]",}')).toEqual({ ok: true, value: { a: [1, 2], b: 'x,]' } });
  });

  it('strips a byte order mark', () => {
    expect(extractJson('﻿{"a":1}')).toMatchObject({ ok: true });
  });

  it('says why nothing could be read', () => {
    expect(extractJson('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(extractJson('I cannot help with that.')).toEqual({ ok: false, reason: 'noJson' });
    expect(extractJson('{"title": "Cut off", "lessons": [{"id": "a"')).toEqual({ ok: false, reason: 'cutOff' });
    expect(extractJson('{"a": tru}')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(extractJson('[1, 2, 3]')).toEqual({ ok: false, reason: 'noJson' });
  });
});

describe('repairImport', () => {
  it('leaves a correct file untouched', () => {
    for (const input of sampleInputs) {
      const { value, fixes } = repairImport(clone(input) as never);
      expect(fixes).toEqual([]);
      expect(value).toEqual(input);
    }
  });

  it('works out a missing or loosely written format', () => {
    const noFormat = clone(sampleDeckInput) as any;
    delete noFormat.format;
    expect(repairImport(noFormat)).toMatchObject({ value: { format: 'deck/1' }, fixes: [{ code: 'inferredFormat', format: 'deck/1' }] });

    expect(repairImport({ ...clone(sampleQuizInput), format: 'Quiz' } as never).value.format).toBe('quiz/1');
    expect(repairImport({ ...clone(sampleCourseInput), format: 'course/1.0' } as never).value.format).toBe('course/1');
    expect(repairImport({ format: 'recipe/1', title: 'x' }).value.format).toBe('recipe/1');
  });

  it('adds missing ids and renames repeated ones', () => {
    const broken = clone(sampleCourseInput) as any;
    delete broken.id;
    delete broken.lessons[0].id;
    delete broken.lessons[0].assessments[0].id;
    delete broken.lessons[0].assessments[0].questions[1].id;
    broken.lessons[1].assessments[0].questions[0].id = 'recall-q1';
    broken.lessons[2].id = 'spacing';

    const { value, fixes } = repairImport(broken) as any;
    expect(value.id).toBe('course-how-to-study-so-it-sticks');
    expect(value.lessons[0].id).toBe('lesson-1');
    expect(value.lessons[0].assessments[0].id).toBe('lesson-1-a1');
    expect(value.lessons[0].assessments[0].questions[1].id).toBe('lesson-1-a1-q2');
    expect(value.lessons[1].assessments[0].questions[0].id).toBe('spacing-practice-q1');
    expect(value.lessons[2].id).toBe('lesson-3');
    expect(fixes).toEqual([
      { code: 'addedIds', count: 4 },
      { code: 'renamedIds', count: 2 },
    ]);
    expect(parseDocument(value)).toMatchObject({ ok: true });
  });

  it('turns answers written as text into positions', () => {
    const quiz = clone(sampleQuizInput) as any;
    quiz.assessment.questions[0].answer = 'A snapshot of the whole project';
    quiz.assessment.questions[0].type = 'Single-Choice';
    quiz.assessment.questions[1].answer = 'False';
    quiz.assessment.questions[3].answers = ['git branch', 'git commit'];
    quiz.assessment.questions[3].type = 'multiple choice';

    const { value, fixes } = repairImport(quiz) as any;
    expect(value.assessment.questions[0]).toMatchObject({ type: 'single_choice', answer: 0 });
    expect(value.assessment.questions[1].answer).toBe(false);
    expect(value.assessment.questions[3]).toMatchObject({ type: 'multiple_choice', answers: [2, 0] });
    expect(fixes).toEqual([{ code: 'convertedAnswers', count: 3 }]);
    expect(parseDocument(value)).toMatchObject({ ok: true });
  });

  it('accepts front and back on cards and numeric gap ids', () => {
    const deck = { title: 'Capitals', cards: [{ front: 'France', back: 'Paris' }, { front: 'Peru', back: 'Lima' }] };
    const repaired = repairImport(deck).value;
    expect(parseDocument(repaired)).toMatchObject({ ok: true, document: { id: 'deck-capitals', cards: [{ id: 'card-1', prompt: 'France' }, { id: 'card-2' }] } });

    const quiz = clone(sampleQuizInput) as any;
    quiz.assessment.questions[2].text = 'Run git {{1}} then git {{2}}.';
    quiz.assessment.questions[2].gaps = [{ id: 1, accepted: ['add'] }, { id: 2, accepted: ['commit'] }];
    expect(parseDocument(repairImport(quiz).value)).toMatchObject({ ok: true });
  });

  it('does not invent a fix for a wrong answer position', () => {
    const quiz = clone(sampleQuizInput) as any;
    quiz.assessment.questions[0].answer = 9;
    const { value, fixes } = repairImport(quiz);
    expect(fixes).toEqual([]);
    expect(parseDocument(value)).toMatchObject({ ok: false });
  });
});

describe('readImport', () => {
  it('imports each kind of document from a file', () => {
    for (const input of sampleInputs) {
      const outcome = readImport(JSON.stringify(input));
      expect(outcome).toMatchObject({ ok: true, kind: 'document', fixes: [] });
    }
  });

  it('imports a typical chatbot reply without hand editing', () => {
    const reply = [
      "Here's a short quiz on the water cycle! 🌊",
      '',
      '```json',
      JSON.stringify(
        {
          title: 'The water cycle',
          language: 'en',
          assessment: {
            mode: 'practice',
            questions: [
              { type: 'single-choice', prompt: 'What is water vapour turning into liquid called?', options: ['Evaporation', 'Condensation', 'Precipitation'], answer: 'Condensation', explanation: 'Vapour cools and condenses into droplets.' },
              { id: 'q1', type: 'true_false', prompt: 'Evaporation needs heat.', answer: 'true', explanation: 'Heat gives molecules the energy to escape.' },
              { id: 'q1', type: 'short_answer', prompt: 'Rain, snow and hail are all forms of what?', accepted: ['precipitation'], },
            ],
          },
        },
        null,
        2,
      ).replace('"accepted": [\n          "precipitation"\n        ]', '"accepted": ["precipitation",],'),
      '```',
      '',
      'Want me to add more questions?',
    ].join('\n');

    const outcome = readImport(reply);
    if (!outcome.ok || outcome.kind !== 'document' || outcome.document.format !== 'quiz/1') throw new Error(JSON.stringify(outcome));
    expect(outcome.document.id).toBe('quiz-the-water-cycle');
    expect(outcome.document.assessment.questions.map((question) => question.id)).toEqual(['quiz-q1', 'q1', 'quiz-q3']);
    expect(outcome.document.assessment.questions[0]).toMatchObject({ type: 'single_choice', answer: 1 });
    expect(outcome.fixes.map((fix) => fix.code)).toEqual(['inferredFormat', 'addedIds', 'renamedIds', 'convertedAnswers']);
  });

  it('reads a lesson file and remembers the course it was written for', () => {
    const file = lessonFile(course.lessons[1], course.id);
    expect(file.name).toBe('space-it-out.lesson.json');
    const outcome = readImport(file.text);
    expect(outcome).toMatchObject({ ok: true, kind: 'lesson', courseId: 'sample-learning', lesson: { id: 'spacing' } });
  });

  it('reports JSON problems and content problems separately', () => {
    expect(readImport('Sorry, I cannot do that.')).toEqual({ ok: false, stage: 'json', problem: 'noJson', detail: undefined });
    expect(readImport('{"format": "course/1", "lessons": [')).toMatchObject({ ok: false, stage: 'json', problem: 'cutOff' });

    const bad = clone(sampleQuizInput) as any;
    bad.assessment.questions[0].answer = 9;
    delete bad.assessment.questions[4].accepted;
    const outcome = readImport(JSON.stringify(bad));
    if (outcome.ok || outcome.stage !== 'content') throw new Error('expected content issues');
    expect(outcome.issues.map((issue) => issue.path).sort()).toEqual([
      'assessment.questions[0].answer',
      'assessment.questions[4].accepted',
    ]);
  });

  it('rejects something that is not ours', () => {
    const outcome = readImport('{"name": "package", "version": "1.0.0"}');
    expect(outcome).toMatchObject({ ok: false, stage: 'content', issues: [{ path: 'format' }] });
  });
});

describe('files', () => {
  it('names files after the title and kind', () => {
    expect(documentFile(course).name).toBe('how-to-study-so-it-sticks.course.json');
    expect(documentFile({ ...course, title: 'Ελληνικά' }).name).toBe('course.course.json');
    expect(slugify('  Crème brûlée & Co.  ')).toBe('creme-brulee-co');
  });

  it('round-trips a document through its file', () => {
    const outcome = readImport(documentFile(course).text);
    expect(outcome).toMatchObject({ ok: true, kind: 'document', fixes: [] });
    if (outcome.ok && outcome.kind === 'document') expect(outcome.document).toEqual(course);
  });

  it('makes a copy with a new id', () => {
    const copy = asCopy(course, ' (copy)');
    expect(copy.id).not.toBe(course.id);
    expect(copy.title).toBe('How to study so it sticks (copy)');
    expect(parseDocument(copy)).toMatchObject({ ok: true });
  });

  it('appends a lesson and renames ids that would clash', () => {
    const lesson: Lesson = clone(course.lessons[0]);
    const extended = appendLesson(course, lesson);
    expect(extended.lessons).toHaveLength(4);
    const added = extended.lessons[3];
    expect(added.id).toBe('recall-2');
    expect(added.assessments[0].id).toBe('recall-practice-2');
    expect(added.assessments[0].questions.map((question) => question.id)).toEqual(['recall-q1-2', 'recall-q2-2', 'recall-q3-2']);
    expect(parseDocument(extended)).toMatchObject({ ok: true });
    expect(course.lessons).toHaveLength(3);
  });

  it('turns a lesson into source text', () => {
    const text = lessonText(course.lessons[0]);
    expect(text.startsWith('# Recall beats rereading')).toBe(true);
    expect(text).toContain('retrieval practice');
    expect(text).toContain('close the book');
  });

  it('reads a backup and checks every document in it', () => {
    const backup = {
      format: 'backup/1',
      createdAt: 1_700_000_000_000,
      items: [{ document: sampleDeckInput, createdAt: 1, updatedAt: 2 }],
      settings: { 'profile.name': 'Ada' },
    };
    const outcome = readImport(JSON.stringify(backup));
    if (!outcome.ok || outcome.kind !== 'backup') throw new Error(JSON.stringify(outcome));
    expect(outcome.backup.items[0]).toMatchObject({ source: 'imported', deletedAt: null, marks: [], attempts: [], lastLesson: null });
    expect(backupFile(outcome.backup).name).toBe('anki-backup-2023-11-14.json');

    const broken = clone(backup) as any;
    broken.items[0].document.cards[2].back = '';
    const failed = readImport(JSON.stringify(broken));
    expect(failed).toMatchObject({ ok: false, stage: 'content', issues: [{ path: 'items[0].document.cards[2].back' }] });
  });
});

describe('buildPrompt', () => {
  it('ships examples that really import', () => {
    for (const kind of CREATE_KINDS) {
      const outcome = readImport(JSON.stringify(example(kind)));
      expect(outcome).toMatchObject({ ok: true, fixes: [] });
    }
  });

  it('states the request, the rules and the schema', () => {
    const prompt = buildPrompt({ ...defaultRequest, topic: 'How vaccines work', audience: 'Nursing students', level: 'intermediate', language: 'es', lessons: 4 });
    expect(prompt).toContain('Write a course of 4 lessons about:\n\nHow vaccines work');
    expect(prompt).toContain('- Level: intermediate');
    expect(prompt).toContain('- Audience: Nursing students');
    expect(prompt).toContain('tag `es`');
    expect(prompt).toContain('Set `format` to "course/1".');
    expect(prompt).toContain('"$schema"');
    expect(prompt).toContain('`finalExam` in mode "exam" with 8 new questions');
    expect(prompt.trimEnd().endsWith('Start with `{` and end with `}`.')).toBe(true);
  });

  it('lists only the chosen question types', () => {
    const prompt = buildPrompt({ ...defaultRequest, kind: 'quiz', topic: 'x', questionTypes: ['true_false', 'essay'] });
    const rules = prompt.slice(prompt.indexOf('Use only these question types:'), prompt.indexOf('## Example'));
    expect(rules).toContain('`true_false`');
    expect(rules).toContain('`essay`');
    expect(rules).not.toContain('`single_choice`');
    expect(rules).not.toContain('`cloze`');
  });

  it('falls back to single choice when no type is chosen', () => {
    const prompt = buildPrompt({ ...defaultRequest, kind: 'quiz', topic: 'x', questionTypes: [] });
    expect(prompt).toContain('- `single_choice`');
  });

  it('writes flashcard rules for a deck and nothing about explanations', () => {
    const prompt = buildPrompt({ ...defaultRequest, kind: 'deck', topic: 'Spanish food words', cards: 30 });
    expect(prompt).toContain('a set of 30 flashcards');
    expect(prompt).toContain('Set `format` to "deck/1".');
    expect(prompt).toContain('Every card has this shape:');
    expect(prompt).not.toContain('Every question has an `explanation`');
  });

  it('includes the user’s own material when given', () => {
    const prompt = buildPrompt({ ...defaultRequest, topic: 'My notes', source: '  Mitochondria make ATP.  ' });
    expect(prompt).toContain('<<<SOURCE\nMitochondria make ATP.\nSOURCE>>>');
    expect(buildPrompt({ ...defaultRequest, topic: 'x', source: '   ' })).not.toContain('Source material');
  });

  it('tells a lesson which course it joins', () => {
    const prompt = buildPrompt({
      ...defaultRequest,
      kind: 'lesson',
      topic: 'Sleep and memory',
      course: { id: 'sample-learning', title: 'How to study so it sticks', lessonTitles: ['Recall beats rereading', 'Space it out'] },
    });
    expect(prompt).toContain('Write one lesson about:');
    expect(prompt).toContain('Set `format` to "lesson/1".');
    expect(prompt).toContain('Set `courseId` to "sample-learning".');
    expect(prompt).toContain('2. Space it out');
  });

  it('names the prompt file after the topic', () => {
    expect(promptFileName({ ...defaultRequest, topic: 'How Vaccines Work!' })).toBe('how-vaccines-work.prompt.md');
    expect(promptFileName({ ...defaultRequest, kind: 'deck', topic: '日本語' })).toBe('deck.prompt.md');
  });
});

describe('buildFixPrompt', () => {
  it('lists each problem with its place', () => {
    const prompt = buildFixPrompt({
      stage: 'content',
      issues: [
        { path: 'lessons[0].assessments[0].questions[2].answer', message: 'Answer 7 points past the last option (2).' },
        { path: '', message: 'Something general.' },
      ],
    });
    expect(prompt).toContain('1. `lessons[0].assessments[0].questions[2].answer`: Answer 7 points past the last option (2).');
    expect(prompt).toContain('2. `(top level)`: Something general.');
    expect(prompt).toContain('Send one JSON object and nothing else.');
  });

  it('caps a very long list', () => {
    const issues = Array.from({ length: 55 }, (_, index) => ({ path: `cards[${index}].back`, message: 'This text cannot be empty.' }));
    const prompt = buildFixPrompt({ stage: 'content', issues });
    expect(prompt).toContain('40. `cards[39].back`');
    expect(prompt).not.toContain('41. ');
    expect(prompt).toContain('…and 15 more of the same kinds.');
  });

  it('explains a reply that was not JSON', () => {
    expect(buildFixPrompt({ stage: 'json', problem: 'cutOff' })).toContain('cut off');
    expect(buildFixPrompt({ stage: 'json', problem: 'invalid', detail: 'Unexpected token }' })).toContain('not valid JSON: Unexpected token }');
  });
});
