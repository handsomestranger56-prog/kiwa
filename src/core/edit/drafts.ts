import { type ParseIssue, type Question, type QuestionType, clozePlaceholders, formatPath, questionSchema } from '../schema';

/**
 * What a question looks like while it is being typed: everything is text and nothing has to be
 * valid yet. `questionFromDraft` turns it into a real question or says what is still wrong.
 */
export type QuestionDraft = {
  type: QuestionType;
  prompt: string;
  explanation: string;
  hint: string;
  points: number;
  /** single_choice, multiple_choice */
  options: string[];
  /** single_choice: one entry. multiple_choice: any number. Positions in `options`. */
  correct: number[];
  /** true_false */
  truth: boolean;
  /** short_answer */
  accepted: string[];
  /** cloze */
  text: string;
  /** cloze: keyed by gap id. Answers and options are comma separated. */
  gaps: Record<string, { accepted: string; options: string }>;
  /** essay */
  modelAnswer: string;
  rubric: string;
  minWords: string;
  /** flashcard */
  back: string;
  /** matching */
  pairs: { left: string; right: string }[];
  /** ordering: in the correct order */
  items: string[];
  /** categorize */
  categories: string[];
  sortItems: { text: string; category: number }[];
};

export function blankDraft(type: QuestionType): QuestionDraft {
  return {
    type,
    prompt: '',
    explanation: '',
    hint: '',
    points: 1,
    options: ['', ''],
    correct: type === 'single_choice' ? [0] : [],
    truth: true,
    accepted: [''],
    text: '',
    gaps: {},
    modelAnswer: '',
    rubric: '',
    minWords: '',
    back: '',
    pairs: [
      { left: '', right: '' },
      { left: '', right: '' },
    ],
    items: ['', ''],
    categories: ['', ''],
    sortItems: [
      { text: '', category: 0 },
      { text: '', category: 1 },
    ],
  };
}

export function draftFromQuestion(question: Question): QuestionDraft {
  const draft: QuestionDraft = {
    ...blankDraft(question.type),
    prompt: question.prompt,
    explanation: question.explanation ?? '',
    hint: question.hint ?? '',
    points: question.points,
  };

  switch (question.type) {
    case 'single_choice':
      return { ...draft, options: [...question.options], correct: [question.answer] };
    case 'multiple_choice':
      return { ...draft, options: [...question.options], correct: [...question.answers] };
    case 'true_false':
      return { ...draft, truth: question.answer };
    case 'short_answer':
      return { ...draft, accepted: [...question.accepted] };
    case 'cloze':
      return {
        ...draft,
        text: question.text,
        gaps: Object.fromEntries(
          question.gaps.map((gap) => [gap.id, { accepted: gap.accepted.join(', '), options: (gap.options ?? []).join(', ') }]),
        ),
      };
    case 'essay':
      return { ...draft, modelAnswer: question.modelAnswer, rubric: question.rubric ?? '', minWords: question.minWords ? String(question.minWords) : '' };
    case 'flashcard':
      return { ...draft, back: question.back };
    case 'matching':
      return { ...draft, pairs: question.pairs.map((pair) => ({ ...pair })) };
    case 'ordering':
      return { ...draft, items: [...question.items] };
    case 'categorize':
      return { ...draft, categories: [...question.categories], sortItems: question.items.map((item) => ({ ...item })) };
  }
}

/** Gap ids currently written in a cloze text, each with its answers so far. */
export function clozeGapIds(draft: QuestionDraft): string[] {
  return [...new Set(clozePlaceholders(draft.text))];
}

const list = (text: string) =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const filled = (rows: string[]) => rows.map((row) => row.trim()).filter(Boolean);

export type DraftResult = { ok: true; question: Question } | { ok: false; issues: ParseIssue[] };

/** Builds the question a draft describes. Empty rows are dropped and positions are adjusted to match. */
export function questionFromDraft(draft: QuestionDraft, id: string): DraftResult {
  const candidate: Record<string, unknown> = { id, type: draft.type, prompt: draft.prompt, points: draft.points };
  if (draft.explanation.trim()) candidate.explanation = draft.explanation;
  if (draft.hint.trim()) candidate.hint = draft.hint;

  // When empty option rows are dropped, the positions of the correct ones shift.
  const kept = draft.options.map((option, index) => ({ option: option.trim(), index })).filter((entry) => entry.option);
  const options = kept.map((entry) => entry.option);
  const correct = draft.correct.map((index) => kept.findIndex((entry) => entry.index === index)).filter((index) => index >= 0);

  switch (draft.type) {
    case 'single_choice':
      Object.assign(candidate, { options, answer: correct[0] ?? -1 });
      break;
    case 'multiple_choice':
      Object.assign(candidate, { options, answers: [...correct].sort((a, b) => a - b) });
      break;
    case 'true_false':
      candidate.answer = draft.truth;
      break;
    case 'short_answer':
      candidate.accepted = filled(draft.accepted);
      break;
    case 'cloze':
      candidate.text = draft.text;
      candidate.gaps = clozeGapIds(draft).map((gapId) => {
        const gap = draft.gaps[gapId] ?? { accepted: '', options: '' };
        const gapOptions = list(gap.options);
        return { id: gapId, accepted: list(gap.accepted), ...(gapOptions.length > 0 ? { options: gapOptions } : {}) };
      });
      break;
    case 'essay':
      candidate.modelAnswer = draft.modelAnswer;
      if (draft.rubric.trim()) candidate.rubric = draft.rubric;
      if (draft.minWords.trim()) candidate.minWords = Number(draft.minWords);
      break;
    case 'flashcard':
      candidate.back = draft.back;
      break;
    case 'matching':
      candidate.pairs = draft.pairs.map((pair) => ({ left: pair.left.trim(), right: pair.right.trim() })).filter((pair) => pair.left || pair.right);
      break;
    case 'ordering':
      candidate.items = filled(draft.items);
      break;
    case 'categorize': {
      const groups = draft.categories.map((category, index) => ({ category: category.trim(), index })).filter((entry) => entry.category);
      candidate.categories = groups.map((entry) => entry.category);
      candidate.items = draft.sortItems
        .filter((item) => item.text.trim())
        .map((item) => ({ text: item.text.trim(), category: groups.findIndex((entry) => entry.index === item.category) }));
      break;
    }
  }

  const parsed = questionSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, question: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({ path: formatPath(issue.path), message: issue.message })),
  };
}
