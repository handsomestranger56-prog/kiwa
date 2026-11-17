import { type GenerateRequest, type GenerateResult, AiError, generate } from '@/core/ai';
import type { ModelChoice, ProvidersRepository } from '@/data/providers-repository';
import { readApiKey } from '@/platform/secrets';

/** Sends one request to a chosen model, with the key read from the secure store at that moment. */
export async function callModel(
  providers: ProvidersRepository,
  choice: Pick<ModelChoice, 'providerId' | 'model'>,
  request: Omit<GenerateRequest, 'model'>,
): Promise<GenerateResult> {
  const provider = await providers.get(choice.providerId);
  if (!provider) throw new AiError('notFound', 'That AI provider was removed. Pick another model.');
  const apiKey = (await readApiKey(provider.id)) ?? '';
  if (!apiKey && provider.kind !== 'openai') throw new AiError('auth', 'No API key is saved for this provider.');
  return generate({ kind: provider.kind, apiKey, baseUrl: provider.baseUrl ?? undefined }, { ...request, model: choice.model });
}
