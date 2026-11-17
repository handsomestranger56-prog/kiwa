import { z } from 'zod';

import { newId } from '../ids';
import {
  type Course,
  type DocumentKind,
  type Lesson,
  type LibraryDocument,
  type ParseIssue,
  COURSE_FORMAT,
  assessmentModeSchema,
  formatPath,
  idSchema,
  kindOf,
  lessonSchema,
  parseDocument,
} from '../schema';
import { extractJson } from './extract';
import { type Fix, BACKUP_FORMAT, LESSON_FORMAT, repairImport, slugify } from './repair';

/** One lesson on its own, for moving a lesson between courses or generating one with AI. */
export const lessonFileSchema = z.object({
  format: z.literal(LESSON_FORMAT),
  /** The course the lesson was written for. Only a suggestion when importing. */
  courseId: idSchema.optional(),
  lesson: lessonSchema,
});

const backupItemSchema = z.object({
  document: z.unknown(),
  source: z.enum(['manual', 'sample', 'imported', 'generated']).default('imported'),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable().default(null),
  marks: z
    .array(z.object({ lessonId: z.string().default(''), kind: z.enum(['favorite', 'bookmark', 'completed']), createdAt: z.number().int() }))
    .default([]),
  lastLesson: z.string().nullable().default(null),
  attempts: z
    .array(
      z.object({
        id: idSchema,
        lessonId: z.string().default(''),
        assessmentId: z.string(),
        mode: assessmentModeSchema,
        state: z.object({
          questionIds: z.array(z.string()),
          index: z.number().int().nonnegative(),
          answers: z.record(z.string(), z.unknown()),
          checked: z.array(z.string()),
          ai: z.record(z.string(), z.unknown()).optional(),
          explanations: z.record(z.string(), z.unknown()).optional(),
        }),
        startedAt: z.number().int(),
        finishedAt: z.number().int().nullable(),
        earned: z.number().nullable(),
        total: z.number().nullable(),
        passed: z.boolean().nullable(),
      }),
    )
    .default([]),
});

