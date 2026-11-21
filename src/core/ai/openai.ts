import { requestJson, trimSlash } from './http';
import { type Adapter, type Connection, type FetchLike, type GenerateRequest, type Modality, type ModelInfo, AiError, DEFAULT_MAX_TOKENS } from './types';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/** Services that speak the OpenAI chat API. Any other address works too. */
export const OPENAI_COMPATIBLE_PRESETS = [
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  { label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { label: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
] as const;

type ListedModel = {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  /** OpenRouter: what the model reads and writes. */
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  /** OpenRouter: price per token, as strings. "0" everywhere means free. */
  pricing?: Record<string, string | number>;
};

const MODALITIES: readonly Modality[] = ['text', 'image', 'audio', 'video', 'pdf'];
const modalities = (values?: string[]): Modality[] | undefined => {
  if (!Array.isArray(values)) return undefined;
  const known = values.map((value) => (value === 'file' ? 'pdf' : value)).filter((value): value is Modality => MODALITIES.includes(value as Modality));
  return known.length > 0 ? [...new Set(known)] : undefined;
};

const base = (connection: Connection) => trimSlash(connection.baseUrl || OPENAI_BASE_URL);
const headers = (connection: Connection): Record<string, string> =>
  connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {};

export const openaiAdapter: Adapter = {
  async listModels(connection, fetchImpl) {
    // Most services list every model at once. Some page the list the way OpenAI pages others,
    // with `has_more` and `last_id`: follow those pages too.
    const entries: ListedModel[] = [];
    let after = '';
    for (let page = 0; page < 20; page += 1) {
      const url = `${base(connection)}/models${after ? `?after=${encodeURIComponent(after)}` : ''}`;
      const data = await requestJson(fetchImpl, url, { headers: headers(connection) });
      const batch = (data.data as ListedModel[] | undefined) ?? [];
      entries.push(...batch);
      const next = typeof data.last_id === 'string' ? data.last_id : batch.at(-1)?.id;
      if (data.has_more !== true || !next || next === after) break;
      after = next;
    }
    // Every model is kept. The catalog (catalog.ts) decides which ones can write a course.
    return entries
      .filter((entry): entry is ListedModel & { id: string } => typeof entry.id === 'string')
      .map((entry): ModelInfo => {
        const prices = entry.pricing ? Object.values(entry.pricing).map(Number).filter(Number.isFinite) : [];
        const input = modalities(entry.architecture?.input_modalities);
        const output = modalities(entry.architecture?.output_modalities);
        return {
          id: entry.id,
          label: entry.name || entry.id,
          ...(entry.description ? { description: entry.description.slice(0, 300) } : {}),
          ...(entry.context_length ? { inputLimit: entry.context_length } : {}),
          ...(input ? { input } : {}),
          ...(output ? { output } : {}),
          ...(prices.length > 0 && prices.every((price) => price === 0) ? { free: true } : {}),
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  },

  async generate(connection, request, fetchImpl) {
    try {
      return await send(connection, request, fetchImpl, true);
    } catch (error) {
      // JSON mode is common but not universal. The prompt asks for JSON anyway.
      if (request.schema && error instanceof AiError && error.kind === 'badRequest') {
        return send(connection, request, fetchImpl, false);
      }
      throw error;
    }
  },
};

async function send(connection: Connection, request: GenerateRequest, fetchImpl: FetchLike, jsonMode: boolean) {
  const url = base(connection);
  // OpenAI's own newer models take only `max_completion_tokens`. Most other services still take `max_tokens`.
  const limitKey = /(^|\.)openai\.com/.test(new URL(url).hostname) ? 'max_completion_tokens' : 'max_tokens';

  const data = await requestJson(fetchImpl, `${url}/chat/completions`, {
    method: 'POST',
    headers: headers(connection),
    body: {
      model: request.model,
      [limitKey]: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [...(request.system ? [{ role: 'system', content: request.system }] : []), { role: 'user', content: request.prompt }],
      ...(jsonMode && request.schema ? { response_format: { type: 'json_object' } } : {}),
    },
  });

  const counts = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  const usage = { inputTokens: counts?.prompt_tokens ?? 0, outputTokens: counts?.completion_tokens ?? 0 };

  const choice = (data.choices as { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[] | undefined)?.[0];
  if (!choice) throw new AiError('server', 'The provider sent no answer.', usage);
  if (choice.message?.refusal) throw new AiError('refusal', choice.message.refusal, usage);
  if (choice.finish_reason === 'content_filter') throw new AiError('refusal', 'The reply was blocked by a content filter.', usage);
  if (choice.finish_reason === 'length') throw new AiError('length', 'The reply was cut off before it finished.', usage);

  return { text: choice.message?.content ?? '', usage };
}
