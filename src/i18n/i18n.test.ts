import i18n, { resources } from './index';

type Tree = { [key: string]: string | Tree };

/** Flattens to "a.b.c" keys, folding plural forms into their base key. */
function leaves(tree: Tree, prefix = ''): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}${key.replace(/_(zero|one|two|few|many|other)$/, '')}`;
    if (typeof value === 'string') out.set(path, [...(out.get(path) ?? []), value]);
    else for (const [k, v] of leaves(value, `${path}.`)) out.set(k, v);
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

const english = leaves(resources.en.translation as unknown as Tree);

describe.each(Object.keys(resources).filter((code) => code !== 'en'))('%s strings', (code) => {
  const strings = leaves(resources[code as keyof typeof resources].translation as unknown as Tree);

  it('has every English key and nothing else', () => {
    expect([...strings.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('keeps every placeholder', () => {
    for (const [key, texts] of strings) {
      const expected = new Set(english.get(key)!.flatMap(placeholders));
      for (const text of texts) {
        for (const name of placeholders(text)) expect([key, expected.has(name)]).toEqual([key, true]);
      }
      // A text may drop {{count}} (a plural form can spell the number out), but no other value.
      const used = new Set(texts.flatMap(placeholders));
      for (const name of expected) if (name !== 'count') expect([key, name, used.has(name)]).toEqual([key, name, true]);
    }
  });

  it('is not left in English', () => {
    expect(strings.get('library.empty.title')).not.toEqual(english.get('library.empty.title'));
  });
});

describe('plural forms', () => {
  it('picks the Russian form for each number', async () => {
    const t = i18n.getFixedT('ru');
    expect(t('units.course', { count: 1 })).toBe('1 урок');
    expect(t('units.course', { count: 3 })).toBe('3 урока');
    expect(t('units.course', { count: 5 })).toBe('5 уроков');
    expect(t('units.course', { count: 21 })).toBe('21 урок');
  });

  it('keeps the Uzbek noun singular after a number', () => {
    const t = i18n.getFixedT('uz');
    expect(t('units.quiz', { count: 1 })).toBe('1 ta savol');
    expect(t('units.quiz', { count: 7 })).toBe('7 ta savol');
  });
});
