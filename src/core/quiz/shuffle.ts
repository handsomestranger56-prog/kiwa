/**
 * A shuffle that depends only on the seed, so a question shows its items in the same
 * mixed order every time without that order having to be stored.
 * Never returns the original order when there is more than one item.
 */
export function stableShuffle(count: number, seed: string): number[] {
  const order = seededOrder(count, seed);
  if (count > 1 && order.every((value, index) => value === index)) {
    order.push(order.shift() as number);
  }
  return order;
}

/**
 * Positions 0 to count - 1 in an order that depends only on the seed. Unlike `stableShuffle`, the
 * original order is as likely as any other, so with answer options every position is equally likely
 * to hold the right one.
 */
export function seededOrder(count: number, seed: string): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  let state = hash(seed) || 1;
  const random = () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };

  for (let index = count - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  return order;
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}
