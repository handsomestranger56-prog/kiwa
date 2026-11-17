/**
 * When a question comes back for review. Missed questions and flashcards return after gaps that
 * grow with each success: about a day, then three, then a week, then longer. A miss starts over.
 */

export type ReviewCard = {
  itemId: string;
  questionId: string;
  dueAt: number;
  /** Days until the next review after the last success. 0 while being relearned. */
  interval: number;
  /** How fast the gaps grow. */
  ease: number;
  /** Successes in a row. */
  streak: number;
  lapses: number;
  lastReviewedAt: number | null;
};

/** How well it went: missed, shaky, right, or easy. */
export type Quality = 0 | 1 | 2 | 3;

const DAY = 24 * 60 * 60_000;
/** A missed question comes back in the same session if the learner keeps going, or soon after. */
export const RELEARN_DELAY = 10 * 60_000;
export const START_EASE = 2.3;
const MIN_EASE = 1.3;
const MAX_INTERVAL = 365;

export function newCard(itemId: string, questionId: string, now: number): ReviewCard {
  return { itemId, questionId, dueAt: now, interval: 0, ease: START_EASE, streak: 0, lapses: 0, lastReviewedAt: null };
}

export function review(card: ReviewCard, quality: Quality, now: number): ReviewCard {
  if (quality === 0) {
    return {
      ...card,
      dueAt: now + RELEARN_DELAY,
      interval: 0,
      ease: Math.max(MIN_EASE, card.ease - 0.2),
      streak: 0,
      lapses: card.streak > 0 || card.lastReviewedAt !== null ? card.lapses + 1 : card.lapses,
      lastReviewedAt: now,
    };
  }

  const ease = Math.max(MIN_EASE, card.ease + (quality === 1 ? -0.15 : quality === 3 ? 0.15 : 0));
  let interval: number;
  if (card.streak === 0) interval = quality === 3 ? 3 : 1;
  else if (card.streak === 1) interval = quality === 1 ? 2 : quality === 3 ? 5 : 3;
  else interval = Math.round(card.interval * (quality === 1 ? 1.2 : quality === 3 ? ease * 1.3 : ease));

  interval = Math.min(MAX_INTERVAL, Math.max(1, interval));
  return { ...card, dueAt: now + interval * DAY, interval, ease, streak: card.streak + 1, lastReviewedAt: now };
}

/** Turns an outcome of the quiz engine into a review quality. */
export function qualityFromOutcome(outcome: 'correct' | 'partial' | 'incorrect'): Quality {
  return outcome === 'correct' ? 2 : outcome === 'partial' ? 1 : 0;
}

export function qualityFromRating(rating: 'again' | 'hard' | 'good' | 'easy'): Quality {
  return rating === 'again' ? 0 : rating === 'hard' ? 1 : rating === 'good' ? 2 : 3;
}

/**
 * What one finished attempt means for the review queue. A question gets a card when it was missed
 * or is a flashcard. Questions that already have a card move on according to how they went.
 * Returns the cards to save.
 */
export function cardsAfterAttempt(
  results: { questionId: string; quality: Quality; flashcard: boolean }[],
  existing: ReadonlyMap<string, ReviewCard>,
  itemId: string,
  now: number,
): ReviewCard[] {
  const changed: ReviewCard[] = [];
  for (const result of results) {
    const card = existing.get(result.questionId);
    if (card) {
      // Answering early, inside a regular quiz, still counts as a review.
      changed.push(review(card, result.quality, now));
    } else if (result.quality < 2 || result.flashcard) {
      changed.push(review(newCard(itemId, result.questionId, now), result.quality, now));
    }
  }
  return changed;
}
