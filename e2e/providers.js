// AI providers in Settings: add, test and detect models, default model, keys kept out of backups.
const { start } = require('./harness');
const { mockAi, MOCK_OPENAI_URL } = require('./mock-ai');

(async () => {
  const h = await start();
  const { page, step, button, seen, download, home } = h;
  const shot = (name) => h.shot('providers-' + name);
  const field = (label) => page.getByLabel(label, { exact: true }).locator('visible=true').last();
  const ai = await mockAi(page);

  const openSettings = async () => {
    await home();
    await page.getByRole('tab', { name: 'Settings' }).click();
    await seen('AI providers');
  };

  await openSettings();

  await step('settings starts with no providers', async () => {
    await seen('None yet. Add one to generate content');
    await shot('empty');
  });

  await step('a wrong key is explained', async () => {
    await button('Add provider').click();
    await seen('Create a key at console.anthropic.com.');
    await field('API key').fill('sk-ant-bad');
    await button('Test and detect models').click();
    await seen('The key was not accepted.');
  });

  await step('Claude: detect models with a good key, tick one, save', async () => {
    await field('API key').fill('sk-ant-good-123');
    await button('Test and detect models').click();
    await seen('Connected. Found 2 models.');
    await seen('Claude Haiku 5.5');
    await button('Use Claude Haiku 5.5').click();
    await shot('detected');
    await button('Save').click();
    await seen('Claude · 2 models on');
    const call = ai.log.find((entry) => entry.kind === 'claude' && entry.key === 'sk-ant-good-123');
    if (!call) throw new Error('the key was not sent to Claude');
  });

  await step('a saved key is reused without being shown', async () => {
    await button('Open Claude').click();
    await seen('A key is saved.');
    if (await page.getByText('sk-ant-good-123').count()) throw new Error('the key is visible on screen');
    const before = ai.log.length;
    await button('Test and detect models').click();
    await seen('Connected. Found 2 models.');
    if (ai.log[before]?.key !== 'sk-ant-good-123') throw new Error('stored key not used');
    await page.goBack();
  });

  await step('Gemini: only text models are offered', async () => {
    await button('Add provider').click();
    await button('Gemini').click();
    await field('API key').fill('gm-good');
    await button('Test and detect models').click();
    await seen('Connected. Found 1 model.');
    await seen('Gemini 3 Pro');
    if (await page.getByText('text-embedding-004').count()) throw new Error('embedding model offered');
    await button('Save').click();
    await seen('Gemini · 1 model on');
  });

  await step('OpenAI-compatible at a custom address with no key', async () => {
    await button('Add provider').click();
    await button('OpenAI-compatible').click();
    await seen('OpenRouter');
    await button('Ollama').click();
    if ((await field('Address').inputValue()) !== 'http://localhost:11434/v1') throw new Error('preset address not filled');
    await field('Address').fill(MOCK_OPENAI_URL);
    await field('Name').fill('My server');
    await button('Test and detect models').click();
    await seen('Connected. Found 2 models.');
    if (await page.getByText('nomic-embed-text').count()) throw new Error('embedding model offered');
    await button('Use qwen3').click();
    await button('Save').click();
    await seen('OpenAI-compatible · 2 models on');
  });

  await step('an address is required for the compatible kind', async () => {
    await button('Add provider').click();
    await button('OpenAI-compatible').click();
    await field('Address').fill('not an address');
    await button('Save').click();
    await seen('Enter an address that starts with http:// or https://.');
    await page.goBack();
  });

  await step('the default model can be chosen and is remembered', async () => {
    await seen('Model used by default');
    await shot('settings');
    await button('qwen3 · My server').click();
    await page.waitForFunction(
      () => [...document.querySelectorAll('[role="button"][aria-selected="true"]')].some((node) => node.textContent === 'qwen3 · My server'),
      null,
      { timeout: 5000 },
    );
    await openSettings();
    const selected = await page.getByRole('button', { name: 'qwen3 · My server', exact: true }).locator('visible=true').last().getAttribute('aria-selected');
    if (selected !== 'true') throw new Error(`default not remembered (aria-selected=${selected})`);
  });

  await step('a backup carries the providers but never a key', async () => {
    const backup = await download(() => page.getByText('Back up everything').last().click());
    const data = JSON.parse(backup.text);
    if (data.providers.length !== 3) throw new Error(`expected 3 providers, saw ${data.providers.length}`);
    for (const secret of ['sk-ant-good-123', 'gm-good']) {
      if (backup.text.includes(secret)) throw new Error('an API key is in the backup');
    }
  });

  await step('removing a provider deletes it and its key', async () => {
    await button('Open Gemini').click();
    await button('Remove provider').click();
    await seen('Remove Gemini?');
    await button('Remove provider').click();
    await seen('OpenAI-compatible · 2 models on');
    await page.getByRole('button', { name: 'Open Gemini' }).locator('visible=true').waitFor({ state: 'detached' });
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('anki.secret.')).length);
    if (stored !== 1) throw new Error(`expected 1 stored key, saw ${stored}`);
  });

  await h.finish();
})();
