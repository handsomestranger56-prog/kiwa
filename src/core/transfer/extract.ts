export type ExtractResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: 'empty' | 'noJson' | 'cutOff' | 'invalid'; detail?: string };

/**
 * Finds the JSON object in a chatbot reply or a file.
 * Copes with a code fence around it, sentences before or after it, and trailing commas.
 */
export function extractJson(input: string): ExtractResult {
  const text = input.replace(/^﻿/, '').trim();
  if (!text) return { ok: false, reason: 'empty' };

  const candidates = [text, ...fencedBlocks(text)];
  const braced = outermostObject(text);
  if (braced.text) candidates.push(braced.text);

  let detail: string | undefined;
  for (const candidate of candidates) {
    for (const attempt of [candidate, withoutTrailingCommas(candidate)]) {
      try {
        const value: unknown = JSON.parse(attempt);
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return { ok: true, value: value as Record<string, unknown> };
        }
      } catch (error) {
        if (candidate === braced.text) detail = error instanceof Error ? error.message : String(error);
      }
    }
  }

  if (!text.includes('{')) return { ok: false, reason: 'noJson' };
  if (!braced.text) return { ok: false, reason: 'cutOff' };
  return { ok: false, reason: 'invalid', detail };
}

function fencedBlocks(text: string): string[] {
  return Array.from(text.matchAll(/```[A-Za-z0-9_-]*\s*\n([\s\S]*?)```/g), (match) => match[1].trim());
}

/** The text from the first `{` to the `}` that closes it, ignoring braces inside strings. */
function outermostObject(text: string): { text: string | null } {
  const start = text.indexOf('{');
  if (start < 0) return { text: null };

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return { text: text.slice(start, index + 1) };
    }
  }
  return { text: null };
}

/** Removes commas that sit directly before a closing bracket, outside strings. */
function withoutTrailingCommas(text: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === ',') {
      const rest = text.slice(index + 1);
      if (/^\s*[}\]]/.test(rest)) continue;
    }
    result += char;
  }
  return result;
}
