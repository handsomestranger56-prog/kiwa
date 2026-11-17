import { RELEARN_DELAY, START_EASE, cardsAfterAttempt, newCard, qualityFromOutcome, qualityFromRating, review } from './scheduler';

const DAY = 24 * 60 * 60_000;

describe('review scheduler', () => {
  it('spaces successes out: a day, three days, then about a week', () => {
    let card = newCard('item', 'q', 0);
    card = review(card, 2, 0);
    expect(card).toMatchObject({ interval: 1, dueAt: DAY, streak: 1 });
    card = review(card, 2, card.dueAt);
    expect(card.interval).toBe(3);
    card = review(card, 2, card.dueAt);
    expect(card.interval).toBe(7);
    card = review(card, 2, card.dueAt);
    expect(card.interval).toBe(16);
    expect(card.ease).toBe(START_EASE);
  });

  it('brings a miss back soon and starts the gaps over', () => {
    let card = review(review(newCard('item', 'q', 0), 2, 0), 2, DAY);
    card = review(card, 0, 4 * DAY);
    expect(card).toMatchObject({ dueAt: 4 * DAY + RELEARN_DELAY, interval: 0, streak: 0, lapses: 1 });
    expect(card.ease).toBeCloseTo(START_EASE - 0.2);
    card = review(card, 2, card.dueAt);
    expect(card.interval).toBe(1);
  });

  it('does not count the first miss as a lapse', () => {
    expect(review(newCard('item', 'q', 0), 0, 0).lapses).toBe(0);
  });

  it('grows slower when shaky and faster when easy, within limits', () => {
    const shaky = review(review(newCard('i', 'q', 0), 1, 0), 1, DAY);
    expect(shaky.interval).toBe(2);
    const easy = review(newCard('i', 'q', 0), 3, 0);
    expect(easy.interval).toBe(3);
    let hard = newCard('i', 'q', 0);
    for (let round = 0; round < 20; round += 1) hard = review(hard, 1, round * DAY);
    expect(hard.ease).toBe(1.3);
    let long = newCard('i', 'q', 0);
    for (let round = 0; round < 30; round += 1) long = review(long, 3, long.dueAt);
    expect(long.interval).toBe(365);
  });

  it('maps outcomes and ratings to qualities', () => {
    expect(['incorrect', 'partial', 'correct'].map((outcome) => qualityFromOutcome(outcome as never))).toEqual([0, 1, 2]);
    expect(['again', 'hard', 'good', 'easy'].map((rating) => qualityFromRating(rating as never))).toEqual([0, 1, 2, 3]);
  });

  it('adds missed questions and flashcards after an attempt, and moves existing cards on', () => {
    const existing = new Map([['known', review(newCard('item', 'known', 0), 2, 0)]]);
    const cards = cardsAfterAttempt(
      [
        { questionId: 'right', quality: 2, flashcard: false },
        { questionId: 'wrong', quality: 0, flashcard: false },
        { questionId: 'half', quality: 1, flashcard: false },
        { questionId: 'card', quality: 3, flashcard: true },
        { questionId: 'known', quality: 2, flashcard: false },
      ],
      existing,
      'item',
      5 * DAY,
    );
    expect(cards.map((card) => [card.questionId, card.interval])).toEqual([
      ['wrong', 0],
      ['half', 1],
      ['card', 3],
      ['known', 3],
    ]);
  });
});
