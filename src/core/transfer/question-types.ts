import type { ParseIssue, QuestionType } from '../schema';

/** One valid question of each type, about the same small topic, for the examples in prompts. */
export const EXAMPLE_QUESTIONS: Record<QuestionType, Record<string, unknown>> = {
  single_choice: {
    type: 'single_choice',
    prompt: 'What happens to the boiling point of water as you climb?',
    options: ['It rises', 'It falls', 'It stays the same'],
    answer: 1,
    explanation: 'Less air pressure means water reaches boiling at a lower temperature.',
  },
  multiple_choice: {
    type: 'multiple_choice',
    prompt: 'Which of these lower the boiling point of water?',
    options: ['Climbing a mountain', 'A pressure cooker', 'A storm with low air pressure'],
    answers: [0, 2],
    explanation: 'Both mean less air pressure. A pressure cooker raises the pressure.',
  },
  true_false: { type: 'true_false', prompt: 'Water boils at a lower temperature at high altitude.', answer: true, explanation: 'There is less air pressure higher up.' },
  short_answer: { type: 'short_answer', prompt: 'At sea level, water boils at how many degrees Celsius?', accepted: ['100', '100 °C', 'one hundred'], explanation: 'At normal sea-level pressure it is 100 °C.' },
  cloze: {
    type: 'cloze',
    prompt: 'Complete the sentence.',
    text: 'At high altitude the air pressure is {{1}}, so water boils at a {{2}} temperature.',
    gaps: [
      { id: '1', accepted: ['lower', 'less'] },
      { id: '2', accepted: ['lower'], options: ['lower', 'higher'] },
    ],
    explanation: 'Boiling starts when vapour pressure matches the surrounding pressure.',
  },
  essay: {
    type: 'essay',
    prompt: 'Explain why pasta takes longer to cook on a mountain.',
    modelAnswer: 'Air pressure is lower at altitude, so water boils at a lower temperature. The water around the pasta is cooler than at sea level, so it cooks more slowly.',
    rubric: 'Mentions lower air pressure, the lower boiling point, and that cooler water cooks more slowly.',
    minWords: 40,
  },
  flashcard: { type: 'flashcard', prompt: 'Boiling point of water at sea level', back: '100 °C' },
  matching: {
    type: 'matching',
    prompt: 'Match each place with its boiling point.',
    pairs: [
      { left: 'Sea level', right: '100 °C' },
      { left: '3000 m', right: 'about 90 °C' },
    ],
  },
  ordering: { type: 'ordering', prompt: 'Order the places from highest to lowest boiling point.', items: ['Sea level', 'A hill town', 'A mountain top'] },
  categorize: {
    type: 'categorize',
    prompt: 'Sort each change by its effect on the boiling point.',
    categories: ['Raises it', 'Lowers it'],
    items: [
      { text: 'A pressure cooker', category: 0 },
      { text: 'Climbing higher', category: 1 },
    ],
  },
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The question type a schema variant stands for, when it is one. */
function variantType(node: unknown): string | null {
  if (!isObject(node) || !isObject(node.properties)) return null;
  const type = node.properties.type;
  return isObject(type) && typeof type.const === 'string' ? type.const : null;
}

/**
 * The same JSON Schema, with every choice between question shapes cut down to the allowed types.
 * Providers that enforce a schema then cannot return any other type.
 */
export function restrictQuestionTypes<T>(schema: T, allowed: readonly QuestionType[]): T {
  const keep = new Set<string>(allowed);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!isObject(node)) return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if ((key === 'oneOf' || key === 'anyOf') && Array.isArray(value) && value.length > 0 && value.every((member) => variantType(member) !== null)) {
        const kept = value.filter((member) => keep.has(variantType(member) as string));
        out[key] = (kept.length > 0 ? kept : value).map(walk);
      } else {
        out[key] = walk(value);
      }
    }
    return out;
  };
  return walk(schema) as T;
}

/** Every question in a course, quiz, deck or lesson file whose type was not asked for. */
export function disallowedQuestionIssues(value: unknown, allowed: readonly QuestionType[]): ParseIssue[] {
  const keep = new Set<string>(allowed);
  const issues: ParseIssue[] = [];
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`));
      return;
    }
    if (!isObject(node)) return;
    for (const [key, child] of Object.entries(node)) {
      const at = path ? `${path}.${key}` : key;
      if ((key === 'questions' || key === 'cards') && Array.isArray(child)) {
        child.forEach((question, index) => {
          const type = isObject(question) ? question.type : undefined;
          if (typeof type === 'string' && !keep.has(type)) {
            issues.push({ path: `${at}[${index}].type`, message: `"${type}" was not asked for. Use only these question types: ${[...keep].join(', ')}.` });
          }
        });
      } else {
        walk(child, at);
      }
    }
  };
  walk(value, '');
  return issues;
}
