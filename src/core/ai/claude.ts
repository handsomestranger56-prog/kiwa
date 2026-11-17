import Anthropic, {
  APIConnectionError,
  APIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';

import { type Adapter, type Connection, type FetchLike, type GenerateRequest, AiError, DEFAULT_MAX_TOKENS, kindForStatus } from './types';

export const CLAUDE_BASE_URL = 'https://api.anthropic.com';

function client(connection: Connection, fetchImpl: FetchLike): Anthropic {
  return new Anthropic({
    apiKey: connection.apiKey,
    // Explicit, so no environment variable can send requests elsewhere.
    baseURL: connection.baseUrl?.trim() || CLAUDE_BASE_URL,
    // The key belongs to the person holding the phone and never leaves it except to Anthropic.
    dangerouslyAllowBrowser: true,
    fetch: fetchImpl,
    maxRetries: 2,
    timeout: 10 * 60 * 1000,
  });
}

/** Turns an SDK error into one the screens know how to explain. Most specific first. */
function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) return new AiError('auth', error.message);
  if (error instanceof NotFoundError) return new AiError('notFound', error.message);
  if (error instanceof RateLimitError) return new AiError('rate', error.message);
  if (error instanceof BadRequestError) return new AiError('badRequest', error.message);
  if (error instanceof APIConnectionError) return new AiError('network', error.message);
  if (error instanceof APIError) return new AiError(error.status ? kindForStatus(error.status) : 'server', error.message);
  return new AiError('network', error instanceof Error ? error.message : String(error));
}

export const claudeAdapter: Adapter = {
  async listModels(connection, fetchImpl) {
    try {
      const models = [];
      // Iterating the page fetches every following page.
      for await (const model of client(connection, fetchImpl).models.list({ limit: 100 })) {
        models.push({ id: model.id, label: model.display_name || model.id });
      }
      return models;
    } catch (error) {
      throw toAiError(error);
    }
  },

  async generate(connection, request, fetchImpl) {
    const anthropic = client(connection, fetchImpl);
    try {
      return await send(anthropic, request, true);
    } catch (error) {
      // Some models, or a schema too large for them, reject structured output. The prompt already
      // asks for JSON and the reply is validated on import, so try once more without it.
      if (request.schema && error instanceof BadRequestError) {
        try {
          return await send(anthropic, request, false);
        } catch (retryError) {
          throw toAiError(retryError);
        }
      }
      throw toAiError(error);
    }
  },
};

async function send(anthropic: Anthropic, request: GenerateRequest, structured: boolean) {
  // No `thinking` parameter: current models choose how much to think, and older ones run without.
  const response = await anthropic.messages.create({
    model: request.model,
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(request.system ? { system: request.system } : {}),
    messages: [{ role: 'user', content: request.prompt }],
    ...(structured && request.schema ? { output_config: { format: { type: 'json_schema', schema: request.schema } } } : {}),
  });

  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };

  // Check why the model stopped before reading what it wrote.
  if (response.stop_reason === 'refusal') {
    const reason = response.stop_details?.explanation ?? 'The model declined this request.';
    throw new AiError('refusal', reason, usage);
  }
  if (response.stop_reason === 'max_tokens' || response.stop_reason === 'model_context_window_exceeded') {
    throw new AiError('length', 'The reply was cut off before it finished.', usage);
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return { text, usage };
}
