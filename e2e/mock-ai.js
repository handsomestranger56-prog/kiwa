// Stands in for the AI providers in browser checks, so no real key or network is needed.
//
// Claude and Gemini are intercepted at their real addresses. The OpenAI-compatible kind is tested
// against MOCK_OPENAI_URL. A key containing "bad" is refused. Generation requests are answered by
// `reply(request)`, which each check can replace.

const MOCK_OPENAI_URL = 'http://mock-ai.test/v1';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

async function mockAi(page, options = {}) {
  const log = [];
  const state = {
    log,
    /** Returns the text of the model's reply. Override per check. */
    reply: options.reply ?? (() => '{}'),
    /** Milliseconds to wait before answering a generation request. */
    delay: 0,
    usage: { input: 1200, output: 800 },
  };

  const json = (route, status, body) =>
    route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  const keyOf = (request) => {
    const headers = request.headers();
    return headers['x-api-key'] || headers['x-goog-api-key'] || (headers.authorization || '').replace(/^Bearer /, '');
  };

  const handle = async (route, kind) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const key = keyOf(request);
    const url = new URL(request.url());
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    log.push({ kind, method: request.method(), path: url.pathname, key, body });

    if (key.includes('bad')) {
      const message = kind === 'gemini' ? 'API key not valid.' : 'invalid api key';
      return json(route, kind === 'gemini' ? 400 : 401, { type: 'error', error: { type: 'authentication_error', message } });
    }

    if (request.method() === 'GET' && url.pathname.endsWith('/models')) {
      if (kind === 'claude') {
        return json(route, 200, {
          data: [
            { type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-01-01T00:00:00Z' },
            { type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', created_at: '2026-01-01T00:00:00Z' },
          ],
          has_more: false,
          first_id: 'claude-opus-5-5',
          last_id: 'claude-haiku-5-5',
        });
      }
      if (kind === 'gemini') {
        return json(route, 200, {
          models: [
            { name: 'models/gemini-3-pro', displayName: 'Gemini 3 Pro', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
          ],
        });
      }
      return json(route, 200, { data: [{ id: 'llama4' }, { id: 'nomic-embed-text' }, { id: 'qwen3' }] });
    }

    if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
    let text;
    try {
      text = await state.reply({ kind, body, prompt: promptOf(kind, body) });
    } catch (error) {
      return json(route, 500, { error: { message: String(error) } });
    }
    const { input, output } = state.usage;
    if (kind === 'claude') {
      return json(route, 200, {
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_details: null,
        usage: { input_tokens: input, output_tokens: output },
      });
    }
    if (kind === 'gemini') {
      return json(route, 200, {
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
        usageMetadata: { promptTokenCount: input, candidatesTokenCount: output },
      });
    }
    return json(route, 200, {
      choices: [{ finish_reason: 'stop', message: { content: text } }],
      usage: { prompt_tokens: input, completion_tokens: output },
    });
  };

  await page.route('https://api.anthropic.com/**', (route) => handle(route, 'claude'));
  await page.route('https://generativelanguage.googleapis.com/**', (route) => handle(route, 'gemini'));
  await page.route(`${MOCK_OPENAI_URL}/**`, (route) => handle(route, 'openai'));
  return state;
}

function promptOf(kind, body) {
  if (!body) return '';
  if (kind === 'claude') return body.messages?.map((message) => message.content).join('\n') ?? '';
  if (kind === 'gemini') return body.contents?.flatMap((content) => content.parts.map((part) => part.text)).join('\n') ?? '';
  return body.messages?.filter((message) => message.role === 'user').map((message) => message.content).join('\n') ?? '';
}

module.exports = { mockAi, MOCK_OPENAI_URL };
