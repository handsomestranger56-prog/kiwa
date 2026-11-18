import { z } from 'zod';

import { type GenerateRequest, type RateLimit, type Usage, AiError, strictSchema } from '../ai';
import { newId } from '../ids';
import {
  type Assessment,
  type Course,
  type Lesson,
  type LibraryDocument,
  type ParseIssue,
  COURSE_FORMAT,
  documentJsonSchema,
  levelSchema,
  parseDocument,
} from '../schema';
import { extractJson } from '../transfer/extract';
import { type ImportOutcome, appendLesson, lessonFileSchema, readImport } from '../transfer/files';
import { type CreateRequest, LIMITS, buildFixPrompt, buildPrompt, levelLine } from '../transfer/prompt';
import type { Fix } from '../transfer/repair';
import { slugify } from '../transfer/repair';

/**
 * Generating content with a model, one saved step at a time.
 *
 * A lesson, quiz or deck is one request. A course is an outline first, which the user can edit,
 * then one request per lesson, then the final exam. Each finished step is stored, so a run that
 * the phone interrupts picks up from the last finished step.
 */

export const outlineSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  /** Set by the model when the person let it choose the level. */
  level: levelSchema.optional(),
  lessons: z
    .array(z.object({ title: z.string().trim().min(1), summary: z.string().optional() }))
    .min(1)
    .max(30),
});
export type Outline = z.infer<typeof outlineSchema>;

export type JobStatus =
  /** Working through the steps. */
  | 'running'
  /** The outline is ready for the user to check before lessons are written. */
  | 'outline'
  /** Finished. The result waits to be added to the library. */
  | 'ready'
  /** Added to the library. */
  | 'saved'
  | 'failed'
  | 'cancelled';

export type JobState = {
  outline: Outline | null;
  /** One slot per outline lesson. Null until that lesson is written. */
  lessons: (Lesson | null)[];
  /** Undefined until attempted. Null when it was attempted and failed: the course is kept without it. */
  finalExam?: Assessment | null;
  /** What the run produced: a document, or a lesson when a lesson was asked for. */
  result: { document: LibraryDocument } | { lesson: Lesson } | null;
  /** Every request sent, including ones that failed. `failed` is missing in runs saved before it was counted. */
  usage: Usage & { requests: number; failed?: number };
  fixes: Fix[];
  /** The most recent failed requests, newest last, for showing what went wrong. */
  failures?: FailedRequest[];
};

/** One request that did not work: an HTTP error, no connection, or a reply the model cut off or refused. */
export type FailedRequest = { at: number; model: string; status?: number; kind?: string; limit?: RateLimit; message: string };

/** How many failed requests a run keeps. Older ones are dropped. */
export const MAX_FAILURES_KEPT = 30;

export type JobError = { kind: string; message: string; issues?: ParseIssue[]; limit?: RateLimit };

export type Job = {
  id: string;
  request: CreateRequest;
  model: { providerId: string; model: string; label: string };
  status: JobStatus;
  state: JobState;
  error: JobError | null;
  /** The library item the result was saved as. */
  savedItemId: string | null;
  createdAt: number;
  updatedAt: number;
};

export function emptyState(): JobState {
  return { outline: null, lessons: [], result: null, usage: { inputTokens: 0, outputTokens: 0, requests: 0 }, fixes: [] };
}

export type Step = { type: 'single' } | { type: 'outline' } | { type: 'lesson'; index: number } | { type: 'finalExam' } | { type: 'assemble' };

/** What to do next, or null when there is nothing to do until the user acts. */
export function nextStep(job: Pick<Job, 'request' | 'status' | 'state'>): Step | null {
  if (job.status !== 'running' || job.state.result) return null;
  if (job.request.kind !== 'course') return { type: 'single' };
  const { outline, lessons } = job.state;
  if (!outline) return { type: 'outline' };
  const missing = lessons.findIndex((lesson) => lesson === null);
  if (missing >= 0) return { type: 'lesson', index: missing };
  if (job.state.finalExam === undefined) return { type: 'finalExam' };
  return { type: 'assemble' };
}

