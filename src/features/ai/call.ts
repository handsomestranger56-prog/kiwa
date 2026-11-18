import { type FetchLike, type GenerateRequest, type GenerateResult, AiError, generate } from '@/core/ai';
import { errorMessage } from '@/core/ai/http';
import type { ModelChoice, ProvidersRepository } from '@/data/providers-repository';
import { readApiKey } from '@/platform/secrets';

/** One HTTP request to a provider, as the network sees it. */
export type RequestRecord = { at: number; ok: boolean; status?: number; message?: string };

/**
 * Sends one request to a chosen model, with the key read from the secure store at that moment.
 * `observe` hears about every HTTP request the adapter makes, including its own second tries,
 * so counts match what a network inspector shows (apart from the browser's CORS preflights).
 */
export async function callModel(
  providers: ProvidersRepository,
  choice: Pick<ModelChoice, 'providerId' | 'model'>,
  request: Omit<GenerateRequest, 'model'>,
  observe?: (record: RequestRecord) => void,
): Promise<GenerateResult> {
  const provider = await providers.get(choice.providerId);
  if (!provider) throw new AiError('notFound', 'That AI provider was removed. Pick another model.');
  const apiKey = (await readApiKey(provider.id)) ?? '';
  if (!apiKey && provider.kind !== 'openai') throw new AiError('auth', 'No API key is saved for this provider.');

  const watched: FetchLike = async (input, init) => {
    const at = Date.now();
    try {
      const response = await fetch(input, init);
      if (response.ok) observe?.({ at, ok: true, status: response.status });
      else {
        const text = await response.clone().text().catch(() => '');
        let data: unknown = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
        observe?.({ at, ok: false, status: response.status, message: (errorMessage(data) ?? text).slice(0, 500) });
      }
      return response;
    } catch (error) {
      observe?.({ at, ok: false, message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
  return generate({ kind: provider.kind, apiKey, baseUrl: provider.baseUrl ?? undefined }, { ...request, model: choice.model }, watched);
}
