import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { SUPPORTED_LANGUAGES } from '@/i18n';
import { useStore } from '@/lib/store';

/**
 * Applies the persisted language preference (Me page, R3-B) once the local store
 * is ready. i18n initialises from the device locale; this overrides it with the
 * user's saved choice on every launch. Renders nothing.
 */
export function LanguageSync() {
  const { i18n } = useTranslation();
  const { ready, profile } = useStore();

  useEffect(() => {
    if (!ready) return;
    const lng = profile.language;
    if (lng && (SUPPORTED_LANGUAGES as readonly string[]).includes(lng) && i18n.language !== lng) {
      i18n.changeLanguage(lng);
    }
  }, [ready, profile.language, i18n]);

  return null;
}
