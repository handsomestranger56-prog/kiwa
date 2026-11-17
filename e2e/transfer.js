// Create, import, export and backup flows.
const fs = require('fs');
const path = require('path');
const { start } = require('./harness');

const reply = [
  "Here's a short quiz on the water cycle!",
  '',
  '```json',
  JSON.stringify({
    title: 'The water cycle',
    language: 'en',
    assessment: {
      mode: 'practice',
      questions: [
        { type: 'single-choice', prompt: 'What is water vapour turning into liquid called?', options: ['Evaporation', 'Condensation', 'Precipitation'], answer: 'Condensation', explanation: 'Vapour cools and condenses.' },
        { id: 'q1', type: 'true_false', prompt: 'Evaporation needs heat.', answer: 'true' },
        { id: 'q1', type: 'short_answer', prompt: 'Rain, snow and hail are forms of what?', accepted: ['precipitation'] },
      ],
    },
  }, null, 2),
  '```',
  '',
  'Want more questions?',
].join('\n');

const broken = JSON.stringify({ format: 'deck/1', id: 'bad-deck', title: 'Broken deck', cards: [{ id: 'a', type: 'flashcard', prompt: 'Front', back: '' }, { id: 'b', type: 'flashcard', prompt: '', back: 'Back' }] });

(async () => {
  const h = await start({ permissions: ['clipboard-read', 'clipboard-write'] });
  const { page, out, step, button, top, seen, clipboard, download, chooseFile, home } = h;
  const shot = (name) => h.shot('transfer-' + name);
  const pasteBox = () => page.getByPlaceholder('Or paste the text here').last();

  await home();

  await step('create: the form builds a quiz prompt', async () => {
    await button('New').click();
    await page.getByText('Create with AI').last().click();
    await seen('What to create');
    if (!(await button('Prompt for AI').isDisabled())) throw new Error('prompt button enabled without a topic');
    await button('Quiz').click();
    await page.getByLabel('Topic').last().fill('The water cycle');
    await button('More: Questions').click();
    await seen('How the quiz works');
    await shot('create');
    await button('Prompt for AI').click();
    await seen('Your prompt is ready');
    await seen('the-water-cycle.prompt.md');
    await shot('prompt');
  });

  await step('prompt: copy puts the full prompt on the clipboard', async () => {
    await button('Copy prompt').click();
    await seen('Copied to the clipboard.');
    const text = await clipboard();
    for (const part of ['Write a quiz of 4 questions about:', 'The water cycle', 'Set `format` to "quiz/1".', '"$schema"', 'Reply with the JSON object only.']) {
      if (!text.includes(part)) throw new Error(`prompt is missing: ${part}`);
    }
  });

  await step('prompt: share saves it as a markdown file', async () => {
    const file = await download(() => button('Share as file').click());
    if (file.name !== 'the-water-cycle.prompt.md') throw new Error(`file name was ${file.name}`);
    if (!file.text.startsWith('# Task')) throw new Error('file does not start with the task');
  });

  await step('import: a chatbot reply is repaired, previewed and added', async () => {
    await button('Import the reply').click();
    await seen('Bring in a course');
    await pasteBox().fill(reply);
    await button('Check').click();
    await seen('The water cycle');
    await seen('3 questions');
    await seen('Corrected automatically');
    await seen('Recognised the file as quiz/1.');
    await seen('Added 3 missing ids.');
    await seen('Renamed 1 repeated id.');
    await seen('Converted 2 answers written as text.');
    await shot('import-preview');
    await button('Add to library').click();
    await seen('Start');
  });

  await step('imported quiz can be played', async () => {
    await button('Start').click();
    await page.getByRole('radio', { name: 'Condensation' }).click();
    await button('Check').click();
    await seen('Correct');
    await page.goBack();
    await page.goBack();
  });

  await step('import: the same item again offers replace or keep both', async () => {
    await home();
    await button('New').click();
    await page.getByText('A file or a pasted chatbot reply').click();
    await pasteBox().fill(reply);
    await button('Check').click();
    await seen('You already have this item');
    await seen('Your marks and results stay.');
    await button('Keep both').click();
    await seen('added as a separate item');
    await button('Add to library').click();
    await seen('The water cycle (copy)');
  });

  await step('import: problems are listed with a fix prompt', async () => {
    await home();
    await button('New').click();
    await page.getByText('A file or a pasted chatbot reply').click();
    await pasteBox().fill(broken);
    await button('Check').click();
    await seen('This cannot be imported yet');
    await seen('cards[0].back');
    await seen('cards[1].prompt');
    await shot('import-problems');
    await button('Copy fix prompt').click();
    await seen('Copied');
    const text = await clipboard();
    if (!text.includes('`cards[0].back`') || !text.includes('Send one JSON object and nothing else.')) throw new Error('fix prompt incomplete');
  });

  await step('import: a cut-off reply and plain prose are explained', async () => {
    await pasteBox().fill('{"format": "course/1", "title": "Cut", "lessons": [{"id": "a"');
    await button('Check').click();
    await seen('it was cut off');
    await pasteBox().fill('Sorry, I cannot help with that.');
    await button('Check').click();
    await seen('No course data was found');
  });

  await step('import: paste from clipboard', async () => {
    await page.evaluate((value) => navigator.clipboard.writeText(value), JSON.stringify({ title: 'Clipboard deck', cards: [{ front: 'Hola', back: 'Hello' }] }));
    await button('Paste from clipboard').click();
    await seen('Clipboard deck');
    await seen('1 card');
    await button('Add to library').click();
    await seen('1. Hola');
  });

  let exported;
  await step('export: a quiz is saved as a file that holds content only', async () => {
    await home();
    await page.getByText('Git in ten minutes').click();
    await top('Add to favorites').click();
    await top('More actions').click();
    exported = await download(() => page.getByText('Export', { exact: true }).locator('visible=true').last().click());
    if (exported.name !== 'git-in-ten-minutes.quiz.json') throw new Error(`file name was ${exported.name}`);
    const data = JSON.parse(exported.text);
    if (data.format !== 'quiz/1' || data.assessment.questions.length !== 5) throw new Error('unexpected file content');
    if (/favorite|completed|attempt/i.test(exported.text)) throw new Error('personal state leaked into the export');
    await seen('Saved as git-in-ten-minutes.quiz.json.');
  });

  await step('import: choosing the exported file replaces and keeps the favorite', async () => {
    const changed = exported.text.replace('Git in ten minutes', 'Git in eleven minutes');
    const file = path.join(out, 'changed.quiz.json');
    fs.writeFileSync(file, changed);
    await home();
    await button('New').click();
    await page.getByText('A file or a pasted chatbot reply').click();
    await chooseFile(file);
    await seen('From changed.quiz.json');
    await seen('You already have this item');
    await button('Replace').click();
    await seen('Git in eleven minutes');
    await button('Remove from favorites').waitFor();
  });

  let lessonExport;
  await step('lesson: flashcards from a lesson prefills the form with its text', async () => {
    await home();
    await page.getByText('How to study so it sticks').click();
    await page.getByText('1. Recall beats rereading').click();
    await button('Lesson actions').click();
    await page.getByText('Make flashcards from this lesson').click();
    await seen('What to create');
    const topic = await page.getByLabel('Topic').last().inputValue();
    const source = await page.getByLabel('Your own material (optional)').last().inputValue();
    if (topic !== 'Recall beats rereading') throw new Error(`topic was "${topic}"`);
    if (!source.includes('retrieval practice')) throw new Error('lesson text not used as material');
    await seen('Cards');
    await button('Prompt for AI').click();
    await button('Copy prompt').click();
    const text = await clipboard();
    if (!text.includes('<<<SOURCE') || !text.includes('Set `format` to "deck/1".')) throw new Error('deck prompt incomplete');
    await page.goBack();
  });

  await step('lesson: export, then import it into the course as a fourth lesson', async () => {
    await seen('Lesson 1 of 3');
    await button('Lesson actions').click();
    lessonExport = await download(() => page.getByText('Export lesson').last().click());
    if (lessonExport.name !== 'recall-beats-rereading.lesson.json') throw new Error(`file name was ${lessonExport.name}`);
    await home();
    await button('New').click();
    await page.getByText('A file or a pasted chatbot reply').click();
    await chooseFile(lessonExport.path);
    await seen('Add to which course?');
    await button('Add lesson').click();
    await seen('4. Recall beats rereading');
    await seen('4 lessons');
  });

  await step('course: add a lesson with AI names the course in the prompt', async () => {
    await button('Add a lesson with AI').click();
    await seen('Add to course');
    await page.getByLabel('Topic').last().fill('Sleep and memory');
    await button('Prompt for AI').click();
    await button('Copy prompt').click();
    const text = await clipboard();
    for (const part of ['Write one lesson about:', 'Set `courseId` to "sample-learning".', '2. Space it out']) {
      if (!text.includes(part)) throw new Error(`lesson prompt is missing: ${part}`);
    }
  });

  let backup;
  await step('backup: everything is saved to one file', async () => {
    await home();
    await page.getByRole('tab', { name: 'Settings' }).click();
    backup = await download(() => page.getByText('Back up everything').last().click());
    const data = JSON.parse(backup.text);
    if (data.format !== 'backup/1') throw new Error('not a backup');
    const titles = data.items.map((item) => item.document.title);
    for (const title of ['Git in eleven minutes', 'The water cycle', 'The water cycle (copy)', 'Clipboard deck']) {
      if (!titles.includes(title)) throw new Error(`backup is missing ${title}`);
    }
    const git = data.items.find((item) => item.document.id === 'sample-git');
    if (!git.marks.some((mark) => mark.kind === 'favorite')) throw new Error('favorite not in backup');
    await seen('Saved as anki-backup-');
  });

  await step('restore: a change made after the backup is undone', async () => {
    await page.getByRole('tab', { name: 'Library' }).click();
    await page.getByText('Git in eleven minutes').click();
    await top('Remove from favorites').click();
    await top('More actions').click();
    await page.getByText('Move to trash').locator('visible=true').last().click();
    await page.getByText('Clipboard deck').waitFor();
    if (await page.getByText('Git in eleven minutes').count()) throw new Error('quiz still listed after removing');

    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByText('Import or restore').last().click();
    await chooseFile(backup.path);
    await seen('Backup');
    await shot('restore');
    await button('Restore').click();
    await seen('Restore this backup?');
    await button('Restore').click();
    await seen('Restored ');
    await home();
    await page.getByText('Git in eleven minutes').click();
    await button('Remove from favorites').waitFor();
  });

  await h.finish();
})();
