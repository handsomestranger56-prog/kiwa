import { z } from 'zod';

import {
  type AssessmentMode,
  type Level,
  type ParseIssue,
  type QuestionType,
  documentJsonSchema,
  formatByKind,
} from '../schema';
import { lessonFileSchema } from './files';
import type { JsonProblem } from './files';
import { LESSON_FORMAT } from './repair';

export type CreateKind = 'course' | 'lesson' | 'quiz' | 'deck';
export const CREATE_KINDS = ['course', 'lesson', 'quiz', 'deck'] as const satisfies readonly CreateKind[];

/** Question types a course, lesson or quiz may use. Decks are flashcards only. */
export const PROMPT_QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'short_answer',
  'cloze',
  'essay',
] as const satisfies readonly QuestionType[];

export type CreateRequest = {
  kind: CreateKind;
  topic: string;
  audience?: string;
  level: Level;
  /** Language the content is written in, as a tag such as "en". */
  language: string;
  /** Lessons in a course. */
  lessons: number;
  /** Questions per lesson, or in a quiz. */
  questions: number;
  /** Cards in a deck. */
  cards: number;
  questionTypes: QuestionType[];
  /** How a standalone quiz behaves. */
  quizMode: AssessmentMode;
  /** The user's own notes or text to build from. */
  source?: string;
  /** For a lesson: the course it will be added to. */
  course?: { id: string; title: string; lessonTitles: string[] };
};

export const defaultRequest: CreateRequest = {
  kind: 'course',
  topic: '',
  level: 'beginner',
  language: 'en',
  lessons: 5,
  questions: 3,
  cards: 20,
  questionTypes: ['single_choice', 'multiple_choice', 'true_false', 'short_answer'],
  quizMode: 'practice',
};

export const LIMITS = { lessons: [1, 20], questions: [1, 30], cards: [5, 100] } as const;

const QUESTION_RULES: Record<QuestionType, string> = {
  single_choice: '`single_choice`: `options` is 2 to 8 strings, `answer` is the position of the one correct option, counting from 0.',
  multiple_choice: '`multiple_choice`: `options` is 2 to 8 strings, `answers` is a list of the positions of every correct option, counting from 0. At least one, and not all.',
  true_false: '`true_false`: the `prompt` is a statement, `answer` is `true` or `false`.',
  short_answer: '`short_answer`: `accepted` lists every wording that counts as right. Use only when the answer is one word or a short phrase.',
  cloze: '`cloze`: `text` is a sentence with gaps written as `{{1}}`, `{{2}}`. `gaps` lists each gap as `{ "id": "1", "accepted": ["..."] }`. Add `options` to a gap to let the learner pick instead of type. Every gap id appears in `text` exactly once.',
  essay: '`essay`: `modelAnswer` is what a strong answer says, `rubric` says how to score it, `minWords` is optional.',
  flashcard: '`flashcard`: `prompt` is the front of the card, `back` is the reverse. Keep both short.',
};

/** Builds the prompt a user pastes into any chatbot. The reply is a file the app can import. */
export function buildPrompt(request: CreateRequest): string {
  const types = request.kind === 'deck' ? (['flashcard'] as QuestionType[]) : effectiveTypes(request);
  const sections = [
    task(request),
    request.source?.trim() ? source(request.source) : null,
    writingRules(request),
    formatRules(request, types),
    `## Example\n\nThis shows the shape only. Write your own content.\n\n${fence(JSON.stringify(example(request.kind), null, 2))}`,
    `## JSON Schema\n\nYour reply must be valid against this schema.\n\n${fence(JSON.stringify(schemaFor(request.kind)))}`,
    'Reply with the JSON object only. Start with `{` and end with `}`.',
  ];
  return `${sections.filter(Boolean).join('\n\n')}\n`;
}

