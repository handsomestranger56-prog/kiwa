import { z } from 'zod';

/** Ids are written by people and by language models, so the allowed shape is deliberately loose. */
export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'Use letters, digits, "_" or "-", at most 64 characters.');

export const titleSchema = z.string().trim().min(1, 'A title is required.').max(200);

export const textSchema = z.string().trim().min(1, 'This text cannot be empty.');

export const levelSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export type Level = z.infer<typeof levelSchema>;

/** A language tag such as "en" or "pt-BR". */
export const languageSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'Use a language tag such as "en" or "pt-BR".')
  .default('en');

export const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(20).default([]);