/** Lessons still to write, in order. Several can be written at once. */
export function missingLessons(state: JobState): number[] {
  return state.lessons.flatMap((lesson, index) => (lesson === null ? [index] : []));
}

/** The user approved the outline, possibly after editing it: start writing lessons. */
export function approveOutline(state: JobState, outline: Outline): JobState {
  return { ...state, outline, lessons: outline.lessons.map(() => null), finalExam: undefined };
}

/** Sends a prompt and returns the reply text. Supplied by the caller, so this file needs no network. */
export type Ask = (request: Omit<GenerateRequest, 'model'>) => Promise<{ text: string; usage: Usage }>;

export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly issues: ParseIssue[] = [],
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

type Spent = { usage: Usage & { requests: number }; fixes: Fix[] };

const addUsage = (total: Spent['usage'], usage: Usage): Spent['usage'] => ({
  inputTokens: total.inputTokens + usage.inputTokens,
  outputTokens: total.outputTokens + usage.outputTokens,
  requests: total.requests + 1,
});

const SYSTEM = 'You write learning content for a mobile study app. You follow the requested JSON format exactly.';

/**
 * Asks once, and if the reply cannot be used, asks once more with the exact problems listed.
 * `read` turns a reply into a value or describes what is wrong with it.
 */
async function askWithRepair<T>(
  ask: Ask,
  prompt: string,
  schema: Record<string, unknown>,
  maxTokens: number,
  read: (text: string) => { ok: true; value: T; fixes?: Fix[] } | { ok: false; outcome: Extract<ImportOutcome, { ok: false }> },
  spent: Spent,
): Promise<{ value: T; spent: Spent }> {
  const first = await askCounting(ask, { system: SYSTEM, prompt, schema, maxTokens }, spent);
  let reading = read(first.text);
  spent = first.spent;
  if (reading.ok) return { value: reading.value, spent: { ...spent, fixes: [...spent.fixes, ...(reading.fixes ?? [])] } };

  const repairPrompt = `${prompt}\n\n## Your previous reply\n\n${first.text}\n\n${buildFixPrompt(reading.outcome)}`;
  const second = await askCounting(ask, { system: SYSTEM, prompt: repairPrompt, schema, maxTokens }, spent);
  spent = second.spent;
  reading = read(second.text);
  if (reading.ok) return { value: reading.value, spent: { ...spent, fixes: [...spent.fixes, ...(reading.fixes ?? [])] } };

  const outcome = reading.outcome;
  throw new GenerationError(
    outcome.stage === 'json' ? 'The model did not reply with usable data.' : 'The reply did not match the format, even after one correction.',
    outcome.stage === 'content' ? outcome.issues : [],
  );
}

async function askCounting(ask: Ask, request: Omit<GenerateRequest, 'model'>, spent: Spent) {
  try {
    const reply = await ask({ ...request });
    return { text: reply.text, spent: { ...spent, usage: addUsage(spent.usage, reply.usage) } };
  } catch (error) {
    // Tokens spent on a failed request still count.
    if (error instanceof AiError && error.usage) {
      throw Object.assign(error, { spentSoFar: addUsage(spent.usage, error.usage) });
    }
    throw error;
  }
}

const lessonSchema = () => strictSchema(z.toJSONSchema(lessonFileSchema, { io: 'input' }) as Record<string, unknown>);

const readDocument = (kind: 'course' | 'quiz' | 'deck') => (text: string) => {
  const outcome = readImport(text);
  if (outcome.ok && outcome.kind === 'document' && outcome.document.format.startsWith(`${kind}/`)) {
    return { ok: true as const, value: outcome.document, fixes: outcome.fixes };
  }
  if (!outcome.ok) return { ok: false as const, outcome };
  return { ok: false as const, outcome: { ok: false as const, stage: 'content' as const, issues: [{ path: 'format', message: `Expected a ${kind}.` }] } };
};

