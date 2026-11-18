import { requestJson, trimSlash } from './http';
import { type Adapter, type Connection, type ModelInfo, AiError, DEFAULT_MAX_TOKENS } from './types';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

type GeminiModel = { name: string; displayName?: string; description?: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number; outputTokenLimit?: number };

const base = (connection: Connection) => trimSlash(connection.baseUrl || GEMINI_BASE_URL);
const headers = (connection: Connection) => ({ 'x-goog-api-key': connection.apiKey });

export const geminiAdapter: Adapter = {
  async listModels(connection, fetchImpl) {
    const models: ModelInfo[] = [];
    let pageToken = '';
    for (let page = 0; page < 20; page += 1) {
      const query = `pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const data = await requestJson(fetchImpl, `${base(connection)}/models?${query}`, { headers: headers(connection) });
      for (const model of (data.models as GeminiModel[] | undefined) ?? []) {
        // Every model is kept. The catalog (catalog.ts) decides which ones can write a course.
        const id = model.name.replace(/^models\//, '');
        models.push({
          id,
          label: model.displayName || id,
          ...(model.description ? { description: model.description } : {}),
          ...(model.supportedGenerationMethods ? { methods: model.supportedGenerationMethods } : {}),
          ...(model.inputTokenLimit ? { inputLimit: model.inputTokenLimit } : {}),
          ...(model.outputTokenLimit ? { outputLimit: model.outputTokenLimit } : {}),
        });
      }
      pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
      if (!pageToken) break;
    }
    return models;
  },

  async generate(connection, request, fetchImpl) {
    const data = await requestJson(fetchImpl, `${base(connection)}/models/${encodeURIComponent(request.model)}:generateContent`, {
      method: 'POST',
      headers: headers(connection),
      body: {
        ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          // JSON mode. The schema itself is described in the prompt and checked on import.
          ...(request.schema ? { responseMimeType: 'application/json' } : {}),
        },
      },
    });

    const meta = data.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
    const usage = { inputTokens: meta?.promptTokenCount ?? 0, outputTokens: meta?.candidatesTokenCount ?? 0 };

    const blocked = (data.promptFeedback as { blockReason?: string } | undefined)?.blockReason;
    if (blocked) throw new AiError('refusal', `The request was blocked (${blocked}).`, usage);

    const candidate = (data.candidates as { finishReason?: string; content?: { parts?: { text?: string }[] } }[] | undefined)?.[0];
    if (!candidate) throw new AiError('server', 'The provider sent no answer.', usage);
    if (candidate.finishReason === 'MAX_TOKENS') throw new AiError('length', 'The reply was cut off before it finished.', usage);
    if (candidate.finishReason && ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(candidate.finishReason)) {
      throw new AiError('refusal', `The model stopped (${candidate.finishReason}).`, usage);
    }

    const text = (candidate.content?.parts ?? []).map((part) => part.text ?? '').join('');
    return { text, usage };
  },
};
