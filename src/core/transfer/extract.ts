export type ExtractResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: 'empty' | 'noJson' | 'cutOff' | 'invalid'; detail?: string };

/**
 * Finds the JSON object in a chatbot reply or a file.
 * Copes with a code fence around it, sentences before or after it, and trailing commas.
 * When that is not enough, it undoes damage that copying a reply commonly does: JSON that was
 * escaped into a string (`{\"format\": ...}`), Markdown escapes such as `\[` and `\_`, escapes JSON
 * does not have such as `\'`, line breaks inside strings, and non-breaking spaces between tokens.
 * Each repair only changes text that is not valid JSON, so a reply that parses is read as it is.
 */
export function extractJson(input: string): ExtractResult {
  return extract(input, true);
}

function extract(input: string, unwrap: boolean): ExtractResult {
  const text = input.replace(/^\uFEFF/, '').trim();
  if (!text) return { ok: false, reason: 'empty' };

  const candidates = [text, ...fencedBlocks(text)];
  const braced = outermostObject(text);
  if (braced.text) candidates.push(braced.text);

  let detail: string | undefined;
  for (const candidate of candidates) {
    for (const attempt of [candidate, withoutTrailingCommas(candidate)]) {
      const parsed = parseObject(attempt);
      if (parsed.value) return { ok: true, value: parsed.value };
      if (candidate === braced.text && detail === undefined) detail = parsed.error;
    }
  }

  // When the reply is escaped JSON, the reason the JSON inside it fails is the one worth telling.
  let inner: ExtractResult | null = null;
  if (unwrap) {
    const decoded = decodeEscapedJson(text);
    if (decoded !== null) {
      inner = extract(decoded, false);
      if (inner.ok) return inner;
    }
  }

  for (const candidate of candidates) {
    const parsed = parseObject(withoutTrailingCommas(repaired(candidate)));
    if (parsed.value) return { ok: true, value: parsed.value };
  }

  if (inner) return inner;
  if (!text.includes('{')) return { ok: false, reason: 'noJson' };
  if (!braced.text) return { ok: false, reason: 'cutOff' };
  return { ok: false, reason: 'invalid', detail };
}

function parseObject(text: string): { value?: Record<string, unknown>; error?: string } {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return { value: value as Record<string, unknown> };
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The JSON inside a reply that holds it as an escaped string, such as `"{\"a\": 1}"` or `{\"a\": 1}`.
 * Some chat apps and models hand the JSON over this way. Null when the text is not like that.
 */
function decodeEscapedJson(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  const body = text.slice(start, end + 1);
  if (!body.includes('\\"')) return null;
  try {
    const value: unknown = JSON.parse(`"${body}"`);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** The escapes that JSON allows after a backslash inside a string. */
const JSON_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
/** ASCII punctuation that Markdown lets a backslash escape, except `"` and `\`. */
const MARKDOWN_ESCAPED = /^[!#-/:-@[\]-`{-~]$/;
/** Characters that look like a space but that JSON does not accept between tokens. */
const INVISIBLE = /^[\u00A0\u1680\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\u3000\uFEFF]$/;
const CONTROL_ESCAPES: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };

/**
 * Fixes what is invalid in otherwise good JSON, as copying from a chat often leaves it.
 * Outside strings: drops the backslash of a Markdown escape (`\[` becomes `[`) and turns
 * non-breaking and zero-width spaces into plain spaces. Inside strings: keeps the character of an
 * escape JSON does not have (`\'` becomes `'`, `\_` becomes `_`) and escapes raw control characters.
 */
function repaired(text: string): string {
  let result = '';
  let inString = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1] ?? '';
    if (inString) {
      if (char === '\\') {
        index += 1;
        const valid = next === 'u' ? /^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5)) : JSON_ESCAPES.has(next);
        result += valid ? char + next : next;
      } else if (char === '"') {
        inString = false;
        result += char;
      } else if (char < ' ') {
        result += CONTROL_ESCAPES[char] ?? `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
      } else {
        result += char;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
    } else if (char === '\\' && MARKDOWN_ESCAPED.test(next)) {
      // Leave out the backslash; the character after it is copied on the next turn.
    } else if (INVISIBLE.test(char)) {
      result += ' ';
    } else {
      result += char;
    }
  }
  return result;
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
