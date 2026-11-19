import { COURSE_FORMAT, DECK_FORMAT, QUIZ_FORMAT } from '../schema';
import { cleanSvg } from '../svg';

export const LESSON_FORMAT = 'lesson/1';
export const BACKUP_FORMAT = 'backup/1';
/** A named group of courses, quizzes and flashcards, exported together. */
export const GROUP_FORMAT = 'group/1';

/** Something that was put right automatically. Shown to the user so nothing changes silently. */
export type Fix =
  | { code: 'inferredFormat'; format: string }
  | { code: 'addedIds'; count: number }
  | { code: 'renamedIds'; count: number }
  | { code: 'convertedAnswers'; count: number };

type Json = Record<string, unknown>;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Corrects the slips language models make most often, before validation:
 * a missing `format`, missing or repeated ids, an answer given as text instead of an index.
 * Never changes the meaning of the content. Anything it cannot fix is left for validation to report.
 */
export function repairImport(input: Json): { value: Json; fixes: Fix[] } {
  const value = structuredCloneJson(input);
  const counts = { added: 0, renamed: 0, converted: 0 };
  const fixes: Fix[] = [];

  const format = normalizeFormat(value);
  if (format.inferred) fixes.push({ code: 'inferredFormat', format: format.value });
  if (format.value) value.format = format.value;

  const used = new Set<string>();
  const claim = (holder: Json, fallback: string) => {
    const current = holder.id;
    const valid = typeof current === 'string' && ID_PATTERN.test(current);
    if (valid && !used.has(current)) {
      used.add(current);
      return current;
    }
    let candidate = fallback;
    for (let suffix = 2; used.has(candidate); suffix += 1) candidate = `${fallback}-${suffix}`;
    if (valid) counts.renamed += 1;
    else counts.added += 1;
    holder.id = candidate;
    used.add(candidate);
    return candidate;
  };

  const fixAssessment = (assessment: unknown, fallbackId: string, scope: Set<string>) => {
    if (!isObject(assessment)) return;
    const id = claimIn(scope, assessment, fallbackId, counts);
    asObjects(assessment.questions).forEach((question, index) => {
      claim(question, `${id}-q${index + 1}`);
      fixQuestion(question, counts);
    });
  };

  const fixLesson = (lesson: Json, index: number, lessonIds: Set<string>, assessmentIds: Set<string>) => {
    const id = claimIn(lessonIds, lesson, `lesson-${index + 1}`, counts);
    asObjects(lesson.blocks).forEach(normalizeType);
    asObjects(lesson.blocks).forEach(fixSvgBlock);
    asObjects(lesson.assessments).forEach((assessment, assessmentIndex) =>
      fixAssessment(assessment, `${id}-a${assessmentIndex + 1}`, assessmentIds),
    );
  };

  const lessonIds = new Set<string>();
  const assessmentIds = new Set<string>();

  switch (value.format) {
    case COURSE_FORMAT:
      ensureTopId(value, 'course', counts);
      asObjects(value.lessons).forEach((lesson, index) => fixLesson(lesson, index, lessonIds, assessmentIds));
      fixAssessment(value.finalExam, 'final', assessmentIds);
      break;
    case QUIZ_FORMAT:
      ensureTopId(value, 'quiz', counts);
      fixAssessment(value.assessment, 'quiz', assessmentIds);
      break;
    case DECK_FORMAT:
      ensureTopId(value, 'deck', counts);
      asObjects(value.cards).forEach((card, index) => {
        if (card.type === undefined) card.type = 'flashcard';
        if (card.prompt === undefined && typeof card.front === 'string') card.prompt = card.front;
        claim(card, `card-${index + 1}`);
        fixQuestion(card, counts);
      });
      break;
    case LESSON_FORMAT:
      if (isObject(value.lesson)) fixLesson(value.lesson, 0, lessonIds, assessmentIds);
      break;
  }

  if (counts.added > 0) fixes.push({ code: 'addedIds', count: counts.added });
  if (counts.renamed > 0) fixes.push({ code: 'renamedIds', count: counts.renamed });
  if (counts.converted > 0) fixes.push({ code: 'convertedAnswers', count: counts.converted });
  return { value, fixes };
}

type Counts = { added: number; renamed: number; converted: number };

