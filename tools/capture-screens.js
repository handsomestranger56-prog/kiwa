// Takes the screenshots for the project page (docs/index.html) from the web build.
//
//   npx expo export --platform web && node tools/capture-screens.js
//   LANGS=en node tools/capture-screens.js   (only some languages)
//
// For each language and theme: a fresh install, the showcase group imported, a mock Gemini key so
// the AI screens have something to show, then one picture per screen. Output: docs/screens/<lang>/<theme>/*.webp
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const i18next = require('i18next');
const { chromium } = require('playwright');
const { start } = require('../e2e/harness');
const { showcase } = require('./showcase');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screens');
const LOCALES = { en: 'en-US', uz: 'uz-UZ', ru: 'ru-RU' };

/** The app's own strings, so every button is found by the label it really shows. */
function loadStrings(lang) {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'i18n', `${lang}.ts`), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('exports', 'require', 'module', output)(module.exports, require, module);
  return module.exports[lang];
}

const GEMINI_MODELS = [
  ['gemini-3-pro-preview', 'Gemini 3 Pro Preview', ['generateContent']],
  ['gemini-3-flash-preview', 'Gemini 3 Flash Preview', ['generateContent']],
  ['gemini-2.5-pro', 'Gemini 2.5 Pro', ['generateContent']],
  ['gemini-2.5-flash', 'Gemini 2.5 Flash', ['generateContent']],
  ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite', ['generateContent']],
  ['gemini-2.5-flash-preview-tts', 'Gemini 2.5 Flash TTS', ['generateContent']],
  ['gemini-2.5-flash-image', 'Gemini 2.5 Flash Image', ['generateContent']],
  ['gemini-2.5-flash-native-audio-preview', 'Gemini 2.5 Flash Native Audio', ['bidiGenerateContent']],
  ['imagen-4.0-generate-001', 'Imagen 4', ['predict']],
  ['veo-3.0-generate-001', 'Veo 3', ['predictLongRunning']],
  ['gemini-embedding-001', 'Gemini Embedding', ['embedContent']],
].map(([id, displayName, methods]) => ({ name: `models/${id}`, displayName, supportedGenerationMethods: methods }));

async function mockGemini(page, outline) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const json = (body) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (request.method() === 'GET') return json({ models: GEMINI_MODELS });
    const text = JSON.stringify({ title: outline.title, description: outline.description, lessons: outline.lessons.map((title) => ({ title, summary: '' })) });
    return json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 812, candidatesTokenCount: 164 } });
  });
}

const TAB_ICONS = {
  library: '<path d="M5 4h3v16H5zM10 4h3v16h-3zM15.2 5.2l2.8-.9 4 15-2.8.9z" fill="currentColor"/>',
  review: '<path d="M12 5a7 7 0 0 1 6.7 5h-2.4l3.3 4 3.3-4h-2.2A9 9 0 1 0 21 13h-2a7 7 0 1 1-7-8z" fill="currentColor"/>',
  focus: '<path d="M9 2h6v2H9zM12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm-1 2v5l4 2 .9-1.7-2.9-1.5V10z" fill="currentColor"/>',
  settings: '<path d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" fill="currentColor" fill-rule="evenodd"/>',
};

/**
 * Makes the web build look like the phone: a status bar on top, and on the four tab screens the
 * floating tab bar iOS draws, in place of the web build's own tab bar.
 */
