import 'i18next';

import type en from './locales/en.json';

// Type-safe translation keys: t('home.title') is checked against en.json.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
