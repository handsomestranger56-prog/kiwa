/**
 * Plural rules for the app's languages, so "5 вопросов" is right on every phone.
 *
 * i18next picks a plural form with Intl.PluralRules. Hermes on Android does not know Russian, so
 * i18next fell back to "1 is one, everything else is other" and showed "5 вопроса". When the
 * built-in rules are missing or wrong, this module puts a small replacement in their place that
 * knows the three app languages (CLDR cardinal and ordinal rules) and hands any other language to
 * the built-in one, if there is one.
 */

type Category = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type Type = 'cardinal' | 'ordinal';

/** Digits after the decimal point, as written ("1.50" has two). CLDR calls this v. */
function fractionDigits(n: number): number {
  const text = String(n);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

const RULES: Record<string, Record<Type, (n: number) => Category>> = {
  en: {
    cardinal: (n) => (n === 1 && fractionDigits(n) === 0 ? 'one' : 'other'),
    ordinal: (n) => {
      const mod10 = n % 10;
      const mod100 = n % 100;
      if (mod10 === 1 && mod100 !== 11) return 'one';
      if (mod10 === 2 && mod100 !== 12) return 'two';
      if (mod10 === 3 && mod100 !== 13) return 'few';
      return 'other';
    },
  },
  ru: {
    cardinal: (n) => {
      if (fractionDigits(n) !== 0) return 'other';
      const i = Math.trunc(Math.abs(n));
      const mod10 = i % 10;
      const mod100 = i % 100;
      if (mod10 === 1 && mod100 !== 11) return 'one';
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
      return 'many';
    },
    ordinal: () => 'other',
  },
  uz: {
    cardinal: (n) => (n === 1 ? 'one' : 'other'),
    ordinal: () => 'other',
  },
};

const CATEGORIES: Record<string, Record<Type, Category[]>> = {
  en: { cardinal: ['one', 'other'], ordinal: ['one', 'two', 'few', 'other'] },
  ru: { cardinal: ['one', 'few', 'many', 'other'], ordinal: ['other'] },
  uz: { cardinal: ['one', 'other'], ordinal: ['other'] },
};

/** The plural category of a number in one of the app's languages, or null for any other language. */
export function appPluralCategory(language: string, n: number, type: Type = 'cardinal'): Category | null {
  const rules = RULES[language.split(/[-_]/)[0].toLowerCase()];
  return rules ? rules[type](n) : null;
}

/** True when the built-in rules give the right answers for the app's languages. */
export function nativeRulesWork(): boolean {
  try {
    const ru = new Intl.PluralRules('ru');
    const en = new Intl.PluralRules('en');
    return ru.select(5) === 'many' && ru.select(22) === 'few' && ru.select(21) === 'one' && en.select(1) === 'one';
  } catch {
    return false;
  }
}

function replacement(Native: typeof Intl.PluralRules | undefined) {
  return class PluralRules {
    private readonly language: string;
    private readonly type: Type;
    private readonly native: Intl.PluralRules | null;

    constructor(locales?: string | string[], options?: { type?: Type }) {
      const first = (Array.isArray(locales) ? locales[0] : locales) ?? 'en';
      this.language = first.split(/[-_]/)[0].toLowerCase();
      this.type = options?.type ?? 'cardinal';
      let native: Intl.PluralRules | null = null;
      if (!RULES[this.language] && Native) {
        try {
          native = new Native(locales, options);
        } catch {
          native = null;
        }
      }
      this.native = native;
    }

    select(n: number): Category {
      if (this.native) return this.native.select(n) as Category;
      return appPluralCategory(this.language, n, this.type) ?? (n === 1 ? 'one' : 'other');
    }

    resolvedOptions() {
      if (this.native) return this.native.resolvedOptions();
      const categories = CATEGORIES[this.language]?.[this.type] ?? ['one', 'other'];
      return { locale: this.language, type: this.type, pluralCategories: categories };
    }

    static supportedLocalesOf(locales: string | string[]): string[] {
      return (Array.isArray(locales) ? locales : [locales]).filter((code) => RULES[code.split(/[-_]/)[0].toLowerCase()]);
    }
  };
}

/** Puts the replacement in place if the built-in rules cannot be trusted. Safe to call more than once. */
export function installPluralRules(): void {
  if (typeof Intl !== 'undefined' && nativeRulesWork()) return;
  const holder = globalThis as unknown as { Intl?: Record<string, unknown> };
  holder.Intl ??= {};
  const native = holder.Intl.PluralRules as typeof Intl.PluralRules | undefined;
  holder.Intl.PluralRules = replacement(native);
}