async function phoneFrame(page, theme, tabs, active) {
  await page.evaluate(
    ({ theme, tabs, active, icons }) => {
      const dark = theme === 'dark';
      const ink = dark ? '#ffffff' : '#000000';
      const style = document.createElement('style');
      style.id = 'kiwa-phone';
      style.textContent = `
        #root { position: fixed !important; inset: 50px 0 0 0 !important; height: auto !important; }
        [class*="nativeTabsContainer"] [class*="navigationMenuRoot"] { display: none !important; }
        .kiwa-status { position: fixed; z-index: 99; inset: 0 0 auto; height: 50px; display: flex; align-items: center; justify-content: space-between; padding: 6px 30px 0 40px; font: 600 16px -apple-system, 'SF Pro Text', Inter, system-ui, sans-serif; color: ${ink}; background: ${dark ? '#0F141B' : '#F2F4F7'}; }
        .kiwa-status svg { display: block; }
        .kiwa-tabs { position: fixed; z-index: 99; left: 22px; right: 22px; bottom: 26px; height: 64px; border-radius: 32px; display: flex; padding: 4px; gap: 2px;
          background: ${dark ? 'rgba(40,46,56,.72)' : 'rgba(255,255,255,.72)'}; backdrop-filter: blur(18px) saturate(1.6); -webkit-backdrop-filter: blur(18px) saturate(1.6);
          box-shadow: 0 10px 30px rgba(0,0,0,${dark ? '.55' : '.16'}), inset 0 0 0 .5px rgba(${dark ? '255,255,255,.18' : '0,0,0,.08'}); }
        .kiwa-tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: 28px; font: 600 10.5px -apple-system, Inter, system-ui, sans-serif; color: ${dark ? '#98A4B5' : '#586475'}; }
        .kiwa-tab.on { color: ${dark ? '#4CC3CF' : '#0A6E7A'}; background: ${dark ? 'rgba(255,255,255,.1)' : 'rgba(10,110,122,.1)'}; }
        .kiwa-tab svg { width: 24px; height: 24px; }`;
      document.head.appendChild(style);
      const status = document.createElement('div');
      status.className = 'kiwa-status';
      status.innerHTML = `<span>9:41</span><span style="display:flex;gap:6px;align-items:center">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="${ink}"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="${ink}"><path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.3-1.4A10.6 10.6 0 0 0 8 .3 10.6 10.6 0 0 0 .5 3.3l1.3 1.4A8.7 8.7 0 0 1 8 2.2zm0 3.7c1.4 0 2.7.5 3.6 1.4l1.3-1.4A7 7 0 0 0 8 4 7 7 0 0 0 3.1 5.9l1.3 1.4C5.3 6.4 6.6 5.9 8 5.9zM8 9.6c.5 0 .9.2 1.2.5L8 11.6l-1.2-1.5c.3-.3.7-.5 1.2-.5z"/></svg>
        <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="${ink}" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2" fill="${ink}"/><rect x="24.5" y="4.5" width="1.5" height="4" rx=".75" fill="${ink}" opacity=".4"/></svg></span>`;
      document.body.appendChild(status);
      if (active) {
        const bar = document.createElement('div');
        bar.className = 'kiwa-tabs';
        bar.innerHTML = tabs.map((tab) => `<div class="kiwa-tab${tab.key === active ? ' on' : ''}"><svg viewBox="0 0 24 24">${icons[tab.key]}</svg>${tab.label}</div>`).join('');
        document.body.appendChild(bar);
      }
    },
    { theme, tabs, active, icons: TAB_ICONS },
  );
}