export function promptFileName(request: CreateRequest): string {
  const slug = request.topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${slug || request.kind}.prompt.md`;
}

function effectiveTypes(request: CreateRequest): QuestionType[] {
  const chosen = request.questionTypes.filter((type) => type !== 'flashcard');
  return chosen.length > 0 ? chosen : ['single_choice'];
}

function task(request: CreateRequest): string {
  const what = {
    course: `a course of ${request.lessons} ${plural(request.lessons, 'lesson')}`,
    lesson: 'one lesson',
    quiz: `a quiz of ${request.questions} ${plural(request.questions, 'question')}`,
    deck: `a set of ${request.cards} flashcards`,
  }[request.kind];

  const lines = [
    `# Task`,
    '',
    `Write ${what} about:`,
    '',
    request.topic.trim(),
    '',
    `- Level: ${request.level}`,
    `- Language: write all content in the language with the tag \`${request.language}\`, and set \`language\` to it`,
  ];
  if (request.audience?.trim()) lines.push(`- Audience: ${request.audience.trim()}`);

  if (request.kind === 'lesson' && request.course) {
    lines.push('', `The lesson will be added to the course "${request.course.title}".`);
    if (request.course.lessonTitles.length > 0) {
      lines.push('The course already has these lessons. Do not repeat what they cover:');
      request.course.lessonTitles.forEach((title, index) => lines.push(`${index + 1}. ${title}`));
    }
  }
  return lines.join('\n');
}

function source(text: string): string {
  return [
    '## Source material',
    '',
    'Build the content from the material between the markers. Do not contradict it, and do not add facts it does not support.',
    '',
    '<<<SOURCE',
    text.trim(),
    'SOURCE>>>',
  ].join('\n');
}

function writingRules(request: CreateRequest): string {
  const rules: string[] = [];
  const perLesson = `${request.questions} ${plural(request.questions, 'question')}`;

  if (request.kind === 'course' || request.kind === 'lesson') {
    rules.push(
      'Each lesson teaches one idea in 150 to 300 words of plain language, with at least one concrete example.',
      'Give each lesson a one-sentence `summary` and an estimate of reading time in `minutes`.',
      `End each lesson with one assessment in mode "practice" holding ${perLesson} that test that lesson only.`,
    );
  }
  if (request.kind === 'course') {
    const examSize = Math.min(15, Math.max(5, request.lessons * 2));
    rules.push(
      'Order the lessons so each one builds on the ones before it.',
      `Add a \`finalExam\` in mode "exam" with ${examSize} new questions drawn from across the whole course.`,
    );
  }
  if (request.kind === 'quiz') {
    rules.push(`Set the assessment's \`mode\` to "${request.quizMode}".`, 'Order the questions from easier to harder.');
  }
  if (request.kind === 'deck') {
    rules.push('One fact per card. The front asks, the back answers in a few words.', 'Do not write cards whose answer is yes or no.');
  } else {
    rules.push(
      'Every question has an `explanation` that says why the right answer is right.',
      'Wrong options must be plausible. Do not use "all of the above" or "none of the above".',
      'Mix the allowed question types instead of using only one.',
    );
  }
  return `## How to write it\n\n${rules.map((rule) => `- ${rule}`).join('\n')}`;
}

function formatRules(request: CreateRequest, types: QuestionType[]): string {
  const format = request.kind === 'lesson' ? LESSON_FORMAT : formatByKind[request.kind];
  const rules = [
    'Reply with one JSON object and nothing else. No code fence, no introduction, no closing remarks.',
    `Set \`format\` to "${format}".`,
    'Every `id` is short, uses lowercase letters, digits and hyphens, and is unique within the whole file.',
    'Text fields may use only this Markdown: paragraphs, `#` to `###` headings, `-` and `1.` lists, `**bold**`, `*italic*`, `` `code` `` and `[links](https://...)`. No tables, no HTML.',
  ];
  if (request.kind === 'lesson' && request.course) rules.push(`Set \`courseId\` to "${request.course.id}".`);
  if (request.kind === 'course' || request.kind === 'lesson') {
    rules.push(
      'Lesson `blocks` come in three types: `text` with `markdown`; `code` with `language` and `code`; `callout` with `tone` ("note", "tip" or "warning") and `markdown`. Do not use image blocks.',
    );
  }

  const typeRules = types.map((type) => `- ${QUESTION_RULES[type]}`).join('\n');
  const typeHeading = request.kind === 'deck' ? 'Every card has this shape:' : 'Use only these question types:';
  return `## Format\n\n${rules.map((rule) => `- ${rule}`).join('\n')}\n\n${typeHeading}\n\n${typeRules}`;
}

function schemaFor(kind: CreateKind): Record<string, unknown> {
  if (kind === 'lesson') return z.toJSONSchema(lessonFileSchema, { io: 'input' }) as Record<string, unknown>;
  return documentJsonSchema(kind);
}

