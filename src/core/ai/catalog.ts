import { z } from 'zod';

import data from './catalog.json';
import type { Modality, ModelInfo, ProviderKind } from './types';

/**
 * Sorts every model a provider lists into what it is for, what it reads and writes, and whether it
 * has a free tier. The rules live in catalog.json so they can be updated without touching code.
 */

export const MODEL_GROUPS = ['text', 'image', 'speech', 'live', 'video', 'embedding', 'special'] as const;
export type ModelGroup = (typeof MODEL_GROUPS)[number];
export type ModelTier = 'free' | 'freeTier' | 'local' | 'paid' | 'unknown';
export type ModelStatus = 'stable' | 'preview' | 'experimental' | 'deprecated';

/** What the app knows about a model. */
export type ModelProfile = {
  group: ModelGroup;
  input: Modality[];
  output: Modality[];
  tier: ModelTier;
  status: ModelStatus;
  /** It can write lessons, quizzes and feedback: text out, through the normal chat request. */
  canWrite: boolean;
};

/** What a feature needs from a model. More tasks join as the app learns new tricks. */
export type ModelTask = 'write' | 'readImages';

const modality = z.enum(['text', 'image', 'audio', 'video', 'pdf']);
const catalogSchema = z.object({
  updated: z.string(),
  rules: z.array(
    z.object({
      provider: z.enum(['claude', 'gemini', 'openai']),
      match: z.string(),
      group: z.enum(MODEL_GROUPS).optional(),
      input: z.array(modality).optional(),
      output: z.array(modality).optional(),
      tier: z.enum(['free', 'freeTier', 'local', 'paid', 'unknown']).optional(),
    }),
  ),
  hosts: z.array(z.object({ match: z.string(), tier: z.enum(['free', 'freeTier', 'local', 'paid', 'unknown']) })),
});

const catalog = catalogSchema.parse(data);
const rules = catalog.rules.map((rule) => ({ ...rule, pattern: new RegExp(rule.match, 'i') }));
const hosts = catalog.hosts.map((host) => ({ ...host, pattern: new RegExp(host.match, 'i') }));

/** The day the free and paid labels were last checked. */
export const CATALOG_UPDATED = catalog.updated;

export function profileOf(kind: ProviderKind, model: ModelInfo, baseUrl?: string | null): ModelProfile {
  const matching = rules.filter((rule) => rule.provider === kind && rule.pattern.test(model.id));
  // The first rule that says something wins for each field, so a tier-only rule (":free") can sit on top.
  const pick = <K extends 'group' | 'input' | 'output' | 'tier'>(key: K) => matching.find((rule) => rule[key] !== undefined)?.[key];

  let group: ModelGroup = pick('group') ?? 'text';
  let input: Modality[] = pick('input') ?? ['text'];
  let output: Modality[] = pick('output') ?? ['text'];
  let tier: ModelTier = pick('tier') ?? hosts.find((host) => baseUrl && host.pattern.test(baseUrl))?.tier ?? 'unknown';

  // What the provider says beats the patterns.
  if (model.input) input = model.input;
  if (model.output) {
    output = model.output;
    if (group === 'text' && !output.includes('text')) group = output.includes('image') ? 'image' : output.includes('video') ? 'video' : output.includes('audio') ? 'speech' : 'special';
  }
  if (model.free) tier = 'free';
  if (model.methods) {
    const methods = model.methods;
    if (!methods.includes('generateContent')) {
      if (methods.includes('embedContent')) group = 'embedding';
      else if (methods.includes('bidiGenerateContent')) group = 'live';
      else if (methods.includes('predictLongRunning')) group = group === 'text' ? 'video' : group;
      else if (methods.includes('predict')) group = group === 'text' ? 'image' : group;
      else if (group === 'text') group = 'special';
    }
  }
  // A model on this device costs nothing, whatever its name.
  if (baseUrl && hosts.some((host) => host.tier === 'local' && host.pattern.test(baseUrl))) tier = 'local';

  const canWrite = group === 'text' && output.includes('text') && (!model.methods || model.methods.includes('generateContent'));
  return { group, input, output, tier, status: statusOf(model), canWrite };
}

function statusOf(model: ModelInfo): ModelStatus {
  const text = `${model.id} ${model.label}`.toLowerCase();
  if (/deprecat/.test(model.description ?? '') || /deprecat/.test(text)) return 'deprecated';
  if (/(^|[-_ ])(exp|experimental)([-_ \d]|$)/.test(text)) return 'experimental';
  if (/preview/.test(text)) return 'preview';
  return 'stable';
}

export function canDo(profile: ModelProfile, task: ModelTask): boolean {
  if (task === 'write') return profile.canWrite;
  return profile.canWrite && profile.input.includes('image');
}

const TIER_ORDER: Record<ModelTier, number> = { free: 0, freeTier: 1, local: 2, unknown: 3, paid: 4 };
const STATUS_ORDER: Record<ModelStatus, number> = { stable: 0, preview: 1, experimental: 2, deprecated: 3 };

/**
 * Models in groups, in the order groups are shown. Within a group: free first, then stable,
 * then by name. Gemini and Claude put the version in the name, so for them the newest comes first
 * ("gemini-3" before "gemini-2.5"); other services list alphabetically.
 */
export function groupModels(kind: ProviderKind, models: ModelInfo[], baseUrl?: string | null) {
  const profiled = models.map((model) => ({ model, profile: profileOf(kind, model, baseUrl) }));
  return MODEL_GROUPS.map((group) => ({
    group,
    models: profiled
      .filter((entry) => entry.profile.group === group)
      .sort(
        (a, b) =>
          TIER_ORDER[a.profile.tier] - TIER_ORDER[b.profile.tier] ||
          STATUS_ORDER[a.profile.status] - STATUS_ORDER[b.profile.status] ||
          (kind === 'openai' ? 1 : -1) * a.model.id.localeCompare(b.model.id, undefined, { numeric: true }),
      ),
  })).filter((entry) => entry.models.length > 0);
}
