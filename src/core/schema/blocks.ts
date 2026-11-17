import { z } from 'zod';

import { textSchema } from './primitives';

export const textBlockSchema = z.object({
  type: z.literal('text'),
  markdown: textSchema,
});

export const codeBlockSchema = z.object({
  type: z.literal('code'),
  language: z.string().trim().min(1).max(40).optional(),
  code: z.string().min(1, 'A code block cannot be empty.'),
});

export const imageBlockSchema = z.object({
  type: z.literal('image'),
  url: z.url(),
  alt: z.string().trim().optional(),
  caption: z.string().trim().optional(),
});

export const calloutBlockSchema = z.object({
  type: z.literal('callout'),
  tone: z.enum(['note', 'tip', 'warning']).default('note'),
  markdown: textSchema,
});

export const blockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  codeBlockSchema,
  imageBlockSchema,
  calloutBlockSchema,
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block['type'];
