// Builds a course on the phone with every question type, then plays the three arrange-style types.
const { start } = require('./harness');

(async () => {
  const h = await start();
  const { page, step, button, top, seen, home } = h;
  const shot = (name) => h.shot('editor-' + name);
  const field = (label) => page.getByLabel(label, { exact: true }).locator('visible=true').last();
  const sheetItem = (text) => page.getByText(text, { exact: true }).locator('visible=true').last();

  /** Opens the type chooser, picks a type, runs `fill`, saves, and checks the new row is listed. */
  const addQuestion = async (typeLabel, prompt, fill) => {
    await button('Add question').click();
    await sheetItem(typeLabel).click();
    await seen('New question');
    await field(typeLabel === 'Flashcard' ? 'Front' : 'Question').fill(prompt);
    await fill();
    await button('Save').click();
    await page.getByText(prompt, { exact: false }).locator('visible=true').last().waitFor();
    await seen('Add question');
  };

  await home();

  await step('create an empty course and open its editor', async () => {
    await button('New').click();
    await sheetItem('Lessons with quizzes and a final exam').click();
    await page.getByPlaceholder('Title', { exact: true }).fill('Volcanoes');
    await button('Create').click();
    await seen('This course has no lessons yet.');
    await top('More actions').click();
    await sheetItem('Edit').click();
    await seen('Save details');
  });

  await step('edit details', async () => {
    await field('Description').fill('How volcanoes form and erupt.');
    await button('Beginner').click();
    await field('Tags').fill('geology, earth');
    await button('Save details').click();
    await seen('Saved');
  });

  await step('a title is required', async () => {
    await field('Title').fill('   ');
    await button('Save details').click();
    await seen('Not saved yet');
    await field('Title').fill('Volcanoes');
    await button('Save details').click();
    await seen('Saved');
  });

  await step('add a lesson with text, a callout and a removed block', async () => {
    await button('Add lesson').click();
    await page.getByPlaceholder('Title', { exact: true }).fill('What is a volcano?');
    await button('Create').click();
    await seen('No content yet. Add a block below.');
    await field('Summary').fill('An opening in the crust.');
    await field('Reading time in minutes').fill('3');
    await button('Text').click();
    await field('Text 1: Text. Markdown such as **bold** and lists works.').fill('A volcano is an **opening** in the crust.');
    await button('Code').click();
    await button('Callout').click();
    await button('Tip').click();
    await field('Callout 3: Text. Markdown such as **bold** and lists works.').fill('Most volcanoes sit on plate boundaries.');
    await button('Remove: Code 2').click();
    await button('Move up: Callout 2').click();
    await seen('Callout 1');
    await button('Save lesson').click();
    await seen('Saved');
    await shot('lesson');
  });

  await step('add a practice quiz to the lesson', async () => {
    await button('Add a quiz or test').click();
    await sheetItem('Feedback after every answer.').click();
    await seen('No questions yet.');
  });

  await step('a question cannot be saved half filled', async () => {
    await button('Add question').click();
    await sheetItem('Single choice').click();
    await button('Save').click();
    await seen('Not saved yet');
    await page.goBack();
    await seen('No questions yet.');
  });

  await step('add matching, ordering and sorting questions', async () => {
    await addQuestion('Matching pairs', 'Match each volcano to its country.', async () => {
      await field('Left 1').fill('Etna');
      await field('Right 1').fill('Italy');
      await field('Left 2').fill('Fuji');
      await field('Right 2').fill('Japan');
    });
    await addQuestion('Put in order', 'Put the stages of an eruption in order.', async () => {
      await field('Item 1').fill('Magma rises');
      await field('Item 2').fill('Pressure builds');
      await button('Add item').click();
      await field('Item 3').fill('Lava flows out');
    });
    await addQuestion('Sort into groups', 'Sort the volcanoes.', async () => {
      await field('Group 1').fill('Active');
      await field('Group 2').fill('Extinct');
      await field('Item 1').fill('Stromboli');
      await field('Item 2').fill('Kohala');
    });
    await shot('questions');
  });

  await step('add the other seven question types', async () => {
    await addQuestion('Single choice', 'What comes out of a volcano?', async () => {
      await field('Option 1').fill('Water');
      await field('Option 2').fill('Lava');
      await button('Mark option 2 as correct').click();
    });
    await addQuestion('Multiple choice', 'Which are volcanic rocks?', async () => {
      await field('Option 1').fill('Basalt');
      await field('Option 2').fill('Marble');
      await button('Add option').click();
      await field('Option 3').fill('Pumice');
      await button('Mark option 1 as correct').click();
      await button('Mark option 3 as correct').click();
    });
    await addQuestion('True or false', 'Every volcano is active.', async () => {
      await button('False').click();
    });
    await addQuestion('Short answer', 'What is molten rock below the surface called?', async () => {
      await field('Answer 1').fill('magma');
    });
    await addQuestion('Fill in the gaps', 'Complete the sentence about lava.', async () => {
      await field('Sentence with gaps').fill('Magma that reaches the surface is called {{1}}.');
      await field('Gap 1: Accepted answers, separated by commas').fill('lava');
    });
    await addQuestion('Essay', 'Explain why volcanoes form at plate boundaries.', async () => {
      await field('Model answer').fill('Plates pull apart or one sinks, letting magma rise.');
    });
    await addQuestion('Flashcard', 'Largest volcano on Earth', async () => {
      await field('Back').fill('Mauna Loa');
    });
    const rows = await page.getByRole('button', { name: /^Edit: \d+\. / }).locator('visible=true').count();
    if (rows !== 10) throw new Error(`expected 10 questions, saw ${rows}`);
  });

  await step('edit, reorder, remove and undo a question', async () => {
    await button('Edit: 4. What comes out of a volcano?').click();
    await seen('Edit question');
    await field('Question').fill('What flows out of a volcano?');
    await button('Save').click();
    await seen('4. What flows out of a volcano?');
    await button('Move up: 4. What flows out of a volcano?').click();
    await seen('3. What flows out of a volcano?');
    await button('Move down: 3. What flows out of a volcano?').click();
    await seen('4. What flows out of a volcano?');
    await button('Remove: 10. Largest volcano on Earth').click();
    await seen('Question removed');
    if (await page.getByText('10. Largest volcano on Earth').locator('visible=true').count()) throw new Error('row still shown after removing');
    await sheetItem('Undo').click();
    await seen('10. Largest volcano on Earth');
  });

  await step('add a final exam with a pass mark', async () => {
    await page.goBack();
    await seen('Save lesson');
    await page.goBack();
    await seen('1. What is a volcano?');
    await button('Add a final exam').click();
    await addQuestion('True or false', 'Lava is cooler than ice.', async () => {
      await button('False').click();
    });
    await button('More: Pass mark, percent').click();
    await seen('75');
    await button('Save settings').click();
    await seen('Saved');
  });

  await step('remove a lesson and undo', async () => {
    await page.goBack();
    await seen('Save details');
    await button('Remove: 1. What is a volcano?').click();
    await seen('"What is a volcano?" removed');
    await sheetItem('Undo').click();
    await seen('1. What is a volcano?');
  });

  await step('the built course reads as written', async () => {
    await home();
    await h.open('Volcanoes');
    await seen('How volcanoes form and erupt.');
    await seen('GEOLOGY');
    await seen('Pass mark 75%');
    await button('Start course').click();
    await seen('Lesson 1 of 1');
    await seen('Most volcanoes sit on plate boundaries.');
    await seen('opening');
    await shot('built-lesson');
  });

  await step('play matching by tapping', async () => {
    await button('Start').click();
    await seen('Question 1 of 10');
    if (!(await button('Check').isDisabled())) throw new Error('Check enabled before matching');
    await button('Japan').click();
    await button('Fuji: Nothing here yet').click();
    await button('Italy').click();
    await button('Etna: Nothing here yet').click();
    await shot('matching');
    await button('Check').click();
    await seen('Correct');
    await button('Next').click();
  });

  const orderShown = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('div[dir="auto"]')]
        .filter((node) => node.offsetParent !== null && /^\d\. (Magma rises|Pressure builds|Lava flows out)$/.test(node.textContent))
        .map((node) => node.textContent.slice(3)),
    );

  await step('play ordering: drag a row, then finish with the arrows', async () => {
    await seen('Question 2 of 10');
    const before = await orderShown();
    if (before.length !== 3) throw new Error(`expected 3 rows, saw ${before.join(' | ')}`);
    if (before.join() === 'Magma rises,Pressure builds,Lava flows out') throw new Error('rows were not shuffled');

    const first = page.getByText(`1. ${before[0]}`, { exact: true }).locator('visible=true').last();
    const last = page.getByText(`3. ${before[2]}`, { exact: true }).locator('visible=true').last();
    const from = await first.boundingBox();
    const to = await last.boundingBox();
    await page.mouse.move(from.x + 20, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 24, from.y + from.height / 2 + 20, { steps: 4 });
    await page.mouse.move(to.x + 24, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction((moved) => {
      const rows = [...document.querySelectorAll('div[dir="auto"]')].filter((node) => node.offsetParent !== null && /^3\. /.test(node.textContent));
      return rows.some((node) => node.textContent === `3. ${moved}`);
    }, before[0]);

    const target = ['Magma rises', 'Pressure builds', 'Lava flows out'];
    for (let position = 0; position < target.length; position += 1) {
      for (let guard = 0; guard < 4; guard += 1) {
        const current = await orderShown();
        if (current[position] === target[position]) break;
        await button(`Move up: ${target[position]}`).click();
      }
    }
    await shot('ordering');
    await button('Check').click();
    await seen('Correct');
    await button('Next').click();
  });

  await step('play sorting by tapping, with one mistake shown', async () => {
    await seen('Question 3 of 10');
    await button('Stromboli').click();
    await button('Group: Extinct').click();
    await button('Kohala').click();
    await button('Group: Extinct').click();
    await seen('Everything is sorted.');
    await button('Check').click();
    await seen('Partly correct');
    await seen('Belongs in Active');
    await shot('sorting');
    await page.goBack();
  });

  await step('edit a deck: add a card, remove one, undo', async () => {
    await home();
    await h.open('Everyday keyboard shortcuts');
    await top('More actions').click();
    await sheetItem('Edit').click();
    await seen('Add card');
    await button('Add card').click();
    await field('Front').fill('Print the page');
    await field('Back').fill('Ctrl + P');
    await button('Save').click();
    await seen('11. Print the page');
    await button('Remove: 1. Undo the last action').click();
    await seen('Card removed');
    await sheetItem('Undo').click();
    await seen('1. Undo the last action');
    await page.goBack();
    await seen('11 cards');
  });

  await h.finish();
})();
