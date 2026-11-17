export type ClozeSegment = { kind: 'text'; text: string } | { kind: 'gap'; gapId: string; number: number };

const GAP = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;

/** Splits a cloze text into plain text and numbered gaps, in reading order. */
export function clozeSegments(text: string): ClozeSegment[] {
  const segments: ClozeSegment[] = [];
  let position = 0;
  let number = 0;

  for (const match of text.matchAll(GAP)) {
    if (match.index > position) segments.push({ kind: 'text', text: text.slice(position, match.index) });
    number += 1;
    segments.push({ kind: 'gap', gapId: match[1], number });
    position = match.index + match[0].length;
  }
  if (position < text.length) segments.push({ kind: 'text', text: text.slice(position) });
  return segments;
}
