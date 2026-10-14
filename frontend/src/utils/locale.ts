import i18next from 'i18next';

/**
 * The locale to format dates and numbers in: the language the user chose in
 * OpenTyme, not the browser's default — so a German UI shows "13.11.2026" and
 * "1.234,50" even in an English browser. Read at call time, because the
 * language can change while the app runs. Undefined (browser default) until
 * i18n has started, e.g. in unit tests.
 */
export function getAppLocale(): string | undefined {
  return i18next.resolvedLanguage || i18next.language || undefined;
}
