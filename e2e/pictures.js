// SVG pictures in lessons: imported from a chatbot reply, cleaned, shown, and edited.
const { start } = require('./harness');

const course = {
  format: 'course/1',
  id: 'picture-course',
  title: 'Pictures course',
  language: 'en',
  lessons: [
    {
      id: 'water-cycle',
      title: 'The water cycle',
      blocks: [
        { type: 'text', markdown: 'Water moves between sea, sky and land.' },
        {
          type: 'svg',
          svg: "<svg viewBox='0 0 200 100' onload='alert(1)'><script>alert(2)</script><circle cx='50' cy='50' r='20' fill='teal'><animate attributeName='cx' from='30' to='170' dur='2s' repeatCount='indefinite'/></circle></svg>",
          alt: 'A drop moving from left to right',
          caption: 'Evaporation, animated',
        },
      ],
      assessments: [],
    },
  ],
};

(async () => {
  const h = await start();
  const { page, step, button, top, seen, home } = h;
  const shot = (name) => h.shot('pictures-' + name);
  const sheetItem = (text) => page.getByText(text, { exact: true }).filter({ visible: true }).last();

  await step('a course with an SVG picture imports and the picture is cleaned', async () => {
    await home();
    await button('New').click();
    await sheetItem('Import').click();
    await page.getByLabel('Or paste the text here', { exact: true }).filter({ visible: true }).fill(JSON.stringify(course));
    await button('Check').click();
    await seen('Pictures course');
    await button('Add to library').click();
    await page.getByRole('heading', { name: 'Pictures course' }).waitFor();
  });

  await step('the lesson shows the picture as an image, with its caption and description', async () => {
    await button('Start course').click();
    await seen('Evaporation, animated');
    const picture = page.getByRole('img', { name: 'A drop moving from left to right' }).filter({ visible: true }).first();
    await picture.waitFor();
    const source = await page.locator('img[src^="data:image/svg+xml"]').first().getAttribute('src');
    const svg = decodeURIComponent(source.split(',')[1]);
    if (!svg.includes('<animate')) throw new Error('animation was removed');
    if (svg.includes('script') || svg.includes('onload')) throw new Error(`picture not cleaned: ${svg}`);
    const box = await page.locator('img[src^="data:image/svg+xml"]').first().boundingBox();
    if (!box || box.height < 50 || Math.abs(box.width / box.height - 2) > 0.2) throw new Error(`picture has the wrong shape: ${JSON.stringify(box)}`);
    await shot('lesson');
  });

  await step('the lesson editor previews pasted SVG and explains code that is not SVG', async () => {
    await page.goBack();
    await page.getByRole('heading', { name: 'Pictures course' }).waitFor();
    await top('More actions').click();
    await sheetItem('Edit').click();
    await page.getByRole('button', { name: /^Edit: (1\. )?The water cycle$/ }).filter({ visible: true }).first().click();
    await seen('Picture (SVG) 2');
    const code = page.getByLabel('Picture (SVG) 2: SVG code, from <svg> to </svg>', { exact: true }).filter({ visible: true });
    await code.fill('<div>oops</div>');
    await seen('This is not SVG code yet.');
    await code.fill("<svg viewBox='0 0 100 100'><rect width='100' height='100' fill='orange'/></svg>");
    await page.locator('img[src^="data:image/svg+xml"]').filter({ visible: true }).first().waitFor();
    await shot('editor');
  });

  await h.finish();
})();
