/**
 * @jest-environment node
 */
import { documentJsonSchema } from '../schema';
import { type Connection, type FetchLike, AiError, generate, listModels, strictSchema } from './index';
import { rateLimitOf, retryDelay } from './http';
import { retryWait } from './retry';

type Call = { url: string; method: string; headers: Record<string, string>; body: any };

/** A fake network that answers each request in turn and records what was sent. */
function fakeFetch(...replies: { status?: number; body: unknown }[]) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    // Read what was sent directly. The SDK's Headers can come from another realm than this test's Request.
    const headers: Record<string, string> = {};
    const given = init?.headers as any;
    if (given && typeof given.forEach === 'function') given.forEach((value: string, key: string) => (headers[key.toLowerCase()] = value));
    else for (const [key, value] of Object.entries(given ?? {})) headers[key.toLowerCase()] = String(value);
    const text = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url: String(input), method: init?.method ?? 'GET', headers, body: text ? JSON.parse(text) : undefined });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
    });
  };
  return { fetchImpl, calls };
}

const claude: Connection = { kind: 'claude', apiKey: 'sk-ant-test' };
const gemini: Connection = { kind: 'gemini', apiKey: 'gm-test' };
const openai: Connection = { kind: 'openai', apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1/' };
const grok: Connection = { kind: 'openai', apiKey: 'xai-test', baseUrl: 'https://api.x.ai/v1' };

const claudeMessage = (overrides: object = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [
    { type: 'thinking', thinking: '', signature: 'x' },
    { type: 'text', text: '{"ok":' },
    { type: 'text', text: 'true}' },
  ],
  stop_reason: 'end_turn',
  stop_details: null,
  usage: { input_tokens: 120, output_tokens: 40 },
  ...overrides,
});

async function failure(promise: Promise<unknown>): Promise<AiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AiError) return error;
    throw error;
  }
  throw new Error('expected a failure');
}

