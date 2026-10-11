/**
 * Landing Page Component
 * Calm product landing page: hero with sign-up call to action, a preview of
 * the app's insights and a feature overview. Follows the light/dark theme.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  FolderOpen,
  Paperclip,
  Rocket,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { buttonClasses } from '../components/common/buttonStyles';
import { cn } from '../lib/cn';

/** Brand-coloured initial of the "Track Your Money & Effort" tagline (T·Y·M·E). */
const Initial: React.FC<{ children: string }> = ({ children }) => (
  <span className="text-brand-600 dark:text-brand-400">{children}</span>
);

/** Tinted square holding an icon. */
const IconTile: React.FC<{ icon: LucideIcon; tone?: 'brand' | 'amber' | 'violet' | 'emerald'; className?: string }> = ({
  icon: Icon,
  tone = 'brand',
  className,
}) => {
  const tones = {
    brand: 'bg-brand-50 text-brand-600 ring-brand-600/10 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20',
    amber: 'bg-amber-50 text-amber-600 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
    violet: 'bg-violet-50 text-violet-600 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  };
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', tones[tone], className ?? 'h-10 w-10')}>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
};

/** Section heading, centred. */
const SectionHeading: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div className="mx-auto mb-12 max-w-2xl text-center">
    <h2 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl dark:text-white">{title}</h2>
    <p className="mt-3 text-base text-gray-600 sm:text-lg dark:text-gray-400">{subtitle}</p>
  </div>
);

const CHART_POINTS: [number, number][] = [
  [0, 180], [50, 150], [100, 140], [150, 120], [200, 100], [250, 90], [300, 70], [350, 50], [400, 40],
];

