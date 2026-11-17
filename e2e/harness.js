// Serves the exported web build and gives each check a phone-sized browser page plus a few helpers.
//
// Usage: build with `npx expo export --platform web`, then `node e2e/<name>.js`.
// Needs Playwright with Chromium available to Node.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
};

const VIEWPORT = { width: 390, height: 844 };

async function start({ permissions = [], colorScheme = 'light' } = {}) {
  const dist = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error(`No web build at ${dist}. Run: npx expo export --platform web`);
  }
  const out = path.join(__dirname, '.output');
  fs.mkdirSync(out, { recursive: true });

  // SQLite on the web needs a cross-origin isolated page, hence the two headers.
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(dist, url);
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(dist, 'index.html');
    }
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme, deviceScaleFactor: 2, acceptDownloads: true, permissions });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);

  const steps = [];
  const log = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') log.push(`${message.type()}: ${message.text().slice(0, 300)}`);
  });
  page.on('pageerror', (error) => log.push(`pageerror: ${error.message.slice(0, 300)}`));

  const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });

  const step = async (name, run) => {
    try {
      await run();
      steps.push(`ok   ${name}`);
    } catch (error) {
      steps.push(`FAIL ${name}: ${String(error.message).split('\n').slice(0, 4).join(' | ')}`);
      await shot(`fail-${steps.length}`).catch(() => {});
    }
  };

  /** The last visible button with exactly this accessible name. */
  const button = (name) => page.getByRole('button', { name, exact: true }).locator('visible=true').last();

  /**
   * Screens underneath the current one stay mounted on the web, so several buttons can share a name.
   * This clicks the one that is really on top.
   */
  const top = (name, role = 'button') => ({
    click: async () => {
      const deadline = Date.now() + 8000;
      for (;;) {
        for (const candidate of await page.getByRole(role, { name, exact: true }).all()) {
          await candidate.scrollIntoViewIfNeeded({ timeout: 500 }).catch(() => {});
          const onTop = await candidate
            .evaluate((element) => {
              const box = element.getBoundingClientRect();
              if (box.width === 0 || box.height === 0) return false;
              const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
              return !!hit && (element === hit || element.contains(hit));
            })
            .catch(() => false);
          if (onTop) return candidate.click();
        }
        if (Date.now() > deadline) throw new Error(`no ${role} on top named ${name}`);
        await page.waitForTimeout(150);
      }
    },
  });

  const seen = (value) => page.getByText(value, { exact: false }).last().waitFor();
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

  const download = async (trigger) => {
    const [file] = await Promise.all([page.waitForEvent('download'), trigger()]);
    const target = path.join(out, `dl-${file.suggestedFilename()}`);
    await file.saveAs(target);
    return { name: file.suggestedFilename(), path: target, text: fs.readFileSync(target, 'utf8') };
  };

  const chooseFile = async (filePath, label = 'Choose file') => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button(label).click()]);
    await chooser.setFiles(filePath);
  };

  /** Opens the library and waits until the bundled samples are listed. */
  const home = async () => {
    await page.goto(`${base}/`);
    await page.getByText('How to study so it sticks').first().waitFor({ timeout: 20000 });
    // The router finishes restoring its state a moment after the first paint. A tap before that is undone.
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  };

  /**
   * Opens a library item by tapping its title. A tap during startup can be swallowed while the
   * router restores its state, so the tap is repeated until the item screen is showing.
   */
  const open = async (title) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await page.getByText(title, { exact: true }).locator('visible=true').first().click();
      try {
        await page.waitForURL(/\/item\//, { timeout: 2500 });
        await page.getByRole('button', { name: 'More actions', exact: true }).locator('visible=true').last().waitFor({ timeout: 4000 });
        return;
      } catch {
        // Not there yet. Tap again.
      }
    }
    throw new Error(`could not open ${title}`);
  };

  /** Waits until no visible element shows this text. Hidden screens behind the current one are ignored. */
  const gone = (text) =>
    page.waitForFunction(
      (value) => ![...document.querySelectorAll('div[dir="auto"]')].some((node) => node.offsetParent !== null && node.textContent === value),
      text,
      { timeout: 8000 },
    );

  const finish = async () => {
    console.log(steps.join('\n'));
    const unique = [...new Set(log)];
    console.log(`--- console (${unique.length})`);
    if (unique.length > 0) console.log(unique.slice(0, 15).join('\n'));
    await browser.close();
    server.close();
    if (steps.some((line) => line.startsWith('FAIL'))) process.exitCode = 1;
  };

  return { page, context, browser, base, out, steps, step, shot, button, top, seen, clipboard, download, chooseFile, home, open, gone, finish, VIEWPORT };
}

module.exports = { start };
