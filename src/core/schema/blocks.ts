import { z } from 'zod';

import { SVG_MAX_LENGTH, cleanSvg } from '../svg';
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

/** A picture drawn as SVG code, such as a diagram a chatbot made. Shown without running any script. */
export const svgBlockSchema = z.object({
  type: z.literal('svg'),
  svg: z
    .string()
    .max(SVG_MAX_LENGTH, 'The picture is too large. Keep it under 60,000 characters.')
    .refine((value) => cleanSvg(value).ok, 'Expected the code of one SVG picture, from <svg> to </svg>.'),
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
  svgBlockSchema,
  calloutBlockSchema,
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block['type'];
