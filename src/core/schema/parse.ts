import { z } from 'zod';

import {
  type DocumentKind,
  type LibraryDocument,
  DOCUMENT_KINDS,
  documentSchemas,
  formatByKind,
} from './documents';

export type ParseIssue = {
  /** Where the problem is, for example `lessons[0].assessments[0].questions[2].answer`. */
  path: string;
  message: string;
};

export type ParseResult =
  | { ok: true; document: LibraryDocument }
  | { ok: false; issues: ParseIssue[] };

/** Validates anything that claims to be a course, quiz or deck. Never throws. */
export function parseDocument(input: unknown): ParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, issues: [{ path: '', message: 'Expected a JSON object.' }] };
  }

  const format = (input as { format?: unknown }).format;
  const kind = DOCUMENT_KINDS.find((candidate) => formatByKind[candidate] === format);
  if (!kind) {
    const known = DOCUMENT_KINDS.map((candidate) => `"${formatByKind[candidate]}"`).join(', ');
    return {
      ok: false,
      issues: [
        {
          path: 'format',
          message:
            format === undefined
              ? `Missing "format". Expected one of ${known}.`
              : `Unknown format ${JSON.stringify(format)}. Expected one of ${known}.`,
        },
      ],
    };
  }

  const result = documentSchemas[kind].safeParse(input);
  if (result.success) {
    return { ok: true, document: result.data };
  }
  return { ok: false, issues: result.error.issues.map(toParseIssue) };
}

/** JSON Schema for one kind of file. Used in prompts and for structured model output. */
export function documentJsonSchema(kind: DocumentKind): Record<string, unknown> {
  return z.toJSONSchema(documentSchemas[kind], { io: 'input' }) as Record<string, unknown>;
}

function toParseIssue(issue: z.core.$ZodIssue): ParseIssue {
  return { path: formatPath(issue.path), message: issue.message };
}

export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((text, segment) => {
    if (typeof segment === 'number') return `${text}[${segment}]`;
    return text ? `${text}.${String(segment)}` : String(segment);
  }, '');
}