const readLesson = (text: string) => {
  const outcome = readImport(text);
  if (outcome.ok && outcome.kind === 'lesson') return { ok: true as const, value: outcome.lesson, fixes: outcome.fixes };
  if (!outcome.ok) return { ok: false as const, outcome };
  return { ok: false as const, outcome: { ok: false as const, stage: 'content' as const, issues: [{ path: 'format', message: 'Expected "lesson/1".' }] } };
};

/** Runs one step and returns the new state. Never changes the state it is given. */
export async function runStep(step: Step, job: Pick<Job, 'request' | 'state'>, ask: Ask): Promise<{ state: JobState; status?: JobStatus }> {
  const { request, state } = job;
  const spent: Spent = { usage: state.usage, fixes: state.fixes };

  switch (step.type) {
    case 'single': {
      const prompt = buildPrompt(request);
      if (request.kind === 'lesson') {
        const { value, spent: after } = await askWithRepair(ask, prompt, lessonSchema(), 16000, readLesson, spent);
        return { state: { ...state, ...after, result: { lesson: value } }, status: 'ready' };
      }
      const kind = request.kind;
      const { value, spent: after } = await askWithRepair(ask, prompt, strictSchema(documentJsonSchema(kind)), 16000, readDocument(kind), spent);
      return { state: { ...state, ...after, result: { document: value } }, status: 'ready' };
    }

    case 'outline': {
      const { value, spent: after } = await askWithRepair(ask, outlinePrompt(request), strictSchema(z.toJSONSchema(outlineSchema, { io: 'input' }) as Record<string, unknown>), 4000, readOutline, spent);
      const outline = { ...value, lessons: value.lessons.slice(0, request.autoSize ? LIMITS.lessons[1] : request.lessons) };
      return { state: { ...state, ...after, outline, lessons: outline.lessons.map(() => null) }, status: 'outline' };
    }

    case 'lesson': {
      const outline = state.outline as Outline;
      const planned = outline.lessons[step.index];
      const prompt = buildPrompt({
        ...request,
        level: courseLevel(request, outline) ?? 'auto',
        kind: 'lesson',
        topic: planned.summary ? `${planned.title}\n\n${planned.summary}` : planned.title,
        course: {
          id: 'generated',
          title: outline.title,
          lessonTitles: outline.lessons.filter((_, index) => index !== step.index).map((lesson) => lesson.title),
        },
      });
      const { value, spent: after } = await askWithRepair(ask, prompt, lessonSchema(), 16000, readLesson, spent);
      const lessons = [...state.lessons];
      lessons[step.index] = { ...value, title: value.title || planned.title };
      return { state: { ...state, ...after, lessons } };
    }

    case 'finalExam': {
      const outline = state.outline as Outline;
      const material = outline.lessons.map((lesson, index) => `${index + 1}. ${lesson.title}${lesson.summary ? `: ${lesson.summary}` : ''}`).join('\n');
      try {
        const { value, spent: after } = await askWithRepair(
          ask,
          buildPrompt({
            ...request,
            level: courseLevel(request, outline) ?? 'auto',
            autoSize: false,
            kind: 'quiz',
            topic: `Final exam for the course "${outline.title}"`,
            questions: Math.min(15, Math.max(5, outline.lessons.length * 2)),
            quizMode: 'test',
            source: `The course covers these lessons:\n\n${material}`,
          }),
          strictSchema(documentJsonSchema('quiz')),
          16000,
          readDocument('quiz'),
          spent,
        );
        const quiz = value as Extract<LibraryDocument, { format: 'quiz/1' }>;
        return { state: { ...state, ...after, finalExam: { ...quiz.assessment, id: 'final-exam', title: undefined, mode: 'exam' } } };
      } catch (error) {
        // The lessons are the valuable part. A course without its exam is still worth keeping.
        if (error instanceof GenerationError) return { state: { ...state, finalExam: null } };
        throw error;
      }
    }

    case 'assemble':
      return { state: { ...state, result: { document: assembleCourse(request, state) } }, status: 'ready' };
  }
}

