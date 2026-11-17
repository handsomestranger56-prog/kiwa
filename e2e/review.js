// First launch, the review queue with growing gaps, statistics and the review reminder.
const { start } = require('./harness');

(async () => {
  const h = await start();
  const { page, base, step, button, top, seen, home, download } = h;
  const shot = (name) => h.shot('review-' + name);

  await page.clock.install({ time: new Date('2026-03-10T10:00:00') });

  const openTab = async (name) => {
    await page.getByRole('tab', { name }).click();
  };

  await step('first launch says hello once and keeps the name', async () => {
    await page.goto(`${base}/`);
    await seen('Get started');
    await seen('Learn in short lessons');
    await shot('welcome');
    await page.getByLabel('Your name (optional)', { exact: true }).fill('Ada');
    await button('Get started').click();
    await page.getByText('How to study so it sticks').first().waitFor({ timeout: 20000 });
    await page.reload();
    await page.getByText('How to study so it sticks').first().waitFor({ timeout: 20000 });
    if (await page.getByRole('button', { name: 'Get started' }).count()) throw new Error('welcome shown twice');
    await openTab('Settings');
    if ((await page.getByLabel('Your name', { exact: true }).locator('visible=true').last().inputValue()) !== 'Ada') throw new Error('name not saved');
  });

  await step('the queue starts empty', async () => {
    await openTab('Review');
    await seen('questions due');
    await seen('Questions you miss and flashcards you study come back here');
    if (!(await button('Start review').isDisabled())) throw new Error('review possible with nothing due');
  });

  await step('a missed question joins the queue', async () => {
    await home();
    await h.open('Git in ten minutes');
    await top('Start').click();
    await page.getByRole('radio', { name: 'Only the lines that changed' }).click();
    await button('Check').click();
    await button('Next').click();
    await page.getByRole('radio', { name: 'False', exact: true }).click();
    await button('Check').click();
    await button('Next').click();
    const fields = page.getByPlaceholder('Your answer');
    await fields.nth((await fields.count()) - 2).fill('add');
    await fields.last().fill('commit');
    await button('Check').click();
    await button('Next').click();
    await page.getByRole('checkbox', { name: /git commit/ }).click();
    await page.getByRole('checkbox', { name: /git branch/ }).click();
    await button('Check').click();
    await button('Next').click();
    await page.getByPlaceholder('Your answer').last().fill('git log');
    await button('Check').click();
    await button('Finish').click();
    await seen('80%');
    await home();
    await openTab('Review');
    await seen('1 more due by tomorrow · 1 in your queue');
  });

  await step('it comes back after its gap and moves on when answered right', async () => {
    await page.clock.fastForward('11:00');
    await home();
    await openTab('Review');
    await seen('question due');
    await shot('due');
    await button('Start review').click();
    await seen('Review 1 of 1');
    await seen('Git in ten minutes');
    await page.getByRole('radio', { name: 'A snapshot of the whole project' }).click();
    await button('Check').click();
    await seen('Correct');
    await button('Finish').click();
    await seen('All caught up');
    await seen('1 of 1 right.');
    await button('Done').click();
    await seen('1 in your queue');
  });

  await step('studied flashcards join the queue too', async () => {
    await home();
    await h.open('Everyday keyboard shortcuts');
    await top('Study').click();
    for (let card = 1; card <= 10; card += 1) {
      await seen(`Card ${card} of 10`);
      await button('Show answer').click();
      await button(card === 1 ? 'Again' : 'Good').click();
      await button(card === 10 ? 'Finish' : 'Next').click();
    }
    await seen('Round complete');
    await home();
    await openTab('Review');
    await seen('11 in your queue');
  });

  await step('progress shows the streak, the week and quiz scores', async () => {
    await page.getByText('1-day streak', { exact: true }).locator('visible=true').first().waitFor();
    await page.getByLabel('Studied on 1 of the last 7 days', { exact: true }).waitFor();
    await seen('1 quiz or test finished in the last 30 days, average 80%.');
    await shot('stats');
  });

  await step('the review reminder is scheduled for the next due card', async () => {
    await openTab('Settings');
    await page.getByRole('switch', { name: 'Reviews due' }).click();
    await page.clock.runFor(1500);
    await page.waitForFunction(() => (globalThis.__notifications?.scheduled ?? []).some((entry) => entry.id === 'reviews'), null, { timeout: 5000 });
  });

  await step('the queue is part of a backup', async () => {
    const backup = await download(() => page.getByText('Back up everything').last().click());
    const data = JSON.parse(backup.text);
    if (data.reviewCards.length !== 11) throw new Error(`expected 11 cards in the backup, saw ${data.reviewCards.length}`);
  });

  await h.finish();
})();
