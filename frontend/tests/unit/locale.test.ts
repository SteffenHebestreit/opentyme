/**
 * Dates and amounts follow the language chosen in OpenTyme, not the
 * browser's default locale (jsdom's default here is en-US).
 */
import i18next from 'i18next';
import { formatDate, formatDistanceToNow } from '../../src/utils/date';
import { formatCurrency } from '../../src/utils/currency';
import { getAppLocale } from '../../src/utils/locale';

beforeAll(async () => {
  await i18next.init({ lng: 'de', fallbackLng: 'en', resources: { de: {}, en: {} } });
});

it('reads the current UI language at call time', async () => {
  await i18next.changeLanguage('de');
  expect(getAppLocale()).toBe('de');
  await i18next.changeLanguage('en');
  expect(getAppLocale()).toBe('en');
});

it('formats dates, relative times and amounts in German when the UI is German', async () => {
  await i18next.changeLanguage('de');
  expect(formatDate('2026-11-13T12:00:00Z')).toBe('13. Nov. 2026');
  expect(formatDistanceToNow(new Date(Date.now() - 3 * 3600 * 1000))).toBe('vor 3 Stunden');
  expect(formatCurrency(1234.5, 'EUR')).toMatch(/^1\.234,50\s€$/);
});

it('switches with the UI language', async () => {
  await i18next.changeLanguage('en');
  expect(formatDate('2026-11-13T12:00:00Z')).toBe('Nov 13, 2026');
  expect(formatDistanceToNow(new Date(Date.now() - 3 * 3600 * 1000))).toBe('3 hours ago');
  expect(formatCurrency(1234.5, 'EUR')).toBe('€1,234.50');
});
