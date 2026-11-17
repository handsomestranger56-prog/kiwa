// Generate with a model, resume after the app closes, recover from a bad reply, Check and Explain deeper.
const { start } = require('./harness');
const { mockAi, MOCK_OPENAI_URL } = require('./mock-ai');

let lessonCounter = 0;
const lesson = (title) => {
  lessonCounter += 1;
  const n = lessonCounter;
  return {
    format: 'lesson/1',
    lesson: {
      id: 'lesson',
      title,
      summary: 'Generated for the check.',
      minutes: 3,
      blocks: [{ type: 'text', markdown: `Lesson text number ${n}.` }],
      assessments: [
        {
          id: 'practice',
          mode: 'practice',
          questions: [{ id: 'q1', type: 'true_false', prompt: `Statement ${n} is true.`, answer: true, explanation: 'It is.' }],
        },
      ],
    },
  };
};

const quiz = (title) => ({
  format: 'quiz/1',
  id: 'volcano-quiz',
  title,
  language: 'en',
  assessment: {
    id: 'main',
    mode: 'practice',
    questions: [
      { id: 'q1', type: 'single_choice', prompt: 'What comes out of a volcano?', options: ['Lava', 'Milk'], answer: 0, explanation: 'Molten rock.' },
      { id: 'q2', type: 'true_false', prompt: 'Etna is in Italy.', answer: true, explanation: 'It is in Sicily.' },
    ],
  },
});

const deck = {
  format: 'deck/1',
  id: 'capitals',
  title: 'Capitals deck',
  language: 'en',
  cards: [
    { id: 'c1', type: 'flashcard', prompt: 'France', back: 'Paris' },
    { id: 'c2', type: 'flashcard', prompt: 'Peru', back: 'Lima' },
  ],
};

/** Answers each kind of request the way a well-behaved model would. */
function goodModel({ prompt }) {
  if (prompt.includes('Plan a course of')) {
    return JSON.stringify({
      title: 'Volcanoes 101',
      description: 'From magma to eruption.',
      lessons: [{ title: 'What is magma?', summary: 'Molten rock.' }, { title: 'Plates' }, { title: 'Eruptions' }],
    });
  }
  if (prompt.includes('Set `format` to "lesson/1".')) {
    const title = prompt.match(/Write one lesson about:\n\n([^\n]+)/)?.[1] ?? 'Lesson';
    return JSON.stringify(lesson(title));
  }
  if (prompt.includes('Final exam for the course')) return JSON.stringify(quiz('Exam'));
  if (prompt.includes('Set `format` to "quiz/1".')) return `Here it is!\n\`\`\`json\n${JSON.stringify(quiz('Volcano facts quiz'))}\n\`\`\``;
  if (prompt.includes('Set `format` to "deck/1".')) return JSON.stringify(deck);
  if (prompt.includes('# Grade this answer')) {
    return JSON.stringify({ score: 1, verdict: 'Covers both spacing and mixing.', strengths: ['Mentions returning after a gap'], missing: [], suggestion: 'Add an example.' });
  }
  if (prompt.includes('# Explain this question in more depth')) {
    return 'Interleaving trains you to **choose a method**. For example, mixed maths problems.';
  }
  throw new Error('unexpected prompt');
}

