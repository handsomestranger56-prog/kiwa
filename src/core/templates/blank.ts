import { newId } from '../ids';
import {
  type Course,
  type Deck,
  type DocumentKind,
  type LibraryDocument,
  type Quiz,
  COURSE_FORMAT,
  DECK_FORMAT,
  QUIZ_FORMAT,
} from '../schema';

const ID_PREFIX: Record<DocumentKind, string> = { course: 'c', quiz: 'z', deck: 'd' };

/** The empty starting point for each kind. Editing and generation both begin here. */
export function blankDocument(
  kind: DocumentKind,
  title: string,
  options: { language?: string; random?: () => number } = {},
): LibraryDocument {
  const meta = {
    id: newId(ID_PREFIX[kind], options.random),
    title: title.trim(),
    language: options.language ?? 'en',
    tags: [],
  };

  switch (kind) {
    case 'course':
      return { format: COURSE_FORMAT, ...meta, lessons: [] } satisfies Course;
    case 'quiz':
      return {
        format: QUIZ_FORMAT,
        ...meta,
        assessment: { id: newId('a', options.random), mode: 'practice', passMark: 0.7, questions: [] },
      } satisfies Quiz;
    case 'deck':
      return { format: DECK_FORMAT, ...meta, cards: [] } satisfies Deck;
  }
}
