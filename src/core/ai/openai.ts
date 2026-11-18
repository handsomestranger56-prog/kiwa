import { requestJson, trimSlash } from './http';
import { type Adapter, type Connection, type FetchLike, type GenerateRequest, AiError, DEFAULT_MAX_TOKENS } from './types';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/** Services that speak the OpenAI chat API. Any other address works too. */
export const OPENAI_COMPATIBLE_PRESETS = [
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { label: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
] as const;

/** Model ids that cannot write text: embeddings, speech, images, moderation. */
const NOT_TEXT = /embed|whisper|tts|dall-e|image|moderation|audio|transcri|realtime|sora|speech/i;

const base = (connection: Connection) => trimSlash(connection.baseUrl || OPENAI_BASE_URL);
const headers = (connection: Connection): Record<string, string> =>
  connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {};

export const openaiAdapter: Adapter = {
  async listModels(connection, fetchImpl) {
    // Most services list every model at once. Some page the list the way OpenAI pages others,
    // with `has_more` and `last_id`: follow those pages too.
    const entries: { id?: string; name?: string }[] = [];
    let after = '';
    for (let page = 0; page < 20; page += 1) {
      const url = `${base(connection)}/models${after ? `?after=${encodeURIComponent(after)}` : ''}`;
      const data = await requestJson(fetchImpl, url, { headers: headers(connection) });
      const batch = (data.data as { id?: string; name?: string }[] | undefined) ?? [];
      entries.push(...batch);
      const next = typeof data.last_id === 'string' ? data.last_id : batch.at(-1)?.id;
      if (data.has_more !== true || !next || next === after) break;
      after = next;
    }
    return entries
      .filter((entry): entry is { id: string; name?: string } => typeof entry.id === 'string' && !NOT_TEXT.test(entry.id))
      .map((entry) => ({ id: entry.id, label: entry.name || entry.id }))
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