/** The course's level: the one asked for, or the one the model chose in the outline. */
function courseLevel(request: CreateRequest, outline: Outline | null) {
  return request.level === 'auto' ? outline?.level : request.level;
}

function outlinePrompt(request: CreateRequest): string {
  const size = request.autoSize
    ? `a course about the topic below. Choose how many lessons it needs, from ${LIMITS.lessons[0]} to ${LIMITS.lessons[1]}: few for a narrow topic or a request for something brief, more for a broad one`
    : `a course of ${request.lessons} lessons about:`;
  const lines = [
    '# Task',
    '',
    `Plan ${size}`,
    '',
    request.topic.trim(),
    '',
    levelLine(request.level, true),
    `- Language: write all text in the language with the tag \`${request.language}\``,
  ];
  if (request.audience?.trim()) lines.push(`- Audience: ${request.audience.trim()}`);
  if (request.source?.trim()) lines.push('', '## Source material', '', '<<<SOURCE', request.source.trim(), 'SOURCE>>>');
  lines.push(
    '',
    '## Reply',
    '',
    `Reply with one JSON object and nothing else: \`title\` (the course), \`description\` (one or two sentences),${request.level === 'auto' ? ' `level`,' : ''} and \`lessons\`, a list of`,
    `${request.autoSize ? 'the' : `exactly ${request.lessons}`} objects with \`title\` and a one-sentence \`summary\`. Each lesson teaches one idea and builds on the ones before it.`,
  );
  return `${lines.join('\n')}\n`;
}

function readOutline(text: string) {
  const extracted = extractJson(text);
  if (!extracted.ok) return { ok: false as const, outcome: { ok: false as const, stage: 'json' as const, problem: extracted.reason, detail: extracted.detail } };
  const parsed = outlineSchema.safeParse(extracted.value);
  if (parsed.success) return { ok: true as const, value: parsed.data };
  return {
    ok: false as const,
    outcome: {
      ok: false as const,
      stage: 'content' as const,
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    },
  };
}

/** Puts the written lessons and exam together. Ids that clash between lessons are renamed. */
export function assembleCourse(request: CreateRequest, state: JobState, random?: () => number): Course {
  const outline = state.outline as Outline;
  const slug = slugify(outline.title);
  let course: Course = {
    format: COURSE_FORMAT,
    id: slug ? `${slug.slice(0, 40)}-${newId('g', random).slice(2, 6)}` : newId('c', random),
    title: outline.title,
    ...(outline.description?.trim() ? { description: outline.description.trim() } : {}),
    language: request.language,
    ...(courseLevel(request, outline) ? { level: courseLevel(request, outline) } : {}),
    tags: [],
    lessons: [],
  };
  for (const lesson of state.lessons) {
    if (lesson) course = appendLesson(course, lesson);
  }
  if (state.finalExam) {
    const taken = new Set(course.lessons.flatMap((lesson) => lesson.assessments.flatMap((assessment) => assessment.questions.map((question) => question.id))));
    course = {
      ...course,
      finalExam: {
        ...state.finalExam,
        questions: state.finalExam.questions.map((question) => {
          let id = question.id;
          for (let suffix = 2; taken.has(id); suffix += 1) id = `${question.id}-${suffix}`;
          taken.add(id);
          return { ...question, id };
        }),
      },
    };
  }
  const checked = parseDocument(course);
  if (!checked.ok) throw new GenerationError('The finished course did not pass validation.', checked.issues);
  return checked.document as Course;
}
