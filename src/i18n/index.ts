import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import tr from './tr.json';

export const languages = ['tr', 'en'] as const;
export type AppLanguage = (typeof languages)[number];

i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
  },
  lng: 'tr',
  fallbackLng: 'tr',
  keySeparator: false,
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
