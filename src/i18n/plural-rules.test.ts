import { appPluralCategory, installPluralRules, nativeRulesWork } from './plural-rules';

const numbers = [...Array.from({ length: 230 }, (_, i) => i), 1001, 1011, 1021, 1.5, 0.5, 2.25];

describe('appPluralCategory', () => {
  it.each(['en', 'ru', 'uz'])('matches the CLDR cardinal rules for %s', (language) => {
    // Node ships the full ICU data, so its answers are the reference.
    const reference = new Intl.PluralRules(language);
    for (const n of numbers) expect([n, appPluralCategory(language, n)]).toEqual([n, reference.select(n)]);
  });

  it.each(['en', 'ru', 'uz'])('matches the CLDR ordinal rules for %s', (language) => {
    const reference = new Intl.PluralRules(language, { type: 'ordinal' });
    for (const n of numbers.filter(Number.isInteger)) {
      expect([n, appPluralCategory(language, n, 'ordinal')]).toEqual([n, reference.select(n)]);
    }
  });

  it('reads the language from a regional code', () => {
    expect(appPluralCategory('ru-RU', 5)).toBe('many');
    expect(appPluralCategory('fr', 5)).toBeNull();
  });
});

describe('installPluralRules', () => {
  const original = Intl.PluralRules;
  afterEach(() => {
    (Intl as { PluralRules: unknown }).PluralRules = original;
  });

  it('leaves working built-in rules alone', () => {
    installPluralRules();
    expect(Intl.PluralRules).toBe(original);
  });

  it('replaces rules that do not know Russian, as on Hermes for Android', () => {
    (Intl as { PluralRules: unknown }).PluralRules = class {
      constructor(locale: string) {
        if (locale === 'ru') throw new RangeError('Incorrect locale information provided');
      }
      select() {
        return 'other';
      }
      resolvedOptions() {
        return { pluralCategories: ['one', 'other'] };
      }
    };
    expect(nativeRulesWork()).toBe(false);
    installPluralRules();
    const ru = new Intl.PluralRules('ru');
    expect([1, 3, 5, 11, 21, 22, 25].map((n) => ru.select(n))).toEqual(['one', 'few', 'many', 'many', 'one', 'few', 'many']);
    expect(ru.resolvedOptions().pluralCategories).toEqual(['one', 'few', 'many', 'other']);
    expect(nativeRulesWork()).toBe(true);
  });
});
