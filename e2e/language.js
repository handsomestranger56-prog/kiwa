// The app follows the phone's language until a language is chosen, then keeps the choice.
const { start } = require('./harness');

(async () => {
  const h = await start({ locale: 'ru-RU' });
  const { page, base, step, button, seen } = h;
  const shot = (name) => h.shot('language-' + name);
  const pressed = async (name) => (await button(name).getAttribute('aria-pressed')) === 'true';
  const tab = (name) => page.getByRole('tab', { name }).click();

  await step('a Russian phone opens in Russian', async () => {
    await page.goto(`${base}/`);
    await seen('Добро пожаловать');
    await seen('Учитесь короткими уроками');
    if (!(await pressed('Как на телефоне'))) throw new Error('"same as phone" is not selected');
    await shot('welcome-ru');
  });

  await step('choosing Uzbek on the welcome screen switches at once and is kept', async () => {
    await button('Oʻzbekcha').click();
    await seen('Xush kelibsiz');
    await seen('Qisqa darslarda oʻrganing');
    await button('Boshlash').click();
    await page.getByRole('tab', { name: 'Kutubxona' }).waitFor({ timeout: 20000 });
    await page.reload();
    await page.getByRole('tab', { name: 'Kutubxona' }).waitFor({ timeout: 20000 });
    await shot('library-uz');
  });

  await step('settings show the choice, and "same as phone" goes back to Russian', async () => {
    await tab('Sozlamalar');
    await seen('Til');
    if (!(await pressed('Oʻzbekcha'))) throw new Error('Uzbek is not shown as chosen');
    await button('Telefondagidek').click();
    await page.getByRole('tab', { name: 'Настройки' }).waitFor();
    await seen('Язык');
  });

  await step('English can be chosen on a Russian phone', async () => {
    await button('English').click();
    await page.getByRole('tab', { name: 'Settings' }).waitFor();
    await seen('Same as phone');
  });

  await step('the create form asks for content in the app language', async () => {
    await button('Русский').click();
    await tab('Библиотека');
    await button('Создать').filter({ visible: true }).first().click();
    await page.getByText('Создать с ИИ').filter({ visible: true }).first().click();
    const language = page.getByLabel('Язык материала', { exact: true }).filter({ visible: true });
    await language.waitFor();
    if ((await language.inputValue()) !== 'ru') throw new Error(`content language is ${await language.inputValue()}`);
    await shot('create-ru');
  });

  await h.finish();
})();
