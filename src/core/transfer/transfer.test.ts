import { type Course, type Lesson, parseDocument } from '../schema';
import { sampleCourseInput, sampleDeckInput, sampleInputs, sampleQuizInput } from '../templates/samples';
import { extractJson } from './extract';
import { appendLesson, asCopy, backupFile, documentFile, groupFile, lessonFile, lessonText, readImport } from './files';
import { CREATE_KINDS, PROMPT_QUESTION_TYPES, buildFixPrompt, buildPrompt, defaultRequest, example, promptFileName } from './prompt';
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

  it('reads JSON that was escaped into a string', () => {
    const json = JSON.stringify({ format: 'deck/1', note: 'say "hi"\nnow', svg: '<svg a="1"/>' }, null, 2);
    const escaped = JSON.stringify(json);
    expect(extractJson(escaped)).toEqual({ ok: true, value: JSON.parse(json) });
    expect(extractJson(escaped.slice(1, -1))).toEqual({ ok: true, value: JSON.parse(json) });
    expect(extractJson(`Here it is:\n${escaped.slice(1, -1)}`)).toEqual({ ok: true, value: JSON.parse(json) });
  });

  it('undoes Markdown escapes that copying a reply can add', () => {
    const json = JSON.stringify({ tags: ['a_b', 'c'], text: '**bold** - [link](https://x.y) # 1.', n: -2 }, null, 2);
    const escaped = json.replace(/[[\]_*#\-]/g, (char) => `\\${char}`);
    expect(escaped).toContain('"tags": \\[');
    expect(extractJson(escaped)).toEqual({ ok: true, value: JSON.parse(json) });
  });

  it('keeps the character of an escape JSON does not have', () => {
    expect(extractJson(String.raw`{"title": "O\'zbek tili", "path": "C:\Users\\me"}`)).toEqual({
      ok: true,
      value: { title: "O'zbek tili", path: 'C:Users\\me' },
    });
  });

  it('reads line breaks inside strings and non-breaking spaces between tokens', () => {
    expect(extractJson('{\n\u00A0\u00A0"a": "one\ntwo",\u200B\n\u00A0\u00A0"b": [1,\u00A02]\n}')).toEqual({ ok: true, value: { a: 'one\ntwo', b: [1, 2] } });
  });

  it('reads a whole course after a chat app escaped it for Markdown', () => {
    const json = JSON.stringify(sampleCourseInput, null, 2);
    const escaped = json.replace(/[[\]_*#\-]/g, (char) => `\\${char}`);
    expect(readImport(escaped)).toEqual(readImport(json));
    expect(readImport(escaped).ok).toBe(true);
  });

  it('does not repair a reply that parses as it is', () => {
    expect(extractJson('{"a": "x\\\\_y"}')).toEqual({ ok: true, value: { a: 'x\\_y' } });
  });

  it('says why nothing could be read', () => {
    expect(extractJson('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(extractJson('I cannot help with that.')).toEqual({ ok: false, reason: 'noJson' });
    expect(extractJson('{"title": "Cut off", "lessons": [{"id": "a"')).toEqual({ ok: false, reason: 'cutOff' });
    expect(extractJson('{"a": tru}')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(extractJson('{"a": 1 "b": 2}')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(extractJson('{\\"a\\": 1 \\"b\\": 2}')).toMatchObject({ ok: false, reason: 'invalid' });
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
    expect(backupFile(outcome.backup).name).toBe('kiwa-backup-2023-11-14.json');

    const broken = clone(backup) as any;
    broken.items[0].document.cards[2].back = '';
    const failed = readImport(JSON.stringify(broken));
    expect(failed).toMatchObject({ ok: false, stage: 'content', issues: [{ path: 'items[0].document.cards[2].back' }] });
  });
});

describe('buildPrompt', () => {
  it('ships examples that really import', () => {
    for (const kind of CREATE_KINDS) {
      for (const pictures of [false, true]) {
        const outcome = readImport(JSON.stringify(example(kind, pictures)));
        expect(outcome).toMatchObject({ ok: true, fixes: [] });
      }
    }
  });

  it('has an example question of every type that imports', () => {
    for (const type of [...PROMPT_QUESTION_TYPES, 'flashcard'] as const) {
      const kind = type === 'flashcard' ? 'deck' : 'quiz';
      expect([type, readImport(JSON.stringify(example(kind, false, [type]))).ok]).toEqual([type, true]);
    }
  });

  it('shows and allows only the chosen question types', () => {
    const prompt = buildPrompt({ ...defaultRequest, kind: 'lesson', topic: 'x', questionTypes: ['essay'] });
    const [rules, rest] = prompt.split('## Example');
    expect(rules).toContain('is of type "essay"');
    expect(rules).not.toContain('Mix them');
    expect(rest).toContain('"type": "essay"');
    for (const other of ['single_choice', 'multiple_choice', 'true_false', 'cloze', 'matching']) expect(rest).not.toContain(`"${other}"`);
  });

  it('asks for SVG pictures only when they are wanted', () => {
    const withPictures = buildPrompt({ ...defaultRequest, topic: 'x' });
    expect(withPictures).toContain('add an `svg` block');
    expect(withPictures).toContain("viewBox='0 0 240 120'");
    const without = buildPrompt({ ...defaultRequest, topic: 'x', pictures: false });
    expect(without).toContain('Do not use image or svg blocks.');
    expect(without).not.toContain('<svg');
    expect(buildPrompt({ ...defaultRequest, kind: 'quiz', topic: 'x' })).not.toContain('svg');
  });

  it('cleans an imported picture and refuses one that is not SVG', () => {
    const lesson = (svg: string) => JSON.stringify({ format: 'lesson/1', lesson: { id: 'l', title: 'L', blocks: [{ type: 'svg', svg, alt: 'A drawing' }], assessments: [] } });
    const cleaned = readImport(lesson('<svg viewBox="0 0 1 1" onload="x()"><script>x()</script><rect/></svg>'));
    if (!cleaned.ok || cleaned.kind !== 'lesson') throw new Error('should import');
    const block = cleaned.lesson.blocks[0] as { svg: string };
    expect(block.svg).not.toContain('script');
    expect(block.svg).not.toContain('onload');
    const fromCode = readImport(JSON.stringify({ format: 'lesson/1', lesson: { id: 'l', title: 'L', blocks: [{ type: 'svg', code: '<svg><rect/></svg>' }], assessments: [] } }));
    expect(fromCode).toMatchObject({ ok: true, kind: 'lesson' });
    expect(readImport(lesson('<div>not a picture</div>'))).toMatchObject({ ok: false, stage: 'content', issues: [{ path: 'lesson.blocks[0].svg' }] });
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
    expect(prompt.trimEnd().endsWith('Reply with the JSON object only, inside one ```json code block.')).toBe(true);
    expect(prompt).not.toContain('No code fence');
  });

  it('asks for the right option in varied places and for false statements too', () => {
    const prompt = buildPrompt({ ...defaultRequest, kind: 'quiz', topic: 'x', questionTypes: ['single_choice', 'true_false'] });
    expect(prompt).toContain('Vary where the correct option sits');
    expect(prompt).toContain('make about half of the statements false');
    expect(buildPrompt({ ...defaultRequest, kind: 'quiz', topic: 'x', questionTypes: ['essay'] })).not.toContain('Vary where the correct option sits');
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

describe('buildPrompt with choices left to the model', () => {
  it('asks the model to size a quiz, deck or course and pick the level', () => {
    const quiz = buildPrompt({ ...defaultRequest, kind: 'quiz', topic: 'x', level: 'auto', autoSize: true, questions: 7 });
    expect(quiz).toContain('Choose how many questions it needs, from 1 to 30');
    expect(quiz).toContain('set `level` to it');
    expect(quiz).not.toContain('7 questions');
    expect(buildPrompt({ ...defaultRequest, kind: 'deck', topic: 'x', autoSize: true })).toContain('Choose how many cards it needs, from 5 to 100');
    const course = buildPrompt({ ...defaultRequest, topic: 'x', autoSize: true });
    expect(course).toContain('Choose how many lessons it needs');
    expect(course).toContain('2 to 8 questions, as many as the lesson needs');
    expect(course).toContain('`finalExam` in mode "exam" with 5 to 15 new questions');
  });

  it('leaves only the chosen numbers to the model', () => {
    const prompt = buildPrompt({ ...defaultRequest, topic: 'x', lessons: 4, questions: 6, auto: { lessons: true } });
    expect(prompt).toContain('Choose how many lessons it needs');
    expect(prompt).toContain('holding 6 questions');
    const fixedLessons = buildPrompt({ ...defaultRequest, topic: 'x', lessons: 4, auto: { questions: true } });
    expect(fixedLessons).toContain('a course of 4 lessons');
    expect(fixedLessons).toContain('2 to 8 questions, as many as the lesson needs');
  });

  it('never asks for a level field in a lesson file', () => {
    const lesson = buildPrompt({ ...defaultRequest, kind: 'lesson', topic: 'x', level: 'auto' });
    expect(lesson).toContain('choose "beginner", "intermediate" or "advanced"');
    expect(lesson).not.toContain('set `level` to it');
  });
});

describe('groups in files', () => {
  const quiz = () => {
    const outcome = readImport(JSON.stringify(example('quiz')));
    if (!outcome.ok || outcome.kind !== 'document') throw new Error('example did not import');
    return outcome.document;
  };

  it('names the group in an item file, and reads it back', () => {
    const file = documentFile(quiz(), 'Physics');
    expect(file.text.indexOf('"group"')).toBeLessThan(file.text.indexOf('"title"'));
    expect(readImport(file.text)).toMatchObject({ ok: true, kind: 'document', group: 'Physics' });
    expect(readImport(documentFile(quiz()).text)).toMatchObject({ ok: true, group: null });
  });

  it('exports and imports a whole group', () => {
    const deck = readImport(JSON.stringify(example('deck')));
    if (!deck.ok || deck.kind !== 'document') throw new Error('example did not import');
    const file = groupFile('Physics basics', [quiz(), deck.document]);
    expect(file.name).toBe('physics-basics.group.json');
    const outcome = readImport(file.text);
    expect(outcome).toMatchObject({ ok: true, kind: 'group', name: 'Physics basics' });
    if (outcome.ok && outcome.kind === 'group') expect(outcome.documents.map((document) => document.format)).toEqual(['quiz/1', 'deck/1']);
  });

  it('repairs each item of a group and names the item that cannot be imported', () => {
    const broken = { ...example('quiz'), assessment: { id: 'a', mode: 'practice', questions: [{ id: 'q', type: 'single_choice', prompt: 'Which?', options: ['Only one'], answer: 3 }] } };
    const missingIds = { ...example('deck'), id: undefined };
    const outcome = readImport(JSON.stringify({ format: 'group/1', name: 'Mixed', items: [missingIds, broken] }));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && outcome.stage === 'content') {
      expect(outcome.issues.every((issue) => issue.path.startsWith('items[1]'))).toBe(true);
    }
    const fine = readImport(JSON.stringify({ format: 'group/1', name: 'Mixed', items: [missingIds] }));
    expect(fine).toMatchObject({ ok: true, kind: 'group', fixes: [{ code: 'addedIds', count: 1 }] });
  });

  it('needs a name and at least one item', () => {
    const outcome = readImport(JSON.stringify({ format: 'group/1', items: [] }));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && outcome.stage === 'content') expect(outcome.issues.map((issue) => issue.path)).toEqual(['name', 'items']);
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
    expect(prompt).toContain('Send one JSON object and nothing else, inside one ```json code block.');
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
