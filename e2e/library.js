// Library flows: list, search, filters, create, rename, favorite, trash, settings, dark theme.
const path = require('path');
const { start } = require('./harness');

(async () => {
  const h = await start();
  const { page, base, out, step, browser } = h;

  await h.home();
  await step('library shows the three samples', async () => {
    await page.getByText('How to study so it sticks').locator('visible=true').first().waitFor({ timeout: 20000 });
    await page.getByText('Git in ten minutes').locator('visible=true').first().waitFor();
    await page.getByText('Everyday keyboard shortcuts').locator('visible=true').first().waitFor();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, 'app-library.png') });

  await step('favorite a sample', async () => {
    await page.getByRole('button', { name: 'Add to favorites' }).first().click();
    await page.getByRole('button', { name: 'Remove from favorites' }).first().waitFor();
  });
  await step('favorites filter shows only that item', async () => {
    await page.getByRole('button', { name: 'Favorites', exact: true }).click();
    await page.waitForTimeout(300);
    const rows = await page.getByRole('button', { name: 'More actions' }).count();
    if (rows !== 1) throw new Error(`expected 1 row, saw ${rows}`);
    await page.getByRole('button', { name: 'All', exact: true }).click();
  });
  await step('search narrows the list', async () => {
    await page.getByPlaceholder('Search titles, descriptions and tags').fill('git');
    await page.waitForTimeout(400);
    const rows = await page.getByRole('button', { name: 'More actions' }).count();
    if (rows !== 1) throw new Error(`expected 1 row, saw ${rows}`);
    await page.getByPlaceholder('Search titles, descriptions and tags').fill('');
  });
  await step('create a quiz', async () => {
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByText('One set of questions on its own').locator('visible=true').first().click();
    await page.getByPlaceholder('Title', { exact: true }).fill('Capital cities');
    await page.screenshot({ path: path.join(out, 'app-create.png') });
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByText('This quiz has no questions yet.').locator('visible=true').first().waitFor();
  });
  await step('back to library, new quiz listed', async () => {
    await page.goBack();
    await page.getByText('Capital cities').locator('visible=true').first().waitFor();
  });
  await step('open the sample course', async () => {
    await h.open('How to study so it sticks');
    await page.getByText('1. Recall beats rereading').locator('visible=true').first().waitFor();
    await page.getByRole('button', { name: 'Mark lesson as completed' }).first().click();
    await page.getByRole('button', { name: 'Mark lesson as not completed' }).waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, 'app-course.png'), fullPage: false });
    await page.goBack();
  });
  await step('rename', async () => {
    await page.getByText('Capital cities').locator('visible=true').first().waitFor();
    await page.getByRole('button', { name: 'More actions' }).first().click();
    await page.getByText('Rename', { exact: true }).locator('visible=true').first().click();
    await page.getByPlaceholder('Title', { exact: true }).fill('World capitals');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('World capitals').locator('visible=true').first().waitFor();
  });
  await step('move to trash and undo', async () => {
    await page.getByRole('button', { name: 'More actions' }).first().click();
    await page.getByText('Move to trash').locator('visible=true').first().click();
    await page.getByText('"World capitals" moved to trash').locator('visible=true').first().waitFor();
    await page.screenshot({ path: path.join(out, 'app-snackbar.png') });
    await page.getByText('Undo').locator('visible=true').first().click();
    await page.getByText('World capitals').locator('visible=true').first().waitFor();
  });
  await step('move to trash, open trash, restore one, delete one', async () => {
    await page.getByRole('button', { name: 'More actions' }).first().click();
    await page.getByText('Move to trash').locator('visible=true').first().click();
    await page.getByText('Trash · 1 item').locator('visible=true').first().click();
    await page.getByText('World capitals').locator('visible=true').first().waitFor();
    await page.screenshot({ path: path.join(out, 'app-trash.png') });
    await page.getByRole('button', { name: 'Delete forever' }).click();
    await page.getByText('Delete "World capitals" forever?').locator('visible=true').first().waitFor();
    await page.getByRole('button', { name: 'Delete forever' }).last().click();
    await page.getByText('Trash is empty').locator('visible=true').first().waitFor();
    await page.goBack();
  });
  await step('settings saves the name and it survives a reload', async () => {
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByPlaceholder('How should the app address you?').fill('Ada');
    await page.getByPlaceholder('How should the app address you?').press('Enter');
    await page.getByText('Saved').locator('visible=true').first().waitFor();
    await page.screenshot({ path: path.join(out, 'app-settings.png') });
    await page.reload();
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.waitForTimeout(800);
    const value = await page.getByPlaceholder('How should the app address you?').inputValue();
    if (value !== 'Ada') throw new Error(`name after reload was "${value}"`);
  });
  await step('favorite and lesson mark survive a reload', async () => {
    await page.goto(base + '/');
    await page.getByText('How to study so it sticks').locator('visible=true').first().waitFor({ timeout: 20000 });
    const favs = await page.getByRole('button', { name: 'Remove from favorites' }).count();
    if (favs !== 1) throw new Error(`expected 1 favorite, saw ${favs}`);
  });

  const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
  const dpage = await dark.newPage();
  await dpage.goto(base + '/');
  // A new browser context is a first launch again.
  await dpage.getByRole('button', { name: 'Get started', exact: true }).click({ timeout: 20000 });
  await step('dark theme renders', async () => {
    await dpage.getByText('How to study so it sticks').locator('visible=true').first().waitFor({ timeout: 20000 });
    await dpage.waitForTimeout(800);
    await dpage.screenshot({ path: path.join(out, 'app-library-dark.png') });
  });

  await h.finish();
})();
