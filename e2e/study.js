// Study flows: lessons, every question type, all three modes, resume, results.
const { start } = require('./harness');

(async () => {
  const h = await start();
  const { page, base, step } = h;
  const shot = (name) => h.shot('study-' + name);
  const button = (name) => page.getByRole('button', { name, exact: true }).last();
  const text = (value) => page.getByText(value, { exact: false }).last();
  const seen = (value) => text(value).waitFor();

  await page.goto(base + '/');
  await page.getByText('How to study so it sticks').first().waitFor({ timeout: 20000 });

  await step('course: start opens lesson 1 with formatted content', async () => {
    await h.open('How to study so it sticks');
    await button('Start course').click();
    await seen('Lesson 1 of 3');
    await seen('retrieval practice');
    await seen('Tip');
    await shot('lesson');
  });

  await step('practice: single choice, wrong answer shows the right one', async () => {
    await button('Start').click();
    await seen('Question 1 of 3');
    if (!(await button('Check').isDisabled())) throw new Error('Check enabled before answering');
    await page.getByRole('radio', { name: 'Reread your notes twice' }).click();
    await button('Check').click();
    await seen('Not quite');
    await page.getByRole('radio', { name: /Close your notes.*Correct answer/ }).waitFor();
    await shot('feedback');
    await button('Next').click();
  });

  await step('practice: true or false, then short answer typed loosely', async () => {
    await seen('Question 2 of 3');
    await page.getByRole('radio', { name: 'False', exact: true }).click();
    await button('Check').click();
    await seen('Correct');
    await button('Next').click();
    await page.getByPlaceholder('Your answer').last().fill('  Active  Recall! ');
    await button('Check').click();
    await seen('Correct');
    await button('Finish').click();
  });

  await step('result: 67 percent, practice has no pass mark', async () => {
    await seen('67%');
    await seen('Practice complete');
    await seen('2 of 3 points');
    await shot('result-practice');
    await button('Done').click();
    await seen('Last score 67%');
  });

  await step('lesson 1 completes and moves to lesson 2', async () => {
    await button('Complete and continue').click();
    await seen('Lesson 2 of 3');
    await seen('Space it out');
  });

  await step('practice: multiple choice partial credit, cloze with typed and picked gaps', async () => {
    await button('Start').click();
    await page.getByRole('checkbox', { name: 'The gaps between reviews can grow over time' }).click();
    await button('Check').click();
    await seen('Partly correct');
    await button('Next').click();
    await seen('(1) _____');
    await page.getByPlaceholder('Your answer').last().fill('fade');
    await button('slower').click();
    await seen('(2) slower');
    await shot('cloze');
    await button('Check').click();
    await seen('Correct');
    await button('Finish').click();
    await seen('75%');
    await button('Done').click();
    await button('Complete and continue').click();
    await seen('Lesson 3 of 3');
  });

  await step('test: no feedback before submit, essay compared and self-rated', async () => {
    await button('Start').click();
    await seen('Question 1 of 2');
    await page.getByRole('radio', { name: 'Speed', exact: true }).click();
    if (await button('Check').count()) throw new Error('a test should not offer Check');
    await button('Next').click();
    if (!(await button('Compare with model answer').isDisabled())) throw new Error('compare enabled with no text');
    await page.getByPlaceholder('Write your answer').last().fill('I would come back to each chapter after a few days and mix in older questions.');
    await seen('16 words');
    await button('Compare with model answer').click();
    await seen('Model answer');
    await seen('What a good answer includes');
    await shot('essay');
    await button('Got it').click();
    await button('Submit').click();
    await seen('50%');
    await seen('Passed');
    await seen('Pass mark 50%');
    await shot('result-test');
    await button('Done').click();
  });

  await step('last lesson completes and returns to the course', async () => {
    await button('Complete lesson').click();
    await seen('Final exam');
    // The course re-reads its marks after the write, so wait for all three instead of counting once.
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Mark lesson as not completed"]').length >= 3, null, { timeout: 8000 });
  });

  await step('exam: leave halfway, resume with the answer kept', async () => {
    await button('Start').click();
    await seen('Question 1 of 3');
    await page.getByRole('radio', { name: /Four 15 minute sessions/ }).click();
    await button('Next').click();
    await seen('Question 2 of 3');
    await page.goBack();
    await button('Resume').click();
    await seen('Question 2 of 3');
    await button('Back').click();
    const checked = await page.getByRole('radio', { name: /Four 15 minute sessions/ }).last().getAttribute('aria-checked');
    if (checked !== 'true') throw new Error(`answer not kept (aria-checked=${checked})`);
  });

  await step('exam: unanswered question is confirmed, then fails below the pass mark', async () => {
    await button('Next').click();
    await button('Next').click();
    await seen('Question 3 of 3');
    await page.getByPlaceholder('Your answer').last().fill('interleaving');
    await button('Submit').click();
    await seen('1 question is unanswered');
    await button('Submit anyway').click();
    await seen('67%');
    await seen('Not passed');
    await button('Done').click();
    await seen('Last score 67%');
  });

  await step('exam: passing marks the course completed', async () => {
    await button('Try again').click();
    await page.getByRole('radio', { name: /Four 15 minute sessions/ }).click();
    await button('Next').click();
    await page.getByRole('radio', { name: 'False', exact: true }).click();
    await button('Next').click();
    await page.getByPlaceholder('Your answer').last().fill('Interleaved practice');
    await button('Submit').click();
    await seen('100%');
    await button('Done').click();
    await seen('Completed');
    await shot('course-done');
    await page.goBack();
  });

  await step('quiz: finishing marks it completed', async () => {
    await h.open('Git in ten minutes');
    await button('Start').click();
    await page.getByRole('radio', { name: 'A snapshot of the whole project' }).click();
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
    await seen('100%');
    await button('Done').click();
    await seen('Completed');
    await page.goBack();
  });

  await step('deck: flip and rate every card', async () => {
    await h.open('Everyday keyboard shortcuts');
    await button('Study').click();
    await seen('Card 1 of 10');
    if (!(await button('Next').isDisabled())) throw new Error('Next enabled before rating');
    await button('Show answer').click();
    await seen('Ctrl + Z');
    await shot('flashcard');
    await button('Again').click();
    await button('Next').click();
    for (let card = 2; card <= 10; card += 1) {
      await seen(`Card ${card} of 10`);
      await button('Show answer').click();
      await button(card % 2 ? 'Good' : 'Easy').click();
      await button(card === 10 ? 'Finish' : 'Next').click();
    }
    await seen('Round complete');
    await shot('result-deck');
    await button('Done').click();
    await seen('See last result');
  });

  await step('results survive a reload', async () => {
    await page.goto(base + '/');
    await page.getByText('How to study so it sticks').first().waitFor({ timeout: 20000 });
    const completed = await page.getByText('COMPLETED', { exact: false }).count();
    if (completed < 2) throw new Error(`expected 2 completed items, saw ${completed}`);
  });

  await h.finish();
})();