/** Like `claim`, but unique within one kind of thing (lessons, assessments) instead of all questions. */
function claimIn(scope: Set<string>, holder: Json, fallback: string, counts: Counts): string {
  const current = holder.id;
  const valid = typeof current === 'string' && ID_PATTERN.test(current);
  if (valid && !scope.has(current)) {
    scope.add(current);
    return current;
  }
  let candidate = fallback;
  for (let suffix = 2; scope.has(candidate); suffix += 1) candidate = `${fallback}-${suffix}`;
  if (valid) counts.renamed += 1;
  else counts.added += 1;
  holder.id = candidate;
  scope.add(candidate);
  return candidate;
}

function ensureTopId(value: Json, prefix: string, counts: Counts) {
  if (typeof value.id === 'string' && ID_PATTERN.test(value.id)) return;
  const slug = typeof value.title === 'string' ? slugify(value.title) : '';
  value.id = slug ? `${prefix}-${slug}` : prefix;
  counts.added += 1;
}

function fixQuestion(question: Json, counts: Counts) {
  normalizeType(question);
  const options = Array.isArray(question.options) ? question.options : null;
  const indexOf = (answer: unknown) => (options && typeof answer === 'string' ? options.indexOf(answer) : -1);

  if (question.type === 'single_choice') {
    const index = indexOf(question.answer);
    if (index >= 0) {
      question.answer = index;
      counts.converted += 1;
    }
  }

  if (question.type === 'multiple_choice' && Array.isArray(question.answers)) {
    const indexes = question.answers.map(indexOf);
    if (indexes.length > 0 && indexes.every((index) => index >= 0)) {
      question.answers = indexes;
      counts.converted += 1;
    }
  }

  if (question.type === 'true_false' && typeof question.answer === 'string') {
    const text = question.answer.trim().toLowerCase();
    if (text === 'true' || text === 'false') {
      question.answer = text === 'true';
      counts.converted += 1;
    }
  }

  // A group given by name instead of by position.
  if (question.type === 'categorize' && Array.isArray(question.categories)) {
    const categories = question.categories;
    let changed = false;
    asObjects(question.items).forEach((item) => {
      const index = typeof item.category === 'string' ? categories.indexOf(item.category) : -1;
      if (index >= 0) {
        item.category = index;
        changed = true;
      }
    });
    if (changed) counts.converted += 1;
  }

  // An ordering written as objects with a text field.
  if (question.type === 'ordering' && Array.isArray(question.items)) {
    question.items = question.items.map((item) => (isObject(item) && typeof item.text === 'string' ? item.text : item));
  }

  if (question.type === 'cloze') {
    asObjects(question.gaps).forEach((gap) => {
      if (typeof gap.id === 'number') gap.id = String(gap.id);
    });
  }
}

/** "Multiple-Choice" and "multiple choice" both mean `multiple_choice`. */
function normalizeType(holder: Json) {
  if (typeof holder.type === 'string') {
    holder.type = holder.type.trim().toLowerCase().replace(/[\s-]+/g, '_');
  }
}

/** Pictures arrive as `svg`, or under `code` or `content`. Unsafe parts are removed before validation. */
function fixSvgBlock(block: Json) {
  if (block.type !== 'svg') return;
  if (typeof block.svg !== 'string') {
    const found = [block.code, block.content, block.markup].find((value) => typeof value === 'string');
    if (typeof found === 'string') block.svg = found;
  }
  if (typeof block.svg === 'string') {
    const cleaned = cleanSvg(block.svg);
    if (cleaned.ok) block.svg = cleaned.svg;
  }
}

function normalizeFormat(value: Json): { value: string; inferred: boolean } {
  const known = [COURSE_FORMAT, QUIZ_FORMAT, DECK_FORMAT, LESSON_FORMAT, BACKUP_FORMAT];
  const given = typeof value.format === 'string' ? value.format.trim().toLowerCase() : '';
  if (known.includes(given)) return { value: given, inferred: false };

  // "course", "Course/1.0" and similar still say clearly what was meant.
  const byName = known.find((format) => given.split('/')[0] === format.split('/')[0]);
  if (byName) return { value: byName, inferred: given !== byName };

  if (Array.isArray(value.lessons)) return { value: COURSE_FORMAT, inferred: true };
  if (isObject(value.assessment)) return { value: QUIZ_FORMAT, inferred: true };
  if (Array.isArray(value.cards)) return { value: DECK_FORMAT, inferred: true };
  if (isObject(value.lesson)) return { value: LESSON_FORMAT, inferred: true };
  return { value: typeof value.format === 'string' ? value.format : '', inferred: false };
}

export function slugify(text: string, maxLength = 40): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/, '');
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObjects(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