const LandingPage: React.FC = () => {
  const { t, i18n } = useTranslation('auth');
  const locale = i18n.language || undefined;

  // Sample figures for the preview cards, shown in the visitor's locale
  const money = (value: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
  const ago = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-value, unit);

  const linePath = CHART_POINTS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');

  const sessions = [
    { project: 'API Development', client: 'Tech Startup', time: '4:15:32', amount: 415 },
    { project: 'Logo Design', client: 'Creative Agency', time: '2:30:00', amount: 250 },
    { project: 'Content Writing', client: 'Marketing Co', time: '3:45:12', amount: 375 },
  ];

  const expenseCategories = [
    { label: t('landing.preview.expenses.software'), amount: 850, percentage: 35, color: 'bg-brand-600 dark:bg-brand-500' },
    { label: t('landing.preview.expenses.office'), amount: 320, percentage: 25, color: 'bg-brand-300 dark:bg-brand-300' },
    { label: t('landing.preview.expenses.marketing'), amount: 480, percentage: 20, color: 'bg-violet-500' },
    { label: t('landing.preview.expenses.other'), amount: 150, percentage: 20, color: 'bg-gray-400 dark:bg-gray-500' },
  ];

  const quickStats: { value: string; label: string; icon: LucideIcon; tone: 'brand' | 'amber' | 'violet' | 'emerald' }[] = [
    { value: '12', label: t('landing.preview.stats.activeClients'), icon: Users, tone: 'brand' },
    { value: '8', label: t('landing.preview.stats.openInvoices'), icon: FileText, tone: 'amber' },
    { value: '156', label: t('landing.preview.stats.hoursThisMonth'), icon: Clock, tone: 'violet' },
    { value: '98%', label: t('landing.preview.stats.paymentRate'), icon: TrendingUp, tone: 'emerald' },
  ];

  const activity: { label: string; time: string; icon: LucideIcon }[] = [
    { label: t('landing.preview.stats.invoicePaid'), time: ago(2, 'hour'), icon: CheckCircle2 },
    { label: t('landing.preview.stats.projectStarted'), time: ago(5, 'hour'), icon: Rocket },
    { label: t('landing.preview.stats.expenseAdded'), time: ago(1, 'day'), icon: Paperclip },
  ];

  const features: { key: string; icon: LucideIcon }[] = [
    { key: 'time', icon: Clock },
    { key: 'invoices', icon: FileText },
    { key: 'finances', icon: BarChart3 },
    { key: 'clients', icon: Users },
    { key: 'expenses', icon: FolderOpen },
    { key: 'security', icon: ShieldCheck },
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-600/15 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {t('landing.badge')}
        </span>
        <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-semibold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl dark:text-white">
          <Initial>T</Initial>rack <Initial>Y</Initial>our <Initial>M</Initial>oney &amp; <Initial>E</Initial>ffort
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 dark:text-gray-400">
          {t('landing.lead')}
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/register"
            className={cn(buttonClasses('primary', 'lg'), 'w-full sm:w-auto')}
          >
            {t('landing.getStarted')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <a
            href="#features"
            className={cn(buttonClasses('secondary', 'lg'), 'w-full sm:w-auto')}
          >
            {t('landing.learnMore')}
          </a>
        </div>
      </section>

      {/* Dashboard Preview Section */}
      <section className="border-t border-gray-200/70 py-20 dark:border-gray-800/70">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading title={t('landing.preview.title')} subtitle={t('landing.preview.subtitle')} />

          <div className="stagger grid gap-6 md:grid-cols-2" aria-hidden="true">
            {/* Revenue Chart Preview */}
            <div className="surface p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <h3 className="section-title">{t('landing.preview.revenue.title')}</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                  +24%
                </span>
              </div>
              <div className="h-48 text-brand-600 dark:text-brand-400">
                <svg className="h-full w-full" viewBox="0 0 400 200" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="landingRevenueFill" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[50, 100, 150].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      x2="400"
                      y1={y}
                      y2={y}
                      className="stroke-gray-200 dark:stroke-gray-800"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  <path d={`${linePath} L 400 200 L 0 200 Z`} fill="url(#landingRevenueFill)" />
                  <path
                    d={linePath}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-gray-100 pt-5 dark:border-gray-800">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('landing.preview.revenue.thisMonth')}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-brand-600 sm:text-xl dark:text-brand-400">{money(8420)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('landing.preview.revenue.invoiced')}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 sm:text-xl dark:text-white">{money(12340)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('landing.preview.revenue.pending')}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-amber-600 sm:text-xl dark:text-amber-400">{money(3920)}</p>
                </div>
              </div>
            </div>

            {/* Time Tracking Preview */}
            <div className="surface p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <h3 className="section-title">{t('landing.preview.time.title')}</h3>
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-600/15 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20">
                  {t('landing.preview.time.active')}
                </span>
              </div>

              {/* Active Session */}
              <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-500/25 dark:bg-brand-500/10">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-gray-900 dark:text-white">Website Redesign</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-brand-700 dark:text-brand-300">2:34:18</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
                  <span>{t('landing.preview.time.client', { name: 'Acme Corp' })}</span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {t('landing.preview.time.running')}
                  </span>
                </div>
              </div>

              {/* Recent Sessions */}
              <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
                {sessions.map((session) => (
                  <li key={session.project} className="flex items-center justify-between gap-3 px-1 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{session.project}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {t('landing.preview.time.client', { name: session.client })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm tabular-nums text-gray-700 dark:text-gray-300">{session.time}</p>
                      <p className="text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{money(session.amount)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Expenses Breakdown */}
            <div className="surface p-6">
              <h3 className="section-title mb-6">{t('landing.preview.expenses.title')}</h3>
              <div className="flex flex-col items-center gap-8 sm:flex-row">
                {/* Circular Progress Chart */}
                <div className="relative h-36 w-36 shrink-0">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" strokeWidth="10" className="stroke-gray-100 dark:stroke-gray-800" />
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray="314"
                      strokeDashoffset="79"
                      className="stroke-brand-600 dark:stroke-brand-400"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">75%</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('landing.preview.expenses.ofBudget')}</p>
                  </div>
                </div>

                {/* Expense Categories */}
                <div className="w-full flex-1 space-y-3">
                  {expenseCategories.map((expense) => (
                    <div key={expense.label}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">{expense.label}</span>
                        <span className="font-medium tabular-nums text-gray-900 dark:text-white">{money(expense.amount)}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                        <div className={cn('h-1.5 rounded-full', expense.color)} style={{ width: `${expense.percentage}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="surface p-6">
              <h3 className="section-title mb-6">{t('landing.preview.stats.title')}</h3>
              <div className="grid grid-cols-2 gap-3">
                {quickStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="flex flex-col items-start gap-2 rounded-lg bg-gray-50 p-3 sm:flex-row sm:items-center sm:gap-3 dark:bg-white/[0.03]"
                  >
                    <IconTile icon={stat.icon} tone={stat.tone} className="h-9 w-9" />
                    <div className="min-w-0">
                      <p className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">{stat.value}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent Activity */}
              <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
                <p className="eyebrow mb-3">{t('landing.preview.stats.recentActivity')}</p>
                <ul className="space-y-2.5">
                  {activity.map((item) => (
                    <li key={item.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-gray-700 dark:text-gray-300">
                        <item.icon className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{item.time}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="scroll-mt-16 border-t border-gray-200/70 py-20 dark:border-gray-800/70">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading title={t('landing.features.title')} subtitle={t('landing.features.subtitle')} />

          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ key, icon }) => (
              <div key={key} className="surface p-6">
                <IconTile icon={icon} />
                <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
                  {t(`landing.features.${key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {t(`landing.features.${key}.body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