describe('Claude', () => {
  it('lists models with their names, across pages', async () => {
    const { fetchImpl, calls } = fakeFetch(
      { body: { data: [{ type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-01-01T00:00:00Z' }], has_more: true, first_id: 'claude-opus-5-5', last_id: 'claude-opus-5-5' } },
      { body: { data: [{ type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'claude-haiku-5-5', last_id: 'claude-haiku-5-5' } },
    );
    expect(await listModels(claude, fetchImpl)).toEqual([
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    ]);
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/models?limit=1000');
    expect(calls[0].headers['x-api-key']).toBe('sk-ant-test');
    expect(calls[0].headers['anthropic-version']).toBe('2026-10-21');
    expect(calls[0].headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(calls[1].url).toContain('after_id=claude-opus-5-5');
  });

  it('asks for structured output and joins the text blocks', async () => {
    const { fetchImpl, calls } = fakeFetch({ body: claudeMessage() });
    const result = await generate(claude, { model: 'claude-opus-5-5', system: 'Be brief.', prompt: 'Hi', schema: { type: 'object' }, maxTokens: 500 }, fetchImpl);
    expect(result).toEqual({ text: '{"ok":true}', usage: { inputTokens: 120, outputTokens: 40 } });
    expect(calls[0].body).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 500,
      system: 'Be brief.',
      messages: [{ role: 'user', content: 'Hi' }],
      output_config: { format: { type: 'json_schema', schema: { type: 'object' } } },
    });
    expect(calls[0].body).not.toHaveProperty('thinking');
  });

  it('tries once more without structured output when it is rejected', async () => {
    const { fetchImpl, calls } = fakeFetch(
      { status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'Schema is too complex' } } },
      { body: claudeMessage() },
    );
    expect((await generate(claude, { model: 'm', prompt: 'p', schema: { type: 'object' } }, fetchImpl)).text).toBe('{"ok":true}');
    expect(calls).toHaveLength(2);
    expect(calls[1].body).not.toHaveProperty('output_config');
  });

  it('reports a refusal and a cut-off reply with the tokens spent', async () => {
    const refused = fakeFetch({ body: claudeMessage({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'Not this one.' } }) });
    const refusal = await failure(generate(claude, { model: 'm', prompt: 'p' }, refused.fetchImpl));
    expect(refusal).toMatchObject({ kind: 'refusal', message: 'Not this one.', usage: { inputTokens: 120, outputTokens: 40 } });

    const cut = fakeFetch({ body: claudeMessage({ stop_reason: 'max_tokens' }) });
    expect(await failure(generate(claude, { model: 'm', prompt: 'p' }, cut.fetchImpl))).toMatchObject({ kind: 'length' });
  });

  it('explains a bad key and a missing model', async () => {
    const bad = fakeFetch({ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } });
    expect(await failure(listModels(claude, bad.fetchImpl))).toMatchObject({ kind: 'auth' });
    const missing = fakeFetch({ status: 404, body: { type: 'error', error: { type: 'not_found_error', message: 'model: nope' } } });
    expect(await failure(generate(claude, { model: 'nope', prompt: 'p' }, missing.fetchImpl))).toMatchObject({ kind: 'notFound' });
  });
});

describe('Gemini', () => {
  it('lists only models that write text, across pages', async () => {
    const { fetchImpl, calls } = fakeFetch(
      {
        body: {
          models: [
            { name: 'models/gemini-3-pro', displayName: 'Gemini 3 Pro', supportedGenerationMethods: ['generateContent', 'countTokens'] },
            { name: 'models/text-embedding-004', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
          ],
          nextPageToken: 'next',
        },
      },
      { body: { models: [{ name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] }] } },
    );
    expect(await listModels(gemini, fetchImpl)).toEqual([
      { id: 'gemini-3-pro', label: 'Gemini 3 Pro' },
      { id: 'gemini-3-flash', label: 'gemini-3-flash' },
    ]);
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000');
    expect(calls[0].headers['x-goog-api-key']).toBe('gm-test');
    expect(calls[1].url).toContain('pageToken=next');
  });

  it('asks for JSON and reads the reply and usage', async () => {
    const { fetchImpl, calls } = fakeFetch({
      body: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"a"' }, { text: ':1}' }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 } },
    });
    const result = await generate(gemini, { model: 'gemini-3-pro', system: 'S', prompt: 'P', schema: {} }, fetchImpl);
    expect(result).toEqual({ text: '{"a":1}', usage: { inputTokens: 9, outputTokens: 4 } });
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro:generateContent');
    expect(calls[0].body).toMatchObject({
      systemInstruction: { parts: [{ text: 'S' }] },
      contents: [{ role: 'user', parts: [{ text: 'P' }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
  });

  it('reports blocked, unsafe and cut-off replies', async () => {
    const blocked = fakeFetch({ body: { promptFeedback: { blockReason: 'SAFETY' } } });
    expect(await failure(generate(gemini, { model: 'g', prompt: 'p' }, blocked.fetchImpl))).toMatchObject({ kind: 'refusal' });
    const unsafe = fakeFetch({ body: { candidates: [{ finishReason: 'SAFETY' }] } });
    expect(await failure(generate(gemini, { model: 'g', prompt: 'p' }, unsafe.fetchImpl))).toMatchObject({ kind: 'refusal' });
    const cut = fakeFetch({ body: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{' }] } }] } });
    expect(await failure(generate(gemini, { model: 'g', prompt: 'p' }, cut.fetchImpl))).toMatchObject({ kind: 'length' });
  });

  it('reads the reason from an error reply', async () => {
    const { fetchImpl } = fakeFetch({ status: 400, body: { error: { code: 400, message: 'API key not valid.' } } });
    expect(await failure(listModels(gemini, fetchImpl))).toMatchObject({ kind: 'badRequest', message: 'API key not valid.' });
  });
});

describe('OpenAI-compatible', () => {
  it('lists text models from the configured address, sorted', async () => {
    const { fetchImpl, calls } = fakeFetch({ body: { data: [{ id: 'gpt-5' }, { id: 'text-embedding-3-large' }, { id: 'whisper-1' }, { id: 'gpt-5-mini' }, { id: 'dall-e-3' }] } });
    expect(await listModels(openai, fetchImpl)).toEqual([
      { id: 'gpt-5', label: 'gpt-5' },
      { id: 'gpt-5-mini', label: 'gpt-5-mini' },
    ]);
    expect(calls[0].url).toBe('https://api.openai.com/v1/models');
    expect(calls[0].headers.authorization).toBe('Bearer sk-test');
  });

  it('follows further pages when a service pages its model list', async () => {
    const { fetchImpl, calls } = fakeFetch(
      { body: { data: [{ id: 'model-a' }], has_more: true, last_id: 'model-a' } },
      { body: { data: [{ id: 'model-b' }], has_more: false } },
    );
    expect((await listModels(openai, fetchImpl)).map((model) => model.id)).toEqual(['model-a', 'model-b']);
    expect(calls[1].url).toBe('https://api.openai.com/v1/models?after=model-a');
  });

  it('uses the right length parameter for OpenAI and for other services', async () => {
    const reply = { body: { choices: [{ finish_reason: 'stop', message: { content: '{}' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } } };
    const atOpenAi = fakeFetch(reply);
    await generate(openai, { model: 'gpt-5', prompt: 'p', schema: {}, maxTokens: 100 }, atOpenAi.fetchImpl);
    expect(atOpenAi.calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(atOpenAi.calls[0].body).toMatchObject({ max_completion_tokens: 100, response_format: { type: 'json_object' } });

    const atGrok = fakeFetch(reply);
    const result = await generate(grok, { model: 'grok-4', system: 's', prompt: 'p', maxTokens: 100 }, atGrok.fetchImpl);
    expect(result).toEqual({ text: '{}', usage: { inputTokens: 3, outputTokens: 1 } });
    expect(atGrok.calls[0].body).toEqual({ model: 'grok-4', max_tokens: 100, messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'p' }] });
  });

  it('drops JSON mode when a service rejects it', async () => {
    const { fetchImpl, calls } = fakeFetch(
      { status: 400, body: { error: { message: 'response_format is not supported' } } },
      { body: { choices: [{ finish_reason: 'stop', message: { content: '{}' } }] } },
    );
    expect((await generate(grok, { model: 'm', prompt: 'p', schema: {} }, fetchImpl)).text).toBe('{}');
    expect(calls[1].body).not.toHaveProperty('response_format');
  });

  it('reports refusals, filters, cut-offs, rate limits and an unreachable server', async () => {
    const refused = fakeFetch({ body: { choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'I cannot.' } }] } });
    expect(await failure(generate(openai, { model: 'm', prompt: 'p' }, refused.fetchImpl))).toMatchObject({ kind: 'refusal', message: 'I cannot.' });
    const filtered = fakeFetch({ body: { choices: [{ finish_reason: 'content_filter', message: { content: '' } }] } });
    expect(await failure(generate(openai, { model: 'm', prompt: 'p' }, filtered.fetchImpl))).toMatchObject({ kind: 'refusal' });
    const cut = fakeFetch({ body: { choices: [{ finish_reason: 'length', message: { content: '{' } }] } });
    expect(await failure(generate(openai, { model: 'm', prompt: 'p' }, cut.fetchImpl))).toMatchObject({ kind: 'length' });
    const limited = fakeFetch({ status: 429, body: { error: { message: 'Rate limit reached' } } });
    expect(await failure(listModels(openai, limited.fetchImpl))).toMatchObject({ kind: 'rate', message: 'Rate limit reached' });
    const offline: FetchLike = async () => {
      throw new TypeError('Network request failed');
    };
    expect(await failure(listModels({ kind: 'openai', apiKey: '', baseUrl: 'http://localhost:11434/v1' }, offline))).toMatchObject({ kind: 'network' });
  });
});

describe('retry hints', () => {
  it('reads how long to wait from Google\'s RetryInfo and from Retry-After', async () => {
    const gemini = { kind: 'gemini' as const, apiKey: 'k' };
    const limited = fakeFetch({
      status: 429,
      body: { error: { code: 429, message: 'Quota exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }] } },
    });
    expect(await failure(generate(gemini, { model: 'm', prompt: 'p' }, limited.fetchImpl))).toMatchObject({ kind: 'rate', retryAfterMs: 37000 });
    expect(retryDelay({ headers: new Headers({ 'retry-after': '12' }) }, null)).toBe(12000);
    expect(retryDelay({ headers: new Headers() }, null)).toBe(0);
  });

  it('tells a per-minute limit from a daily limit and from used-up credit', () => {
    const google = (quotaId: string) => ({ error: { code: 429, message: 'Quota exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] }] } });
    expect(rateLimitOf(429, google('GenerateRequestsPerMinutePerProjectPerModel-FreeTier'))).toBe('minute');
    expect(rateLimitOf(429, google('GenerateRequestsPerDayPerProjectPerModel-FreeTier'))).toBe('day');
    expect(rateLimitOf(429, { error: { message: 'Rate limit reached for gpt-x on requests per day (RPD): Limit 200' } })).toBe('day');
    expect(rateLimitOf(429, { error: { message: 'Rate limit reached on requests per min (RPM)' } })).toBe('minute');
    expect(rateLimitOf(429, { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } })).toBe('quota');
    expect(rateLimitOf(402, null)).toBe('quota');
    expect(rateLimitOf(429, { error: { message: 'Slow down' } })).toBeUndefined();
    expect(rateLimitOf(500, null)).toBeUndefined();
  });

  it('does not wait out a daily limit or used-up credit', async () => {
    const daily = fakeFetch({ status: 429, body: { error: { message: 'Quota exceeded', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }, { retryDelay: '20s' }] } } });
    const error = await failure(generate({ kind: 'gemini', apiKey: 'k' }, { model: 'm', prompt: 'p' }, daily.fetchImpl));
    expect(error).toMatchObject({ kind: 'rate', limit: 'day' });
    expect(retryWait(error, 0)).toBeNull();
    expect(retryWait(new AiError('rate', 'slow', undefined, 2000, 'minute'), 0)).toBe(3000);
  });

  it('marks only rate limits and busy servers as worth retrying', async () => {
    const busy = fakeFetch({ status: 529, body: { error: { message: 'Overloaded' } } });
    expect(await failure(generate({ kind: 'claude', apiKey: 'k' }, { model: 'm', prompt: 'p' }, busy.fetchImpl))).toMatchObject({ kind: 'server', retryAfterMs: 0 });
    const noCredit = fakeFetch({ status: 402, body: { error: { message: 'No credit' } } });
    expect((await failure(generate({ kind: 'claude', apiKey: 'k' }, { model: 'm', prompt: 'p' }, noCredit.fetchImpl))).retryAfterMs).toBeUndefined();
  });
});

describe('strictSchema', () => {
  it('removes limits the strict modes reject and closes every object', () => {
    const schema = strictSchema(documentJsonSchema('quiz'));
    const text = JSON.stringify(schema);
    for (const key of ['"$schema"', '"minLength"', '"maxLength"', '"pattern"', '"minItems"', '"maxItems"', '"default"', '"oneOf"', '"exclusiveMinimum"', '"maximum"']) {
      expect(text).not.toContain(key);
    }
    const walk = (node: any): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') {
        if (node.type === 'object') expect(node.additionalProperties).toBe(false);
        Object.values(node).forEach(walk);
      }
    };
    walk(schema);
    expect(text).toContain('"anyOf"');
    expect(text).toContain('"single_choice"');
  });
});