async function capture(lang, theme) {
  const strings = loadStrings(lang);
  const i18n = i18next.createInstance();
  await i18n.init({ lng: lang, resources: { [lang]: { translation: strings } }, interpolation: { escapeValue: false } });
  const t = (key, options) => i18n.t(key, options);
  const { file, copy } = showcase(lang);

  const h = await start({ locale: LOCALES[lang], colorScheme: theme });
  const { page, base, step } = h;
  page.setDefaultTimeout(15000);
  const dir = path.join(OUT, lang, theme);
  fs.mkdirSync(dir, { recursive: true });
  const shot = async (name) => {
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelectorAll('.kiwa-status, .kiwa-tabs, #kiwa-phone').forEach((node) => node.remove()));
    await phoneFrame(page, theme, tabs, TAB_OF[name] ?? null);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(dir, `${name}.png`) });
  };
  const button = (name, nth) => {
    const all = page.getByRole('button', { name, exact: true }).filter({ visible: true });
    return nth === undefined ? all.last() : all.nth(nth);
  };
  const text = (value) => page.getByText(value, { exact: false }).filter({ visible: true }).first();
  const field = (label) => page.getByLabel(label, { exact: true }).filter({ visible: true }).last();
  const visit = async (route) => {
    await page.goto(`${base}${route}`);
    await page.waitForLoadState('networkidle');
  };
  await mockGemini(page, copy.outline);
  await page.addInitScript(() => {
    globalThis.__KIWA_PHONE_FRAME__ = true;
  });
  const tabs = ['library', 'review', 'focus', 'settings'].map((key) => ({ key, label: t(`tabs.${key}`) }));
  const TAB_OF = { library: 'library', review: 'review', focus: 'focus', settings: 'settings' };

  await step('welcome', async () => {
    await visit('/');
    await button(t('welcome.start')).waitFor();
    await shot('welcome');
    await button(t('welcome.start')).click();
    await page.getByRole('button', { name: t('library.new'), exact: true }).filter({ visible: true }).first().waitFor();
  });

  await step('import the showcase group', async () => {
    await visit('/import');
    await field(t('import.pastePlaceholder')).fill(JSON.stringify(file));
    await button(t('import.check')).click();
    await button(t('import.addAll', { count: 3 })).click();
    await page.waitForURL(/group=/);
    await text(copy.course).waitFor();
    // The top of the library: the new folder, then the items in no folder.
    await visit('/');
    await text(copy.group).waitFor();
    await shot('library');
  });

  await step('course', async () => {
    await visit('/item/kiwa-memory');
    await text(copy.lessons[2].title).waitFor();
    await shot('course');
  });

  await step('lesson with an animated picture', async () => {
    await visit('/item/kiwa-memory/lesson/forgetting-curve');
    await text(copy.lessons[0].caption).waitFor();
    await page.waitForTimeout(3500);
    await shot('lesson');
  });

  await step('quiz and result', async () => {
    await visit('/item/kiwa-quiz/play/kiwa-quiz-main');
    await text(copy.order.prompt).waitFor();
    await shot('quiz');
    await button(t('study.next')).click();
    await text(copy.single.prompt).waitFor();
    await page.getByRole('radio', { name: copy.single.options[0] }).filter({ visible: true }).first().click();
    await button(t('study.next')).click();
    await text(copy.tf.prompt).waitFor();
    await page.getByRole('radio', { name: t('study.false') }).filter({ visible: true }).first().click();
    await button(t('study.submit')).click();
    const confirm = button(t('study.submitUnanswered.confirm'));
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await page.waitForURL(/\/result\//);
    await page.waitForTimeout(800);
    await shot('result');
  });

  await step('flashcards', async () => {
    await visit('/item/kiwa-terms/play/cards');
    await button(t('study.flashcard.show')).click();
    await shot('flashcard');
  });

  await step('create with AI', async () => {
    await visit('/create');
    await field(t('create.topic')).fill(copy.topic);
    await button(t('create.auto')).click();
    await button(t('create.autoShort'), 0).click();
    await shot('create');
  });

  await step('provider models', async () => {
    await visit('/provider/new');
    await button('Gemini').click();
    await field(t('providers.key')).fill('AIza-example-key');
    await button(t('providers.detect')).click();
    await text(t('providers.found', { count: GEMINI_MODELS.length })).waitFor();
    // Tick the stable Flash model instead of the first one sorted.
    const flash = button(t('providers.useModel', { model: 'Gemini 2.5 Flash' }));
    if ((await flash.getAttribute('aria-pressed')) !== 'true') await flash.click();
    for (const model of GEMINI_MODELS) {
      if (model.displayName === 'Gemini 2.5 Flash') continue;
      const other = page.getByRole('button', { name: t('providers.useModel', { model: model.displayName }), exact: true, pressed: true }).filter({ visible: true });
      if (await other.count()) await other.first().click();
    }
    await page.getByText(t('providers.models'), { exact: true }).filter({ visible: true }).first().evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await shot('models');
    await button(t('common.save')).click();
    // Saved. With the page opened by address there is no screen to go back to, so it stays.
    await page.waitForTimeout(800);
  });

  await step('course outline from Generate', async () => {
    await visit('/create');
    await field(t('create.topic')).fill(copy.genTopic);
    await button(t('create.generate')).click();
    await text(t('job.outlineIntro')).waitFor();
    await shot('outline');
  });

  await step('focus', async () => {
    await visit('/focus');
    await button(t('focus.startFocus')).click();
    await page.waitForTimeout(2500);
    await shot('focus');
  });

  await step('review', async () => {
    await visit('/review');
    await text(t('review.progress')).waitFor();
    await shot('review');
  });

  await step('settings', async () => {
    await visit('/settings');
    await text(t('language.title')).waitFor();
    await shot('settings');
  });

  await h.finish();
}

/** PNG to WebP in the browser: a quarter of the size, and still sharp text. */
async function toWebp() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.png')) files.push(full);
    }
  };
  walk(OUT);
  for (const file of files) {
    const dataUrl = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
    const webp = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/webp', 0.86);
    }, dataUrl);
    fs.writeFileSync(file.replace(/\.png$/, '.webp'), Buffer.from(webp.split(',')[1], 'base64'));
    fs.unlinkSync(file);
  }
  await browser.close();
  return files.length;
}

(async () => {
  // LANGS=en,uz picks languages. Not an argument: the harness reads the first one as the build folder.
  const langs = process.env.LANGS ? process.env.LANGS.split(',') : Object.keys(LOCALES);
  for (const lang of langs) {
    for (const theme of ['light', 'dark']) {
      console.log(`== ${lang} ${theme}`);
      await capture(lang, theme);
    }
  }
  console.log(`converted ${await toWebp()} screenshots`);
})();