const exampleLesson = {
  id: 'boiling-point',
  title: 'Why water boils sooner on a mountain',
  summary: 'Lower air pressure lowers the boiling point.',
  minutes: 3,
  blocks: [
    { type: 'text', markdown: 'Water boils when its vapour pressure equals the pressure of the air above it. Higher up there is **less air**, so that happens at a lower temperature.' },
    { type: 'callout', tone: 'tip', markdown: 'At 3000 m water boils at about 90 °C, so pasta takes longer.' },
  ],
  assessments: [
    {
      id: 'boiling-point-practice',
      mode: 'practice',
      questions: [
        {
          id: 'boiling-point-q1',
          type: 'single_choice',
          prompt: 'What happens to the boiling point of water as you climb?',
          options: ['It rises', 'It falls', 'It stays the same'],
          answer: 1,
          explanation: 'Less air pressure means water reaches boiling at a lower temperature.',
        },
      ],
    },
  ],
};

/** A small valid file of each kind. Tests check that every example really imports. */
export function example(kind: CreateKind): Record<string, unknown> {
  switch (kind) {
    case 'course':
      return {
        format: 'course/1',
        id: 'kitchen-physics',
        title: 'Kitchen physics',
        description: 'Everyday cooking explained.',
        language: 'en',
        level: 'beginner',
        tags: ['physics'],
        lessons: [exampleLesson],
        finalExam: {
          id: 'final',
          mode: 'exam',
          questions: [
            { id: 'final-q1', type: 'true_false', prompt: 'Water boils at a lower temperature at high altitude.', answer: true, explanation: 'There is less air pressure higher up.' },
          ],
        },
      };
    case 'lesson':
      return { format: LESSON_FORMAT, lesson: exampleLesson };
    case 'quiz':
      return {
        format: 'quiz/1',
        id: 'boiling-quiz',
        title: 'Boiling and pressure',
        language: 'en',
        level: 'beginner',
        tags: ['physics'],
        assessment: {
          id: 'boiling-quiz-main',
          mode: 'practice',
          questions: [
            {
              id: 'boiling-quiz-q1',
              type: 'cloze',
              prompt: 'Complete the sentence.',
              text: 'At high altitude the air pressure is {{1}}, so water boils at a {{2}} temperature.',
              gaps: [
                { id: '1', accepted: ['lower', 'less'] },
                { id: '2', accepted: ['lower'], options: ['lower', 'higher'] },
              ],
              explanation: 'Boiling starts when vapour pressure matches the surrounding pressure.',
            },
          ],
        },
      };
    case 'deck':
      return {
        format: 'deck/1',
        id: 'boiling-cards',
        title: 'Boiling facts',
        language: 'en',
        level: 'beginner',
        tags: ['physics'],
        cards: [{ id: 'card-1', type: 'flashcard', prompt: 'Boiling point of water at sea level', back: '100 °C' }],
      };
  }
}

/** A message to paste back into the chat when a reply could not be imported. */
export function buildFixPrompt(problem: { stage: 'json'; problem: JsonProblem; detail?: string } | { stage: 'content'; issues: ParseIssue[] }): string {
  const lines = ['The JSON you sent could not be imported. Please correct it and send the complete corrected JSON again.', ''];

  if (problem.stage === 'json') {
    const reason = {
      empty: 'The reply was empty.',
      noJson: 'The reply contained no JSON object.',
      cutOff: 'The JSON stops before its closing brace, so the reply was cut off. If it was too long, make the content shorter.',
      invalid: `The reply is not valid JSON${problem.detail ? `: ${problem.detail}` : '.'}`,
    }[problem.problem];
    lines.push('Problem:', '', `- ${reason}`);
  } else {
    lines.push('Problems, each with the place it was found:', '');
    const shown = problem.issues.slice(0, 40);
    shown.forEach((issue, index) => lines.push(`${index + 1}. \`${issue.path || '(top level)'}\`: ${issue.message}`));
    if (problem.issues.length > shown.length) lines.push(`…and ${problem.issues.length - shown.length} more of the same kinds.`);
  }

  lines.push(
    '',
    'When you reply:',
    '',
    '- Send one JSON object and nothing else. No code fence and no commentary.',
    '- Keep everything that was already correct exactly as it was.',
    '- Positions in `answer` and `answers` count from 0.',
    '- Every `id` must be unique within the file.',
  );
  return `${lines.join('\n')}\n`;
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

function fence(text: string): string {
  return `\`\`\`json\n${text}\n\`\`\``;
}
