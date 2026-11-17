// Pomodoro, focus sessions, interruptions, streaks, reminders and focus view, on a controllable clock.
const { start } = require('./harness');

(async () => {
  const h = await start();
  const { page, step, button, top, seen, home } = h;
  const shot = (name) => h.shot('focus-' + name);
  const scheduled = () => page.evaluate(() => (globalThis.__notifications?.scheduled ?? []).map((entry) => ({ id: entry.id, at: entry.at })));

  // 10:00 local time. Timers in the page follow this clock, and it can be moved forward.
  await page.clock.install({ time: new Date('2026-03-10T10:00:00') });

  const setVisible = (visible) =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'visible' : 'hidden') });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => !value });
      document.dispatchEvent(new Event('visibilitychange'));
    }, visible);

  const openFocus = async () => {
    await home();
    await page.getByRole('tab', { name: 'Focus' }).click();
    await seen('Lengths');
  };

  await openFocus();

  await step('the timer starts at the focus length', async () => {
    await seen('Focus · round 1 of 4');
    await seen('25:00');
    await seen('Finish a quiz or a focus session to start a streak.');
  });

  await step('starting a round schedules the end-of-round notification', async () => {
    await button('Start focus').click();
    await page.clock.runFor(3000);
    await seen('24:5');
    await page.waitForFunction(() => (globalThis.__notifications?.scheduled ?? []).some((entry) => entry.id === 'timer'), null, { timeout: 5000 });
    const timer = (await scheduled()).find((entry) => entry.id === 'timer');
    const expected = new Date('2026-03-10T10:25:00').getTime();
    if (Math.abs(timer.at - expected) > 5000) throw new Error(`timer notification at ${new Date(timer.at).toISOString()}`);
    await shot('running');
  });

  await step('leaving the app during focus counts as an interruption', async () => {
    await setVisible(false);
    await page.clock.runFor(1000);
    await setVisible(true);
    await seen('You left the app 1 time during this round.');
  });

  await step('a finished round is logged and starts a streak', async () => {
    await page.clock.fastForward('25:00');
    await page.clock.runFor(2000);
    await seen('Short break');
    await seen('05:00');
    await seen('1 session · 25 minutes focused · 1 interruption');
    await seen('1-day streak');
    await shot('break');
  });

  await step('the timer is where it was after the app reopens', async () => {
    await page.reload();
    await page.getByRole('tab', { name: 'Focus' }).click();
    await seen('Short break');
    await seen('1 session');
  });

  await step('pause keeps the time left, resume carries on', async () => {
    await button('Start break').click();
    await page.clock.runFor(60_000);
    await seen('04:0');
    await button('Pause').click();
    await page.clock.runFor(120_000);
    await seen('04:0');
    await button('Resume').click();
    await page.clock.runFor(60_000);
    await seen('03:0');
  });

  await step('changing the focus length applies to the next round', async () => {
    await button('Skip').click();
    await seen('Focus · round 2 of 4');
    await button('More: Focus, minutes').click();
    await seen('30:00');
  });

  await step('the daily reminder is skipped today once studied', async () => {
    await page.getByRole('tab', { name: 'Settings' }).click();
    await seen('Reminders');
    await page.getByRole('switch', { name: 'Daily study reminder' }).click();
    await seen('Every day at 19:00');
    await page.clock.runFor(1500);
    await page.waitForFunction(() => (globalThis.__notifications?.scheduled ?? []).filter((entry) => entry.id.startsWith('daily-')).length === 6, null, { timeout: 5000 });
    const daily = (await scheduled()).filter((entry) => entry.id.startsWith('daily-'));
    if (daily.some((entry) => entry.id === 'daily-today')) throw new Error('reminder for today despite study today');
    const first = new Date(Math.min(...daily.map((entry) => entry.at)));
    if (first.getDate() !== 11 || first.getHours() !== 19) throw new Error(`first reminder at ${first}`);
    await shot('reminders');
  });

  await step('turning the reminder off removes it', async () => {
    await page.getByRole('switch', { name: 'Daily study reminder' }).click();
    await page.clock.runFor(1500);
    await page.waitForFunction(() => !(globalThis.__notifications?.scheduled ?? []).some((entry) => entry.id.startsWith('daily-')), null, { timeout: 5000 });
  });

  await step('focus view hides navigation and keeps the timer at hand', async () => {
    await home();
    await h.open('How to study so it sticks');
    await page.getByText('1. Recall beats rereading').click();
    await seen('Lesson 1 of 3');
    await top('Lesson actions').click();
    await page.getByText('Focus view', { exact: true }).locator('visible=true').last().click();
    await seen('Exit focus view');
    await seen('30:00');
    if (await page.getByText('Lesson 1 of 3', { exact: true }).locator('visible=true').count()) throw new Error('header still shown');
    await shot('view');
    await button('Exit focus view').click();
    await seen('Lesson 1 of 3');
  });

  await h.finish();
})();
