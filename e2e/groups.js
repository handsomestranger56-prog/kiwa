// Sort items into groups, filter the library by group, export a group and import it back.
const { start } = require('./harness');

(async () => {
  const h = await start();
  const { page, step, button, top, seen, home, download, chooseFile } = h;
  const shot = (name) => h.shot('groups-' + name);
  const visibleText = (text) => page.getByText(text, { exact: true }).filter({ visible: true });
  const sheetItem = (text) => visibleText(text).last();
  const back = () => page.getByRole('link', { name: /back$/i }).filter({ visible: true }).first().click();

  const moveTo = async (title, group, isNew) => {
    await h.open(title);
    await top('More actions').click();
    await sheetItem('Move to group').click();
    if (isNew) {
      await sheetItem('New group').click();
      await page.getByPlaceholder('Group name').filter({ visible: true }).fill(group);
      await button('Create').click();
    } else {
      await sheetItem(group).click();
    }
    await seen(`Moved to ${group}`);
  };

  let groupExport;

  await step('an item moves into a new group from its menu', async () => {
    await home();
    await moveTo('Git in ten minutes', 'Dev tools', true);
  });

  await step('a second item joins the same group', async () => {
    await home();
    await moveTo('Everyday keyboard shortcuts', 'Dev tools', false);
  });

  await step('the library filters by group', async () => {
    await home();
    await button('Dev tools').click();
    await page.waitForURL(/group=/);
    await visibleText('Git in ten minutes').first().waitFor();
    if (await visibleText('How to study so it sticks').count()) throw new Error('an ungrouped item is shown in the group');
    await shot('filtered');
    await button('No group').click();
    await visibleText('How to study so it sticks').first().waitFor();
    if (await visibleText('Git in ten minutes').count()) throw new Error('a grouped item is shown under No group');
    await button('All groups').click();
    await visibleText('Git in ten minutes').first().waitFor();
  });

  await step('an exported item names its group', async () => {
    await h.open('Git in ten minutes');
    await top('More actions').click();
    const file = await download(() => sheetItem('Export').click());
    if (JSON.parse(file.text).group !== 'Dev tools') throw new Error('group missing from the item file');
  });

  await step('the groups screen exports a whole group', async () => {
    await home();
    await button('Manage groups').click();
    await seen('2 items');
    await shot('manage');
    await button('Actions for Dev tools').click();
    groupExport = await download(() => sheetItem('Export group').click());
    const file = JSON.parse(groupExport.text);
    if (file.format !== 'group/1' || file.name !== 'Dev tools' || file.items.length !== 2) throw new Error(`unexpected group file: ${groupExport.text.slice(0, 120)}`);
    if (groupExport.name !== 'dev-tools.group.json') throw new Error(`file named ${groupExport.name}`);
  });

  await step('deleting a group keeps its items', async () => {
    await button('Actions for Dev tools').click();
    await sheetItem('Delete group').click();
    await button('Delete group').click();
    await seen('No groups yet');
    await home();
    await visibleText('Git in ten minutes').first().waitFor();
    if (await button('All groups').count()) throw new Error('group chips shown with no groups');
  });

  await step('importing a group file brings the group back, keeping both copies', async () => {
    await home();
    await button('New').click();
    await sheetItem('Import').click();
    await chooseFile(groupExport.path);
    await seen('Dev tools');
    await seen('2 of these are already in your library');
    await shot('import');
    await button('Keep both').click();
    await button('Add 2 items').click();
    await page.waitForURL(/group=/);
    await visibleText('Git in ten minutes (copy)').first().waitFor();
    // The library is filtered to the imported group: ungrouped items are not listed.
    await h.gone('How to study so it sticks');
    if ((await button('Dev tools').getAttribute('aria-pressed')) !== 'true') throw new Error('the group chip is not selected');
    await back().catch(() => {});
  });

  await h.finish();
})();
