/**
 * Dedicated email compose page.
 * Lets users send emails to clients using MJML templates with selectable PDF attachments.
 * Accessible from the user-menu dropdown → "Send Email".
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, FileBarChart, Mail, Paperclip, Plus, Search, Send, Users, X } from 'lucide-react';
import { useClients } from '@/api/hooks/useClients';
import { useInvoices } from '@/hooks/api/useInvoices';
import { useEmailTemplates } from '@/api/hooks/useEmailTemplates';
import { useSendEmail } from '@/api/hooks/useEmailSend';
import type { AttachmentSpec } from '@/api/services/email-send.service';
import type { EmailTemplate } from '@/api/services/email-template.service';
import apiClient from '@/api/services/client';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { InvoiceStatusBadge } from '@/components/business/invoices/InvoiceStatusBadge';
import { Alert } from '@/components/common/Alert';
import { SkeletonItem } from '@/components/common/Skeleton';
import { fieldClasses, fieldLabelClass } from '@/components/forms/fieldStyles';
import { formatCurrency } from '@/utils/currency';
import { formatDate, parseYmd, toYmd } from '@/utils/date';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';

// ─── Types ───────────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  { value: 'vat', labelKey: 'vat' },
  { value: 'income-expense', labelKey: 'incomeExpense' },
  { value: 'invoice', labelKey: 'invoice' },
  { value: 'expense', labelKey: 'expense' },
  { value: 'time-tracking', labelKey: 'timeTracking' },
] as const;

interface ReportEntry {
  id: string;
  reportType: string;
  dateFrom: string;
  dateTo: string;
  lang: 'en' | 'de';
  currency: string;
  hidePrices: boolean;
}

// ─── Date helpers (module-level — computed once, stable references in effects) ─

/** Local calendar day as YYYY-MM-DD (toISOString would shift it by a day east of UTC). */
function fmt(d: Date) {
  return toYmd(d);
}

function buildPresets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const lastMonthStart = new Date(y, m - 1, 1);
  const lastMonthEnd = new Date(y, m, 0);
  const thisMonthStart = new Date(y, m, 1);
  const q = Math.floor(m / 3);
  const thisQStart = new Date(y, q * 3, 1);
  const lastQStart = new Date(y, (q - 1) * 3, 1);
  const lastQEnd = new Date(y, q * 3, 0);
  // `labelKey` is translated at render time; year presets show the year itself
  const presets: { id: string; labelKey?: string; label?: string; from: string; to: string }[] = [
    { id: 'lastMonth', labelKey: 'lastMonth', from: fmt(lastMonthStart), to: fmt(lastMonthEnd) },
    { id: 'thisMonth', labelKey: 'thisMonth', from: fmt(thisMonthStart), to: fmt(now) },
    { id: 'lastQuarter', labelKey: 'lastQuarter', from: fmt(lastQStart), to: fmt(lastQEnd) },
    { id: 'thisQuarter', labelKey: 'thisQuarter', from: fmt(thisQStart), to: fmt(now) },
    { id: `${y - 1}`, label: `${y - 1}`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
    { id: `${y}`, label: `${y}`, from: `${y}-01-01`, to: fmt(now) },
  ];
  return presets;
}

// Computed once at module load — prevents new array references on every render
const PRESETS = buildPresets();

// ─── Component ───────────────────────────────────────────────────────────────

