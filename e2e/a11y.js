// Runs the axe accessibility engine on each main screen and fails on serious or critical problems.
const fs = require('fs');
const path = require('path');
const { start } = require('./harness');

const AXE = fs.readFileSync(path.join(path.dirname(require.resolve('axe-core')), 'axe.min.js'), 'utf8');

(async () => {
  const h = await start();
  const { page, base, step, button, top, seen, home } = h;
  const report = [];

  /** Checks only what is on screen now. Screens hidden behind it are skipped. */
  const audit = async (name) => {
    await page.waitForTimeout(400);
    await page.addScriptTag({ content: AXE });
    const result = await page.evaluate(async () => {
      const outcome = await globalThis.axe.run(document, { resultTypes: ['violations'] });
      return outcome.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes
          .filter((node) => {
            const element = document.querySelector(node.target[0]);
            return element && element.getBoundingClientRect().width > 0 && element.offsetParent !== null;
          })
          .map((node) => `${node.target.join(' ')} :: ${node.failureSummary?.split('\n').slice(1, 3).join(' ')}`.slice(0, 220)),
      })).filter((violation) => violation.nodes.length > 0);
    });
    const serious = result.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    for (const violation of result) report.push(`[${name}] ${violation.impact} ${violation.id}: ${violation.help} (${violation.nodes.length})\n    ${violation.nodes.slice(0, 3).join('\n    ')}`);
    if (serious.length > 0) throw new Error(serious.map((violation) => `${violation.id} x${violation.nodes.length}`).join(', '));
  };

  await step('welcome', async () => {
    await page.goto(`${base}/`);
    await seen('Get started');
    await audit('welcome');
  });
  await step('library', async () => {
    await home();
    await audit('library');
  });
  await step('course', async () => {
    await h.open('How to study so it sticks');
    await audit('course');
  });
  await step('lesson', async () => {
    await page.getByText('1. Recall beats rereading').click();
    await seen('Lesson 1 of 3');
    await audit('lesson');
  });
  await step('question', async () => {
    await top('Start').click();
    await seen('Question 1 of 3');
    await audit('question');
  });
  await step('create', async () => {
    await home();
    await button('New').click();
    await page.getByText('Create with AI', { exact: true }).locator('visible=true').last().click();
    await seen('What to create');
    await audit('create');
  });
  await step('import', async () => {
    await home();
    await button('New').click();
    await page.getByText('Import', { exact: true }).locator('visible=true').last().click();
    await seen('Choose file');
    await audit('import');
  });
  await step('editor', async () => {
    await home();
    await h.open('Git in ten minutes');
    await top('More actions').click();
    await page.getByText('Edit', { exact: true }).locator('visible=true').last().click();
    await seen('Save details');
    await audit('editor');
  });
  for (const tab of ['Review', 'Focus', 'Settings']) {
    await step(`${tab.toLowerCase()} tab`, async () => {
      await home();
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForTimeout(300);
      await audit(tab.toLowerCase());
    });
  }
  await step('provider', async () => {
    await button('Add provider').click();
    await seen('Test and detect models');
    await audit('provider');
  });

  fs.writeFileSync(path.join(h.out, 'a11y-report.txt'), report.join('\n'));
  console.log(report.join('\n') || 'No accessibility problems found.');
  await h.finish();
})();
