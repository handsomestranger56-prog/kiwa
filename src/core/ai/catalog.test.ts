import { canDo, groupModels, profileOf } from './catalog';
import type { ModelInfo } from './types';

const gemini = (id: string, methods = ['generateContent', 'countTokens']): ModelInfo => ({ id, label: id, methods });

describe('model catalog', () => {
  it('sorts the Gemini list into what each model is for', () => {
    const list = [
      gemini('gemini-2.5-pro'),
      gemini('gemini-2.5-flash'),
      gemini('gemini-3-flash-preview'),
      gemini('gemini-2.5-flash-preview-tts'),
      gemini('gemini-2.5-flash-image'),
      gemini('gemini-2.5-flash-native-audio-preview', ['bidiGenerateContent']),
      gemini('gemini-embedding-001', ['embedContent']),
      gemini('imagen-4.0-generate-001', ['predict']),
      gemini('veo-3.0-generate-001', ['predictLongRunning']),
      gemini('gemma-3-27b-it'),
      gemini('gemini-robotics-er-1.5-preview'),
      gemini('aqa', ['generateAnswer']),
    ];
    const groups = Object.fromEntries(groupModels('gemini', list).map((entry) => [entry.group, entry.models.map((model) => model.model.id)]));
    expect(groups).toEqual({
      text: ['gemma-3-27b-it', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3-flash-preview'],
      image: ['imagen-4.0-generate-001', 'gemini-2.5-flash-image'],
      speech: ['gemini-2.5-flash-preview-tts'],
      live: ['gemini-2.5-flash-native-audio-preview'],
      video: ['veo-3.0-generate-001'],
      embedding: ['gemini-embedding-001'],
      special: ['gemini-robotics-er-1.5-preview', 'aqa'],
    });
    expect(profileOf('gemini', gemini('gemini-2.5-flash'))).toMatchObject({ tier: 'freeTier', status: 'stable', canWrite: true, input: ['text', 'image', 'audio', 'video', 'pdf'] });
    // Google's pricing page lists a free tier for 2.5 Pro but not for 3.1 Pro or the bigger Gemini 4 models.
    expect(profileOf('gemini', gemini('gemini-2.5-pro'))).toMatchObject({ tier: 'freeTier', canWrite: true });
    expect(profileOf('gemini', gemini('gemini-3.1-pro-preview')).tier).toBe('paid');
    expect(profileOf('gemini', gemini('gemini-4-hydrogen'))).toMatchObject({ group: 'text', tier: 'freeTier', canWrite: true });
    expect(profileOf('gemini', gemini('gemini-4-carbon'))).toMatchObject({ group: 'text', tier: 'paid', canWrite: true });
    expect(profileOf('gemini', gemini('gemini-2.5-pro-preview-tts'))).toMatchObject({ group: 'speech', tier: 'paid' });
    expect(profileOf('gemini', gemini('gemini-3.8-flash-tts'))).toMatchObject({ group: 'speech', tier: 'freeTier' });
    expect(profileOf('gemini', gemini('gemini-3.5-transcribe-live')).group).toBe('speech');
    expect(profileOf('gemini', gemini('gemini-3.8-live')).group).toBe('live');
    expect(profileOf('gemini', gemini('gemini-omni-1.2-flash')).group).toBe('video');
    expect(profileOf('gemini', gemini('lyria-3.5')).output).toContain('audio');
    expect(profileOf('gemini', gemini('gemini-3-flash-preview')).status).toBe('preview');
    expect(profileOf('gemini', gemini('gemini-2.5-flash-preview-tts')).canWrite).toBe(false);
  });

  it('trusts what the provider reports over the patterns', () => {
    // A model the patterns would call a writer, but Gemini says it only embeds.
    expect(profileOf('gemini', gemini('gemini-new-thing', ['embedContent'])).group).toBe('embedding');
    const routed: ModelInfo = { id: 'vendor/drawing-model', label: 'Drawer', input: ['text'], output: ['image'] };
    expect(profileOf('openai', routed, 'https://openrouter.ai/api/v1')).toMatchObject({ group: 'image', canWrite: false, tier: 'paid' });
    const free: ModelInfo = { id: 'meta-llama/llama-4-scout', label: 'Llama', input: ['text', 'image'], output: ['text'], free: true };
    expect(profileOf('openai', free, 'https://openrouter.ai/api/v1')).toMatchObject({ tier: 'free', canWrite: true });
    expect(profileOf('openai', { id: 'deepseek/deepseek-r1:free', label: 'R1' }, 'https://openrouter.ai/api/v1').tier).toBe('free');
  });

  it('knows OpenAI-style names, Claude, and models on this device', () => {
    const openai = (id: string) => profileOf('openai', { id, label: id }, 'https://api.openai.com/v1');
    expect(openai('gpt-5')).toMatchObject({ group: 'text', input: ['text', 'image'], tier: 'paid', canWrite: true });
    expect(openai('text-embedding-3-large').group).toBe('embedding');
    expect(openai('whisper-1')).toMatchObject({ group: 'speech', input: ['audio'] });
    expect(openai('gpt-image-1').group).toBe('image');
    expect(openai('gpt-realtime').group).toBe('live');
    expect(openai('omni-moderation-latest').group).toBe('special');
    // Newer names: GPT-6 reads images; Pro and Codex models are Responses-only, so they cannot write here.
    expect(openai('gpt-6.2-astra')).toMatchObject({ group: 'text', input: ['text', 'image'], canWrite: true });
    expect(openai('gpt-5.5-pro').canWrite).toBe(false);
    expect(openai('gpt-5.1-codex-mini').canWrite).toBe(false);
    expect(openai('gpt-audio-1.5').group).toBe('live');
    expect(openai('gpt-live-transcribe').group).toBe('speech');
    expect(profileOf('openai', { id: 'openai/gpt-5.5-pro', label: 'x' }, 'https://openrouter.ai/api/v1').canWrite).toBe(true);
    expect(profileOf('openai', { id: 'openrouter/free', label: 'Free' }, 'https://openrouter.ai/api/v1').tier).toBe('free');
    expect(profileOf('openai', { id: 'grok-build-0.1', label: 'x' }, 'https://api.x.ai/v1').input).toContain('image');
    expect(profileOf('openai', { id: 'grok-voice-3.0', label: 'x' }, 'https://api.x.ai/v1').group).toBe('live');
    expect(profileOf('openai', { id: 'deepseek-flash', label: 'x' }, 'https://api.deepseek.com').input).toContain('image');
    expect(profileOf('openai', { id: 'deepseek-v4-pro', label: 'x' }, 'https://api.deepseek.com').input).toEqual(['text']);
    expect(profileOf('openai', { id: 'mistral-ocr-4-1', label: 'x' }, 'https://api.mistral.ai/v1').group).toBe('special');
    expect(profileOf('openai', { id: 'mistral-large-4', label: 'x' }, 'https://api.mistral.ai/v1').input).toContain('image');
    expect(profileOf('openai', { id: 'openai/gpt-oss-120b', label: 'x' }, 'https://api.groq.com/openai/v1')).toMatchObject({ tier: 'freeTier', canWrite: true });
    expect(profileOf('claude', { id: 'claude-opus-5-5', label: 'Claude Opus' })).toMatchObject({ tier: 'paid', input: ['text', 'image', 'pdf'], canWrite: true });
    expect(profileOf('openai', { id: 'qwen3', label: 'qwen3' }, 'http://localhost:11434/v1')).toMatchObject({ tier: 'local', canWrite: true });
    expect(profileOf('openai', { id: 'some-model', label: 'x' }, 'https://example.test/v1').tier).toBe('unknown');
  });

  it('answers whether a model can do a task', () => {
    expect(canDo(profileOf('openai', { id: 'llama3', label: 'x' }, 'http://localhost:11434/v1'), 'readImages')).toBe(false);
    expect(canDo(profileOf('claude', { id: 'claude-haiku-5-5', label: 'x' }), 'readImages')).toBe(true);
    expect(canDo(profileOf('gemini', gemini('gemini-embedding-001', ['embedContent'])), 'write')).toBe(false);
  });
});
