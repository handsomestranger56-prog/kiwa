import { requestJson, trimSlash } from './http';
import { type Adapter, type Connection, type FetchLike, type GenerateRequest, AiError, DEFAULT_MAX_TOKENS } from './types';

/**
 * Claude over plain HTTP. The official SDK does not load under React Native's bundler (a circular
 * import between its own modules leaves an export undefined), so the app calls the API directly.
 */

export const CLAUDE_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2026-10-21';

const base = (connection: Connection) => trimSlash(connection.baseUrl || CLAUDE_BASE_URL);

const headers = (connection: Connection): Record<string, string> => ({
  'x-api-key': connection.apiKey,
  'anthropic-version': API_VERSION,
  // Needed for the browser build, where the request comes from a web page. Ignored elsewhere.
  'anthropic-dangerous-direct-browser-access': 'true',
});

type ModelPage = { data?: { id?: string; display_name?: string }[]; has_more?: boolean; last_id?: string | null };

type MessageReply = {
  content?: { type: string; text?: string }[];
  stop_reason?: string | null;
  stop_details?: { explanation?: string | null } | null;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export const claudeAdapter: Adapter = {
  async listModels(connection, fetchImpl) {
    const models: { id: string; label: string }[] = [];
    let after: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      // 1000 is the most the API returns per page. Further pages are followed below.
      const query: string = `limit=1000${after ? `&after_id=${encodeURIComponent(after)}` : ''}`;
      const data = (await requestJson(fetchImpl, `${base(connection)}/v1/models?${query}`, { headers: headers(connection) })) as ModelPage;
      for (const model of data.data ?? []) {
        if (typeof model.id === 'string') models.push({ id: model.id, label: model.display_name || model.id });
      }
      if (!data.has_more || !data.last_id) break;
      after = data.last_id;
    }
    return models;
  },

  async generate(connection, request, fetchImpl) {
    try {
      return await send(connection, request, fetchImpl, true);
    } catch (error) {
      // Some models, or a schema too large for them, reject structured output. The prompt already
      // asks for JSON and the reply is validated on import, so try once more without it.
      if (request.schema && error instanceof AiError && error.kind === 'badRequest') {
        return send(connection, request, fetchImpl, false);
      }
      throw error;
    }
  },
};

async function send(connection: Connection, request: GenerateRequest, fetchImpl: FetchLike, structured: boolean) {
  // No `thinking` parameter: current models choose how much to think, and older ones run without.
  const data = (await requestJson(fetchImpl, `${base(connection)}/v1/messages`, {
    method: 'POST',
    headers: headers(connection),
    body: {
      model: request.model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(request.system ? { system: request.system } : {}),
      messages: [{ role: 'user', content: request.prompt }],
      ...(structured && request.schema ? { output_config: { format: { type: 'json_schema', schema: request.schema } } } : {}),
    },
  })) as MessageReply;

  const usage = { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };

  // Check why the model stopped before reading what it wrote.
  if (data.stop_reason === 'refusal') {
    throw new AiError('refusal', data.stop_details?.explanation || 'The model declined this request.', usage);
  }
  if (data.stop_reason === 'max_tokens' || data.stop_reason === 'model_context_window_exceeded') {
    throw new AiError('length', 'The reply was cut off before it finished.', usage);
  }

  const text = (data.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('');
  return { text, usage };
}
