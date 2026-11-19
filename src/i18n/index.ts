import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './en';
import { ru } from './ru';
import { uz } from './uz';

export const resources = {
  en: { translation: en },
  ru: { translation: ru },
  uz: { translation: uz },
} as const;

export type AppLanguage = keyof typeof resources;

/** Offered in Settings. Each name is written in its own language, so anyone can find theirs. */
export const LANGUAGES: { code: AppLanguage; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'uz', name: 'Oʻzbekcha' },
  { code: 'ru', name: 'Русский' },
];

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: (typeof resources)['en'];
  }
}

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return !!value && Object.hasOwn(resources, value);
}

/** The phone's first language the app has, or English. Uzbek in Cyrillic falls back to the Latin strings. */
export function deviceLanguage(): AppLanguage {
  try {
    for (const locale of getLocales()) {
      if (isAppLanguage(locale.languageCode)) return locale.languageCode;
    }
  } catch {
    // Fall through to English.
  }
  return 'en';
}

/** Switches the app to a stored choice, or back to the phone's language when there is none. */
export function applyLanguage(choice: string | null): void {
  const next = isAppLanguage(choice) ? choice : deviceLanguage();
  // eslint-disable-next-line import/no-named-as-default-member
  if (i18n.language !== next) void i18n.changeLanguage(next);
}

// Module scope so translations are ready before the first screen renders.
// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
