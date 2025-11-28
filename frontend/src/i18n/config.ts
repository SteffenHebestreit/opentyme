/**
 * @fileoverview i18n configuration for multi-language support.
 * 
 * Configures i18next with:
 * - Language detection from localStorage/browser
 * - German (de) and English (en) translations
 * - Automatic language persistence
 * - Fallback language: English
 * 
 * @module i18n/config
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import commonEN from './locales/en/common.json';
import commonDE from './locales/de/common.json';
import authEN from './locales/en/auth.json';
import authDE from './locales/de/auth.json';
import dashboardEN from './locales/en/dashboard.json';
import dashboardDE from './locales/de/dashboard.json';
import projectsEN from './locales/en/projects.json';
import projectsDE from './locales/de/projects.json';
import clientsEN from './locales/en/clients.json';
import clientsDE from './locales/de/clients.json';
import timeTrackingEN from './locales/en/time-tracking.json';
import timeTrackingDE from './locales/de/time-tracking.json';
import invoicesEN from './locales/en/invoices.json';
import invoicesDE from './locales/de/invoices.json';
import expensesEN from './locales/en/expenses.json';
import expensesDE from './locales/de/expenses.json';
import paymentsEN from './locales/en/payments.json';
import paymentsDE from './locales/de/payments.json';
import financesEN from './locales/en/finances.json';
import financesDE from './locales/de/finances.json';
import reportsEN from './locales/en/reports.json';
import reportsDE from './locales/de/reports.json';
import settingsEN from './locales/en/settings.json';
import settingsDE from './locales/de/settings.json';
import validationEN from './locales/en/validation.json';
import validationDE from './locales/de/validation.json';
import errorsEN from './locales/en/errors.json';
import errorsDE from './locales/de/errors.json';
import systemEN from './locales/en/system.json';
import systemDE from './locales/de/system.json';
import taxPrepaymentsEN from './locales/en/tax-prepayments.json';
import taxPrepaymentsDE from './locales/de/tax-prepayments.json';

// Language resources
const resources = {
  en: {
    common: commonEN,
    auth: authEN,
    dashboard: dashboardEN,
    projects: projectsEN,
    clients: clientsEN,
    'time-tracking': timeTrackingEN,
    invoices: invoicesEN,
    expenses: expensesEN,
    payments: paymentsEN,
    finances: financesEN,
    reports: reportsEN,
    settings: settingsEN,
    validation: validationEN,
    errors: errorsEN,
    system: systemEN,
    'tax-prepayments': taxPrepaymentsEN,
  },
  de: {
    common: commonDE,
    auth: authDE,
    dashboard: dashboardDE,
    projects: projectsDE,
    clients: clientsDE,
    'time-tracking': timeTrackingDE,
    invoices: invoicesDE,
    expenses: expensesDE,
    payments: paymentsDE,
    finances: financesDE,
    reports: reportsDE,
    settings: settingsDE,
    validation: validationDE,
    errors: errorsDE,
    system: systemDE,
    'tax-prepayments': taxPrepaymentsDE,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    lng: localStorage.getItem('language') || 'en',
    debug: false,
    
    // Namespace configuration
    defaultNS: 'common',
    ns: [
      'common',
      'auth',
      'dashboard',
      'projects',
      'clients',
      'time-tracking',
      'invoices',
      'expenses',
      'payments',
      'finances',
      'reports',
      'settings',
      'validation',
      'errors',
      'system',
      'tax-prepayments',
    ],

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    // Language detection configuration
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'language',
    },
  });

export default i18n;
