/**
 * The small part of Markdown that lesson text may use:
 * paragraphs, # headings (three levels), bulleted and numbered lists,
 * **bold**, *italic*, `code` and [links](https://example.com).
 * Anything else is shown as written.
 */

export type Inline = { text: string; bold?: true; italic?: true; code?: true; href?: string };

export type MarkdownBlock =
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', inlines: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
      list = null;
    }
  };

  for (const rawLine of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, inlines: parseInline(heading[2]) });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = numbered !== null;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    if (list) {
      // An indented line continues the previous list item.
      if (/^\s+/.test(rawLine)) {
        list.items[list.items.length - 1] += ` ${line.trim()}`;
        continue;
      }
      flushList();
    }
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+?\*\*)|(\*[^*\s](?:[^*]*?[^*\s])?\*)|(_[^_\s](?:[^_]*?[^_\s])?_)|(\[[^\]]+\]\([^)\s]+\))/;

const WORD_CHAR = /[A-Za-z0-9]/;

export function parseInline(source: string): Inline[] {
  const inlines: Inline[] = [];
  let rest = source;

  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match) {
      pushText(inlines, rest);
      break;
    }
    const token = match[0];

    // Underscores inside a word, as in snake_case_name, are not emphasis.
    if (match[4]) {
      const before = rest[match.index - 1] ?? '';
      const after = rest[match.index + token.length] ?? '';
      if (WORD_CHAR.test(before) || WORD_CHAR.test(after)) {
        pushText(inlines, rest.slice(0, match.index + 1));
        rest = rest.slice(match.index + 1);
        continue;
      }
    }

    if (match.index > 0) pushText(inlines, rest.slice(0, match.index));

    if (match[1]) {
      inlines.push({ text: token.slice(1, -1), code: true });
    } else if (match[2]) {
      inlines.push({ text: token.slice(2, -2), bold: true });
    } else if (match[3] || match[4]) {
      inlines.push({ text: token.slice(1, -1), italic: true });
    } else {
      const close = token.indexOf('](');
      const href = token.slice(close + 2, -1);
      const text = token.slice(1, close);
      // Only web links are followed. Anything else stays visible as plain text.
      if (/^https?:\/\//i.test(href)) inlines.push({ text, href });
      else pushText(inlines, token);
    }
    rest = rest.slice(match.index + token.length);
  }

  return inlines;
}

function pushText(inlines: Inline[], text: string) {
  const last = inlines[inlines.length - 1];
  if (last && !last.bold && !last.italic && !last.code && !last.href) last.text += text;
  else inlines.push({ text });
}