(async () => {
  const h = await start();
  const { page, step, button, top, seen, home } = h;
  const shot = (name) => h.shot('generate-' + name);
  const field = (label) => page.getByLabel(label, { exact: true }).locator('visible=true').last();
  const sheetItem = (text) => page.getByText(text, { exact: true }).locator('visible=true').last();
  const ai = await mockAi(page, { reply: goodModel });

  const openCreate = async () => {
    await home();
    await button('New').click();
    await sheetItem('Create with AI').click();
    await seen('What to create');
  };

  await step('without a provider, Generate explains what to add', async () => {
    await openCreate();
    await seen('Add an AI provider to generate here');
    await field('Topic').fill('Volcanoes');
    if (!(await button('Generate').isDisabled())) throw new Error('Generate enabled without a provider');
  });

  await step('add two providers', async () => {
    await home();
    await page.getByRole('tab', { name: 'Settings' }).click();
    await button('Add provider').click();
    await field('API key').fill('sk-ant-good');
    await button('Test and detect models').click();
    await seen('Connected. Found 2 models.');
    await button('Save').click();
    await seen('Claude · 1 model on');
    await button('Add provider').click();
    await button('OpenAI-compatible').click();
    await field('Address').fill(MOCK_OPENAI_URL);
    await field('Name').fill('My server');
    await button('Test and detect models').click();
    await seen('Connected. Found 2 models.');
    await button('Save').click();
    await seen('OpenAI-compatible · 1 model on');
  });

  await step('generate a quiz with the default model and add it', async () => {
    await openCreate();
    await button('Quiz').click();
    await field('Topic').fill('Volcano facts');
    await shot('form');
    await button('Generate').click();
    await seen('Ready to review');
    await seen('Volcano facts quiz');
    await seen('2 questions');
    await seen('Used 2,000 tokens (1,200 in, 800 out)');
    await shot('ready');
    const call = ai.log.find((entry) => entry.method === 'POST');
    if (call.kind !== 'claude' || call.body.model !== 'claude-opus-5-5') throw new Error(`wrong model: ${call.kind} ${call.body.model}`);
    if (!call.body.output_config?.format?.schema) throw new Error('no structured output requested');
    await button('Add to library').click();
    await page.getByRole('heading', { name: 'Volcano facts quiz' }).waitFor();
    await button('Start').click();
    await seen('What comes out of a volcano?');
  });

  await step('generate flashcards with another model picked in the form', async () => {
    await openCreate();
    await button('Flashcards').click();
    await field('Topic').fill('Capitals');
    await button('llama4 · My server').click();
    const before = ai.log.length;
    await button('Generate').click();
    await seen('Ready to review');
    await seen('2 cards');
    const call = ai.log.slice(before).find((entry) => entry.method === 'POST');
    if (call.kind !== 'openai' || call.body.model !== 'llama4') {
      // The picker lists ticked models only; the server's first model was ticked on save.
      throw new Error(`wrong model: ${call?.kind} ${call?.body?.model}`);
    }
  });

  await step('a bad reply is repaired once, then stops with a retry', async () => {
    ai.reply = () => 'I cannot do that right now.';
    await openCreate();
    await button('Quiz').click();
    await field('Topic').fill('Broken');
    await button('Generate').click();
    await seen('This stopped');
    await seen('Finished steps are kept.');
    const posts = ai.log.filter((entry) => entry.method === 'POST' && entry.body?.messages?.some?.((message) => String(message.content).includes('Broken')));
    if (posts.length !== 2) throw new Error(`expected 2 requests, saw ${posts.length}`);
    if (!String(posts[1].body.messages[0].content).includes('## Your previous reply')) throw new Error('repair request missing');
    ai.reply = goodModel;
    await button('Try again').click();
    await seen('Ready to review');
  });

  await step('a course starts with an outline the user can edit', async () => {
    await openCreate();
    await field('Topic').fill('Volcanoes');
    await button('Fewer: Lessons').click();
    await button('Fewer: Lessons').click();
    await button('Generate').click();
    await seen('Here is the plan.');
    await field('Lesson 2').fill('Tectonic plates');
    await button('Remove: Lesson 3').click();
    await shot('outline');
    await seen('Write 2 lessons');
  });

  await step('the run survives the app closing halfway', async () => {
    ai.delay = 1500;
    await button('Write 2 lessons').click();
    await seen('Writing lessons: 0 of 2 done');
    await page.reload();
    // Requests in flight are lost with the page. The run resumes on its own when the app opens.
    await page.getByText('Ready to review').first().waitFor({ timeout: 20000 });
    ai.delay = 0;
    await seen('Volcanoes 101');
    await seen('1. What is magma?');
    await seen('2. Tectonic plates');
    await button('Add to library').click();
    await seen('Final exam');
    await seen('2 lessons');
    const lessonPrompts = ai.log.filter((entry) => entry.method === 'POST' && JSON.stringify(entry.body).includes('Write one lesson about'));
    if (!lessonPrompts.some((entry) => JSON.stringify(entry.body).includes('Tectonic plates'))) throw new Error('edited title not used');
  });

  await step('Check with AI regrades an essay after a test and the result follows', async () => {
    await home();
    await h.open('How to study so it sticks');
    await page.getByText('3. Mix your topics').click();
    await seen('Lesson 3 of 3');
    await top('Start').click();
    await page.getByRole('radio', { name: 'Speed', exact: true }).click();
    await button('Next').click();
    await page.getByPlaceholder('Write your answer').last().fill('Come back after a gap and mix topics.');
    await button('Compare with model answer').click();
    await button('Missed it').click();
    await button('Submit').click();
    await seen('0%');
    await seen('Not passed');
    await button('Check with AI').click();
    await seen('AI score: 100%');
    await seen('Covers both spacing and mixing.');
    await seen('50%');
    await seen('Passed');
    await shot('checked');
  });

  await step('Explain deeper adds a longer explanation with its cost', async () => {
    await top('Explain deeper').click();
    await seen('Explanation from Claude Opus 5.5');
    await seen('choose a method');
    const explain = ai.log.filter((entry) => entry.method === 'POST').pop();
    const sent = JSON.stringify(explain.body);
    if (!sent.includes('Speed') || !sent.includes('misunderstanding')) throw new Error('explanation not aimed at the mistake');
  });

  await step('AI feedback is kept with the attempt', async () => {
    await page.reload();
    await seen('AI score: 100%');
    await seen('choose a method');
  });

  await h.finish();
})();