/** Everything on the device except API keys, which never leave the secure store. */
export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  createdAt: z.number().int(),
  items: z.array(backupItemSchema),
  settings: z.record(z.string(), z.string()).default({}),
  /** Provider settings without their API keys. Keys never leave the device's secure store. */
  providers: z
    .array(
      z.object({
        id: idSchema,
        kind: z.enum(['claude', 'gemini', 'openai']),
        label: z.string(),
        baseUrl: z.string().nullable().default(null),
        models: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
        enabled: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export type BackupItem = Omit<z.infer<typeof backupItemSchema>, 'document'> & { document: LibraryDocument };
export type Backup = Omit<z.infer<typeof backupSchema>, 'items'> & { items: BackupItem[] };

export type JsonProblem = 'empty' | 'noJson' | 'cutOff' | 'invalid';

export type ImportOutcome =
  | { ok: true; kind: 'document'; document: LibraryDocument; fixes: Fix[] }
  | { ok: true; kind: 'lesson'; lesson: Lesson; courseId: string | null; fixes: Fix[] }
  | { ok: true; kind: 'backup'; backup: Backup }
  /** The text is not JSON at all. */
  | { ok: false; stage: 'json'; problem: JsonProblem; detail?: string }
  /** It is JSON, but not a valid course, quiz, deck, lesson or backup. */
  | { ok: false; stage: 'content'; issues: ParseIssue[] };

/** Reads a file or a pasted chatbot reply. Never throws. */
export function readImport(text: string): ImportOutcome {
  const extracted = extractJson(text);
  if (!extracted.ok) return { ok: false, stage: 'json', problem: extracted.reason, detail: extracted.detail };

  const { value, fixes } = repairImport(extracted.value);

  if (value.format === BACKUP_FORMAT) return readBackup(value);

  if (value.format === LESSON_FORMAT) {
    const parsed = lessonFileSchema.safeParse(value);
    if (!parsed.success) return { ok: false, stage: 'content', issues: parsed.error.issues.map(toIssue) };
    const duplicates = duplicateQuestionIssues(parsed.data.lesson);
    if (duplicates.length > 0) return { ok: false, stage: 'content', issues: duplicates };
    return { ok: true, kind: 'lesson', lesson: parsed.data.lesson, courseId: parsed.data.courseId ?? null, fixes };
  }

  const parsed = parseDocument(value);
  if (!parsed.ok) return { ok: false, stage: 'content', issues: parsed.issues };
  return { ok: true, kind: 'document', document: parsed.document, fixes };
}

function readBackup(value: unknown): ImportOutcome {
  const parsed = backupSchema.safeParse(value);
  if (!parsed.success) return { ok: false, stage: 'content', issues: parsed.error.issues.map(toIssue) };

  const items: BackupItem[] = [];
  const issues: ParseIssue[] = [];
  parsed.data.items.forEach((item, index) => {
    const document = parseDocument(item.document);
    if (document.ok) {
      items.push({ ...item, document: document.document });
    } else {
      for (const issue of document.issues) {
        issues.push({ path: `items[${index}].document${issue.path ? `.${issue.path}` : ''}`, message: issue.message });
      }
    }
  });

  if (issues.length > 0) return { ok: false, stage: 'content', issues };
  return { ok: true, kind: 'backup', backup: { ...parsed.data, items } };
}

function duplicateQuestionIssues(lesson: Lesson): ParseIssue[] {
  const seen = new Set<string>();
  const issues: ParseIssue[] = [];
  lesson.assessments.forEach((assessment, assessmentIndex) => {
    assessment.questions.forEach((question, questionIndex) => {
      if (seen.has(question.id)) {
        issues.push({
          path: `lesson.assessments[${assessmentIndex}].questions[${questionIndex}].id`,
          message: `Another question already uses the id "${question.id}".`,
        });
      }
      seen.add(question.id);
    });
  });
  return issues;
}

function toIssue(issue: z.core.$ZodIssue): ParseIssue {
  return { path: formatPath(issue.path), message: issue.message };
}

export type TextFile = { name: string; text: string; mimeType: string };

const KIND_SUFFIX: Record<DocumentKind, string> = { course: 'course', quiz: 'quiz', deck: 'deck' };

/** A course, quiz or deck as a shareable file. Carries content only, never marks or results. */
export function documentFile(document: LibraryDocument): TextFile {
  const kind = kindOf(document);
  return {
    name: `${slugify(document.title) || kind}.${KIND_SUFFIX[kind]}.json`,
    text: `${JSON.stringify(document, null, 2)}\n`,
    mimeType: 'application/json',
  };
}

export function lessonFile(lesson: Lesson, courseId: string): TextFile {
  return {
    name: `${slugify(lesson.title) || 'lesson'}.lesson.json`,
    text: `${JSON.stringify({ format: LESSON_FORMAT, courseId, lesson }, null, 2)}\n`,
    mimeType: 'application/json',
  };
}

export function backupFile(backup: Backup): TextFile {
  const date = new Date(backup.createdAt).toISOString().slice(0, 10);
  return { name: `anki-backup-${date}.json`, text: `${JSON.stringify(backup)}\n`, mimeType: 'application/json' };
}

/** The same content under a fresh id, for keeping an import next to the item it would replace. */
export function asCopy(document: LibraryDocument, titleSuffix: string, random?: () => number): LibraryDocument {
  const prefix = { course: 'c', quiz: 'z', deck: 'd' }[kindOf(document)];
  return { ...document, id: newId(prefix, random), title: `${document.title}${titleSuffix}`.slice(0, 200) };
}

/**
 * Adds a lesson to the end of a course. Ids that would clash with ones the course
 * already uses are renamed, so marks and results on existing lessons stay attached.
 */
export function appendLesson(course: Course, lesson: Lesson): Course {
  const lessonIds = new Set(course.lessons.map((existing) => existing.id));
  const assessmentIds = new Set<string>();
  const questionIds = new Set<string>();
  const collect = (assessments: Lesson['assessments']) => {
    for (const assessment of assessments) {
      assessmentIds.add(assessment.id);
      for (const question of assessment.questions) questionIds.add(question.id);
    }
  };
  course.lessons.forEach((existing) => collect(existing.assessments));
  if (course.finalExam) collect([course.finalExam]);

  const unique = (id: string, taken: Set<string>) => {
    let candidate = id;
    for (let suffix = 2; taken.has(candidate); suffix += 1) candidate = `${id}-${suffix}`.slice(0, 64);
    taken.add(candidate);
    return candidate;
  };

  const added: Lesson = {
    ...lesson,
    id: unique(lesson.id, lessonIds),
    assessments: lesson.assessments.map((assessment) => ({
      ...assessment,
      id: unique(assessment.id, assessmentIds),
      questions: assessment.questions.map((question) => ({ ...question, id: unique(question.id, questionIds) })),
    })),
  };

  return { ...course, format: COURSE_FORMAT, lessons: [...course.lessons, added] };
}

/** A lesson's teaching text as plain Markdown, for use as source material in a prompt. */
export function lessonText(lesson: Lesson): string {
  const parts = [`# ${lesson.title}`];
  for (const block of lesson.blocks) {
    if (block.type === 'text' || block.type === 'callout') parts.push(block.markdown);
    else if (block.type === 'code') parts.push(block.code);
  }
  return parts.join('\n\n');
}