export default function ComposeEmailPage() {
  const { t } = useTranslation(['email-templates', 'invoices']);
  const [searchParams] = useSearchParams();
  const preClientId = searchParams.get('clientId') ?? '';
  const preInvoiceId = searchParams.get('invoiceId') ?? '';

  // Data
  const { clients = [], isLoading: loadingClients } = useClients();
  const { data: allInvoices = [], isLoading: loadingInvoices } = useInvoices();
  const { data: templates = [], isLoading: loadingTemplates } = useEmailTemplates();
  const sendMutation = useSendEmail();

  // ── Recipient ──
  const [recipientEmail, setRecipientEmail] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(preClientId);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // ── Template ──
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  // ── Invoice attachments ──
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [checkedInvoices, setCheckedInvoices] = useState<Set<string>>(new Set());

  // ── Report attachments ──
  const [reports, setReports] = useState<ReportEntry[]>([]);

  // ── Status ──
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const selectedTemplate: EmailTemplate | undefined = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  const filteredClients = useMemo(
    () =>
      clients.filter(
        (c) =>
          !clientSearch ||
          c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
          (c.email ?? '').toLowerCase().includes(clientSearch.toLowerCase()) ||
          ((c as any).billing_email ?? '').toLowerCase().includes(clientSearch.toLowerCase()),
      ),
    [clients, clientSearch],
  );

  const filteredInvoices = useMemo(
    () =>
      allInvoices.filter((inv) => {
        if (selectedClientId && inv.client_id !== selectedClientId) return false;
        if (inv.status === 'cancelled') return false;
        const q = invoiceSearch.toLowerCase();
        return (
          !q ||
          (inv.invoice_number ?? '').toLowerCase().includes(q) ||
          (inv.client_name ?? '').toLowerCase().includes(q)
        );
      }),
    [allInvoices, selectedClientId, invoiceSearch],
  );

  // ─── Init guards — run once when data first arrives, ignore repeated renders ──

  const templateInitDone = useRef(false);
  const urlInitDone = useRef(false);

  // Auto-select default template (fires once when templates first load)
  useEffect(() => {
    if (templateInitDone.current || templates.length === 0) return;
    templateInitDone.current = true;
    const def = templates.find((t) => t.is_default) ?? templates[0];
    setSelectedTemplateId(def.id);
  }, [templates]);

  // Init from URL params (fires once when clients first load)
  useEffect(() => {
    if (urlInitDone.current || !preClientId || clients.length === 0) return;
    urlInitDone.current = true;
    const client = clients.find((c) => c.id === preClientId);
    if (client) {
      setSelectedClientId(client.id);
      setClientSearch(client.name);
      setRecipientEmail((client as any).billing_email || client.email || '');
    }
  }, [preClientId, clients]);

  // Pre-select invoice from URL (stable string dep — runs at most once)
  useEffect(() => {
    if (preInvoiceId) {
      setCheckedInvoices(new Set([preInvoiceId]));
    }
  }, [preInvoiceId]);

  // Close client dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Translated name of a report type */
  const reportTypeLabel = (reportType: string) => {
    const labelKey = REPORT_TYPES.find((rt) => rt.value === reportType)?.labelKey;
    return labelKey ? t(`compose.reportTypes.${labelKey}`) : reportType;
  };

  /** Returns the invoice email for a client: billing_email if set, otherwise contact email */
  const clientInvoiceEmail = (c: (typeof clients)[0]) =>
    (c as any).billing_email || c.email || '';

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const selectClient = (client: (typeof clients)[0]) => {
    setSelectedClientId(client.id);
    setClientSearch(client.name);
    setRecipientEmail(clientInvoiceEmail(client));
    setShowClientDropdown(false);
    setCheckedInvoices(new Set());
  };

  const clearClient = () => {
    setSelectedClientId('');
    setClientSearch('');
    setRecipientEmail('');
    setCheckedInvoices(new Set());
    setShowClientDropdown(false);
  };

  const toggleInvoice = (id: string) => {
    setCheckedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllInvoices = () => {
    const allVisible = filteredInvoices.map((i) => i.id);
    const allChecked = allVisible.every((id) => checkedInvoices.has(id));
    if (allChecked) {
      setCheckedInvoices((prev) => {
        const next = new Set(prev);
        allVisible.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setCheckedInvoices((prev) => {
        const next = new Set(prev);
        allVisible.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const addReport = () => {
    setReports((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        reportType: 'income-expense',
        dateFrom: PRESETS[0].from,
        dateTo: PRESETS[0].to,
        lang: 'de',
        currency: 'EUR',
        hidePrices: false,
      },
    ]);
  };

  const updateReport = (id: string, patch: Partial<ReportEntry>) => {
    setReports((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...patch };
        // Auto-toggle hidePrices when switching report type
        if ('reportType' in patch && !('hidePrices' in patch)) {
          updated.hidePrices = patch.reportType === 'time-tracking';
        }
        return updated;
      }),
    );
  };

  const removeReport = (id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  const applyDatePreset = (reportId: string, from: string, to: string) => {
    updateReport(reportId, { dateFrom: from, dateTo: to });
  };

  const loadPreview = async (templateId: string) => {
    if (!templateId) return;
    setLoadingPreview(true);
    try {
      const res = await apiClient.post(`/email-templates/${templateId}/preview`, { variables: {} });
      setPreviewHtml(res.data.html ?? '');
    } catch {
      setPreviewHtml(`<p style="padding:20px;color:#e00;font-family:sans-serif;">${t('send.previewUnavailable')}</p>`);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleTemplateChange = (id: string) => {
    setSelectedTemplateId(id);
    if (showPreview && id) void loadPreview(id);
  };

  const handlePreviewToggle = () => {
    const next = !showPreview;
    setShowPreview(next);
    if (next && selectedTemplateId) void loadPreview(selectedTemplateId);
  };

  const handleSend = async () => {
    setErrorMsg(null);

    if (!recipientEmail.trim()) {
      setErrorMsg(t('send.errors.recipientRequired'));
      return;
    }
    if (!selectedTemplateId) {
      setErrorMsg(t('send.errors.templateRequired'));
      return;
    }

    for (const r of reports) {
      if (!r.dateFrom || !r.dateTo) {
        setErrorMsg(t('compose.errors.reportDatesRequired'));
        return;
      }
      if (r.dateFrom > r.dateTo) {
        setErrorMsg(t('compose.errors.reportDateOrder', { label: reportTypeLabel(r.reportType) }));
        return;
      }
    }

    const attachments: AttachmentSpec[] = [
      ...Array.from(checkedInvoices).map((id) => ({ type: 'invoice' as const, invoiceId: id })),
      ...reports.map((r) => ({
        type: 'report' as const,
        reportType: r.reportType,
        dateFrom: r.dateFrom,
        dateTo: r.dateTo,
        lang: r.lang,
        currency: r.currency,
        hidePrices: r.hidePrices,
      })),
    ];

    try {
      await sendMutation.mutateAsync({
        to: recipientEmail.trim(),
        templateId: selectedTemplateId,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      sendMutation.reset();
      toast.success(t('send.success'));
      setCheckedInvoices(new Set());
      setReports([]);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message ?? err?.message ?? t('send.errors.sendFailed'));
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  const sectionCls = 'surface p-5 sm:p-6';

  const checkboxCls =
    'h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900';

  const textLinkCls =
    'inline-flex items-center gap-1.5 rounded text-xs font-medium text-brand-600 transition-colors hover:text-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400 dark:hover:text-brand-300';

  const allVisibleChecked =
    filteredInvoices.length > 0 && filteredInvoices.every((i) => checkedInvoices.has(i.id));

  const attachmentParts: string[] = [];
  if (checkedInvoices.size > 0) attachmentParts.push(t('compose.invoicePdfs', { count: checkedInvoices.size }));
  if (reports.length > 0) attachmentParts.push(t('compose.reportPdfs', { count: reports.length }));

  return (
    <div>
      {/* Page header */}
      <PageHeader title={t('compose.title')} subtitle={t('compose.subtitle')} icon={Mail} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {/* ── Recipient ── */}
          <section className={sectionCls} aria-labelledby="compose-recipient">
            <h2 id="compose-recipient" className="section-title mb-4">
              {t('compose.recipient')}
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Client autocomplete */}
              <div ref={clientDropdownRef}>
                <label htmlFor="compose-client" className={fieldLabelClass()}>
                  {t('compose.client')}{' '}
                  <span className="font-normal text-gray-500 dark:text-gray-400">({t('compose.clientHint')})</span>
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                    aria-hidden="true"
                  />
                  <input
                    id="compose-client"
                    type="text"
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      if (selectedClientId) setSelectedClientId('');
                      setShowClientDropdown(true);
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                    placeholder={loadingClients ? t('compose.loadingClients') : t('compose.searchClients')}
                    autoComplete="off"
                    className={cn(fieldClasses(), 'pl-9 pr-9')}
                  />
                  {(clientSearch || selectedClientId) && (
                    <button
                      type="button"
                      onClick={clearClient}
                      className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
                      title={t('compose.clearClient')}
                      aria-label={t('compose.clearClient')}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  {showClientDropdown && filteredClients.length > 0 && (
                    <div className="absolute left-0 top-full z-30 mt-1.5 max-h-60 w-full origin-top animate-scale-in overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-overlay dark:border-gray-800 dark:bg-gray-900">
                      {filteredClients.map((c) => {
                        const invoiceEmail = clientInvoiceEmail(c);
                        const usesBillingEmail = invoiceEmail && invoiceEmail !== c.email;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => selectClient(c)}
                            className={cn(
                              'block w-full rounded-lg px-3 py-2 text-left transition-colors',
                              c.id === selectedClientId
                                ? 'bg-brand-50 dark:bg-brand-500/10'
                                : 'hover:bg-gray-50 dark:hover:bg-white/5'
                            )}
                          >
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {c.name}
                            </div>
                            {invoiceEmail && (
                              <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                                {invoiceEmail}
                                {usesBillingEmail && (
                                  <span className="ml-1 text-brand-600 dark:text-brand-400">
                                    ({t('compose.invoiceEmail')})
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {showClientDropdown && clientSearch.length > 0 && filteredClients.length === 0 && (
                    <div className="absolute left-0 top-full z-30 mt-1.5 w-full origin-top animate-scale-in rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-overlay dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                      {t('compose.noClientMatch', { query: clientSearch })}
                    </div>
                  )}
                </div>
              </div>

              {/* Email address */}
              <div>
                <label htmlFor="compose-to" className={fieldLabelClass()}>
                  {t('send.to')}
                </label>
                <input
                  id="compose-to"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder={t('send.toPlaceholder')}
                  className={fieldClasses()}
                />
              </div>
            </div>
          </section>

          {/* ── Template ── */}
          <section className={sectionCls} aria-labelledby="compose-template">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="compose-template" className="section-title">
                {t('compose.emailTemplate')}
              </h2>
              {!loadingTemplates && templates.length > 0 && (
                <button type="button" onClick={handlePreviewToggle} aria-expanded={showPreview} className={textLinkCls}>
                  {showPreview ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                  {showPreview ? t('send.hidePreview') : t('send.showPreview')}
                </button>
              )}
            </div>

            {loadingTemplates ? (
              <SkeletonItem className="h-10 w-full rounded-lg" />
            ) : templates.length === 0 ? (
              <div className="rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20">
                {t('compose.noTemplates')}{' '}
                <Link
                  to="/config/email-templates"
                  className="font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100"
                >
                  {t('compose.createTemplate')}
                </Link>
              </div>
            ) : (
              <>
                <label htmlFor="compose-template-select" className="sr-only">
                  {t('send.template')}
                </label>
                <select
                  id="compose-template-select"
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className={fieldClasses()}
                >
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                      {tpl.is_default ? ' ★' : ''} — {t(`categories.${tpl.category}`, { defaultValue: tpl.category })}
                    </option>
                  ))}
                </select>

                {selectedTemplate?.subject && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium">{t('send.subject')}:</span>
                    <span className="truncate font-mono">{selectedTemplate.subject}</span>
                  </div>
                )}

                {showPreview && (
                  <div className="mt-4 animate-fade-in overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800">
                    {loadingPreview ? (
                      <div className="flex h-40 items-center justify-center text-sm text-gray-500">
                        {t('send.loadingPreview')}
                      </div>
                    ) : (
                      <iframe
                        srcDoc={previewHtml}
                        title={t('send.previewTitle')}
                        className="h-96 w-full bg-white"
                        sandbox="allow-same-origin"
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Invoice attachments ── */}
          <section className={sectionCls} aria-labelledby="compose-invoices">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="compose-invoices" className="section-title">
                {t('compose.attachInvoices')}
              </h2>
              {filteredInvoices.length > 1 && (
                <button type="button" onClick={toggleAllInvoices} className={textLinkCls}>
                  {allVisibleChecked ? t('compose.deselectAll') : t('compose.selectAll')}
                </button>
              )}
            </div>

            <div className="relative mb-3">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                aria-hidden="true"
              />
              <input
                type="text"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder={
                  selectedClientId ? t('compose.searchInvoicesClient') : t('compose.searchInvoicesAll')
                }
                aria-label={
                  selectedClientId ? t('compose.searchInvoicesClient') : t('compose.searchInvoicesAll')
                }
                className={cn(fieldClasses(), 'pl-9')}
              />
            </div>

            {loadingInvoices ? (
              <div className="space-y-2">
                {[0, 1, 2].map((row) => (
                  <SkeletonItem key={row} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : filteredInvoices.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                {selectedClientId
                  ? t('compose.noInvoicesClient')
                  : invoiceSearch
                  ? t('compose.noInvoicesSearch')
                  : t('compose.noInvoices')}
              </p>
            ) : (
              <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                {filteredInvoices.map((inv) => (
                  <label
                    key={inv.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors',
                      checkedInvoices.has(inv.id)
                        ? 'bg-brand-50/60 dark:bg-brand-500/[0.07]'
                        : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checkedInvoices.has(inv.id)}
                      onChange={() => toggleInvoice(inv.id)}
                      className={checkboxCls}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {inv.invoice_number}
                      </span>
                      {!selectedClientId && inv.client_name && (
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          {inv.client_name}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="hidden text-xs tabular-nums text-gray-500 sm:inline dark:text-gray-400">
                        {formatDate(parseYmd(inv.issue_date))}
                      </span>
                      <InvoiceStatusBadge status={inv.status} size="sm" />
                      <span className="w-24 text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
                        {formatCurrency(Number(inv.total_amount), inv.currency)}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {checkedInvoices.size > 0 && (
              <p className="mt-3 text-xs font-medium text-brand-600 dark:text-brand-400">
                {t('compose.invoicesSelected', { count: checkedInvoices.size })}
              </p>
            )}
          </section>

          {/* ── Report attachments ── */}
          <section className={sectionCls} aria-labelledby="compose-reports">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="compose-reports" className="section-title">
                {t('compose.attachReports')}
              </h2>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addReport}
                leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              >
                {t('compose.addReport')}
              </Button>
            </div>

            {reports.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <FileBarChart className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                {t('compose.noReports')}
              </div>
            ) : (
              <div className="space-y-4">
                {reports.map((r) => {
                  const dateError = r.dateFrom && r.dateTo && r.dateFrom > r.dateTo;
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        'animate-fade-up space-y-4 rounded-lg border p-4',
                        dateError
                          ? 'border-red-300 dark:border-red-500/40'
                          : 'border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-white/[0.02]'
                      )}
                    >
                      {/* Report type + remove */}
                      <div className="flex items-center gap-2">
                        <select
                          value={r.reportType}
                          onChange={(e) => updateReport(r.id, { reportType: e.target.value })}
                          aria-label={t('compose.attachReports')}
                          className={cn(fieldClasses(), 'flex-1')}
                        >
                          {REPORT_TYPES.map((rt) => (
                            <option key={rt.value} value={rt.value}>
                              {t(`compose.reportTypes.${rt.labelKey}`)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeReport(r.id)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                          title={t('compose.removeReport')}
                          aria-label={t('compose.removeReport')}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      {/* Quick date presets */}
                      <div className="flex flex-wrap gap-1.5">
                        {PRESETS.map((p) => {
                          const active = r.dateFrom === p.from && r.dateTo === p.to;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => applyDatePreset(r.id, p.from, p.to)}
                              aria-pressed={active}
                              className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                                active
                                  ? 'bg-brand-50 text-brand-700 ring-brand-600/25 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/30'
                                  : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:bg-transparent dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200'
                              )}
                            >
                              {p.labelKey ? t(`compose.presets.${p.labelKey}`) : p.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Date range */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor={`report-from-${r.id}`} className={fieldLabelClass()}>
                            {t('compose.from')}
                          </label>
                          <input
                            id={`report-from-${r.id}`}
                            type="date"
                            value={r.dateFrom}
                            onChange={(e) => updateReport(r.id, { dateFrom: e.target.value })}
                            className={fieldClasses({ error: !!dateError })}
                          />
                        </div>
                        <div>
                          <label htmlFor={`report-to-${r.id}`} className={fieldLabelClass()}>
                            {t('compose.to')}
                          </label>
                          <input
                            id={`report-to-${r.id}`}
                            type="date"
                            value={r.dateTo}
                            onChange={(e) => updateReport(r.id, { dateTo: e.target.value })}
                            className={fieldClasses({ error: !!dateError })}
                          />
                        </div>
                      </div>
                      {dateError && (
                        <p className="animate-fade-in text-xs font-medium text-red-600 dark:text-red-400">
                          {t('compose.dateOrder')}
                        </p>
                      )}

                      {/* Options */}
                      <div className="flex flex-wrap items-end gap-4">
                        <div>
                          <label htmlFor={`report-lang-${r.id}`} className={fieldLabelClass()}>
                            {t('compose.language')}
                          </label>
                          <select
                            id={`report-lang-${r.id}`}
                            value={r.lang}
                            onChange={(e) =>
                              updateReport(r.id, { lang: e.target.value as 'en' | 'de' })
                            }
                            className={cn(fieldClasses(), 'w-28')}
                          >
                            <option value="de">DE</option>
                            <option value="en">EN</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`report-currency-${r.id}`} className={fieldLabelClass()}>
                            {t('compose.currency')}
                          </label>
                          <select
                            id={`report-currency-${r.id}`}
                            value={r.currency}
                            onChange={(e) => updateReport(r.id, { currency: e.target.value })}
                            className={cn(fieldClasses(), 'w-28')}
                          >
                            <option value="EUR">EUR</option>
                            <option value="USD">USD</option>
                            <option value="GBP">GBP</option>
                            <option value="CHF">CHF</option>
                          </select>
                        </div>
                        {r.reportType === 'time-tracking' && (
                          <label className="flex h-10 cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={r.hidePrices}
                              onChange={(e) => updateReport(r.id, { hidePrices: e.target.checked })}
                              className={checkboxCls}
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {t('compose.hidePrices')}
                            </span>
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {reports.length > 0 && (
              <p className="mt-3 text-xs font-medium text-brand-600 dark:text-brand-400">
                {t('compose.reportsAttached', { count: reports.length })}
              </p>
            )}
          </section>
        </div>

        {/* ── Summary + send ── */}
        <aside className="lg:sticky lg:top-24">
          <section className={sectionCls} aria-labelledby="compose-summary">
            <h2 id="compose-summary" className="section-title mb-4">
              {t('compose.summary')}
            </h2>

            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <dt className="flex w-28 shrink-0 items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('send.to')}
                </dt>
                <dd className="min-w-0 break-words text-gray-900 dark:text-gray-100">
                  {recipientEmail.trim() || (
                    <span className="text-gray-400 dark:text-gray-500">{t('compose.noRecipient')}</span>
                  )}
                </dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="flex w-28 shrink-0 items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('send.template')}
                </dt>
                <dd className="min-w-0 text-gray-900 dark:text-gray-100">
                  {selectedTemplate ? (
                    <>
                      <span className="block truncate">{selectedTemplate.name}</span>
                      {selectedTemplate.subject && (
                        <span className="block truncate font-mono text-xs text-gray-500 dark:text-gray-400">
                          {selectedTemplate.subject}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  )}
                </dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="flex w-28 shrink-0 items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('send.attachments')}
                </dt>
                <dd className="min-w-0 text-gray-900 dark:text-gray-100">
                  {attachmentParts.length > 0 ? (
                    attachmentParts.map((part) => (
                      <span key={part} className="block tabular-nums">
                        {part}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">{t('compose.noAttachments')}</span>
                  )}
                </dd>
              </div>
            </dl>

            {/* ── Status messages ── */}
            {errorMsg && (
              <div className="mt-5 animate-fade-in">
                <Alert type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />
              </div>
            )}

            {/* ── Send button ── */}
            <Button
              type="button"
              size="lg"
              className="mt-5 w-full"
              onClick={handleSend}
              isLoading={sendMutation.isPending}
              disabled={sendMutation.isPending || templates.length === 0}
              leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
            >
              {sendMutation.isPending ? t('send.sending') : t('send.submit')}
            </Button>
          </section>
        </aside>
      </div>
    </div>
  );
}
