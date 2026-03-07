/**
 * Dedicated email compose page.
 * Lets users send emails to clients using MJML templates with selectable PDF attachments.
 * Accessible from the user-menu dropdown → "Send Email".
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useClients } from '@/api/hooks/useClients';
import { useInvoices } from '@/hooks/api/useInvoices';
import { useEmailTemplates } from '@/api/hooks/useEmailTemplates';
import { useSendEmail } from '@/api/hooks/useEmailSend';
import type { AttachmentSpec } from '@/api/services/email-send.service';
import type { EmailTemplate } from '@/api/services/email-template.service';
import apiClient from '@/api/services/client';

// ─── Types ───────────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  { value: 'vat', label: 'VAT Report' },
  { value: 'income-expense', label: 'Income & Expense Report' },
  { value: 'invoice', label: 'Invoice Report' },
  { value: 'expense', label: 'Expense Report' },
  { value: 'time-tracking', label: 'Time Tracking Report' },
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

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
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
  return [
    { label: 'Last month', from: fmt(lastMonthStart), to: fmt(lastMonthEnd) },
    { label: 'This month', from: fmt(thisMonthStart), to: fmt(now) },
    { label: 'Last quarter', from: fmt(lastQStart), to: fmt(lastQEnd) },
    { label: 'This quarter', from: fmt(thisQStart), to: fmt(now) },
    { label: `${y - 1}`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
    { label: `${y}`, from: `${y}-01-01`, to: fmt(now) },
  ];
}

// Computed once at module load — prevents new array references on every render
const PRESETS = buildPresets();

// ─── Component ───────────────────────────────────────────────────────────────

export default function ComposeEmailPage() {
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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

  // Auto-dismiss success message
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

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
      setPreviewHtml('<p style="padding:20px;color:#e00;">Preview unavailable.</p>');
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
    setSuccessMsg(null);

    if (!recipientEmail.trim()) {
      setErrorMsg('Please enter a recipient email address.');
      return;
    }
    if (!selectedTemplateId) {
      setErrorMsg('Please select an email template.');
      return;
    }

    for (const r of reports) {
      if (!r.dateFrom || !r.dateTo) {
        setErrorMsg('Please fill in date range for all reports.');
        return;
      }
      if (r.dateFrom > r.dateTo) {
        const label = REPORT_TYPES.find((rt) => rt.value === r.reportType)?.label ?? r.reportType;
        setErrorMsg(`"${label}": start date must be before end date.`);
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
      setSuccessMsg('Email sent successfully.');
      setCheckedInvoices(new Set());
      setReports([]);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message ?? err?.message ?? 'Failed to send email.');
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  const inputCls =
    'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500';

  const sectionCls =
    'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5';

  const allVisibleChecked =
    filteredInvoices.length > 0 && filteredInvoices.every((i) => checkedInvoices.has(i.id));

  const attachmentSummary = (() => {
    const parts: string[] = [];
    if (checkedInvoices.size > 0)
      parts.push(`${checkedInvoices.size} invoice PDF${checkedInvoices.size !== 1 ? 's' : ''}`);
    if (reports.length > 0)
      parts.push(`${reports.length} report PDF${reports.length !== 1 ? 's' : ''}`);
    return parts.length > 0 ? parts.join(' + ') + ' will be attached' : null;
  })();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Send Email</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Compose and send emails using MJML templates with optional PDF attachments.
        </p>
      </div>

      <div className="space-y-6">
        {/* ── Recipient ── */}
        <div className={sectionCls}>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">
            Recipient
          </h2>

          {/* Client autocomplete */}
          <div className="mb-3" ref={clientDropdownRef}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Client <span className="text-gray-400 font-normal">(optional — auto-fills email)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => {
                  setClientSearch(e.target.value);
                  if (selectedClientId) setSelectedClientId('');
                  setShowClientDropdown(true);
                }}
                onFocus={() => setShowClientDropdown(true)}
                placeholder={loadingClients ? 'Loading clients…' : 'Search by name or email…'}
                className={inputCls}
              />
              {(clientSearch || selectedClientId) && (
                <button
                  type="button"
                  onClick={clearClient}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
                  title="Clear client"
                >
                  ×
                </button>
              )}
              {showClientDropdown && filteredClients.length > 0 && (
                <div className="absolute z-50 left-0 top-full mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
                  {filteredClients.map((c) => {
                    const invoiceEmail = clientInvoiceEmail(c);
                    const usesBillingEmail = invoiceEmail && invoiceEmail !== c.email;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectClient(c)}
                        className={`w-full text-left px-4 py-2.5 hover:bg-purple-50 dark:hover:bg-purple-900/20 border-b border-gray-100 dark:border-gray-700 last:border-0 ${
                          c.id === selectedClientId ? 'bg-purple-50 dark:bg-purple-900/20' : ''
                        }`}
                      >
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {c.name}
                        </div>
                        {invoiceEmail && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {invoiceEmail}
                            {usesBillingEmail && (
                              <span className="ml-1 text-purple-500 dark:text-purple-400">
                                (invoice email)
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
                <div className="absolute z-50 left-0 top-full mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl px-4 py-3 text-sm text-gray-400">
                  No clients match "{clientSearch}"
                </div>
              )}
            </div>
          </div>

          {/* Email address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              To
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="recipient@example.com"
              className={inputCls}
            />
          </div>
        </div>

        {/* ── Template ── */}
        <div className={sectionCls}>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">
            Email Template
          </h2>

          {loadingTemplates ? (
            <div className="text-sm text-gray-400">Loading templates…</div>
          ) : templates.length === 0 ? (
            <div className="text-sm text-yellow-600 dark:text-yellow-400">
              No templates found.{' '}
              <Link
                to="/config/email-templates"
                className="underline hover:text-yellow-800 dark:hover:text-yellow-200"
              >
                Create one in Config → Email Templates.
              </Link>
            </div>
          ) : (
            <>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className={inputCls}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_default ? ' ★' : ''} — {t.category}
                  </option>
                ))}
              </select>

              {selectedTemplate?.subject && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium">Subject:</span>
                  <span className="font-mono truncate">{selectedTemplate.subject}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handlePreviewToggle}
                className="mt-2 text-xs text-purple-600 dark:text-purple-400 hover:underline"
              >
                {showPreview ? 'Hide preview' : 'Show preview'}
              </button>

              {showPreview && (
                <div className="mt-3 rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {loadingPreview ? (
                    <div className="h-40 flex items-center justify-center text-sm text-gray-400">
                      Loading preview…
                    </div>
                  ) : (
                    <iframe
                      srcDoc={previewHtml}
                      title="Email preview"
                      className="w-full h-72 bg-white"
                      sandbox="allow-same-origin"
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Invoice attachments ── */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Attach Invoices
            </h2>
            {filteredInvoices.length > 1 && (
              <button
                type="button"
                onClick={toggleAllInvoices}
                className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline"
              >
                {allVisibleChecked ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          <input
            type="text"
            value={invoiceSearch}
            onChange={(e) => setInvoiceSearch(e.target.value)}
            placeholder={
              selectedClientId ? 'Search invoices for this client…' : 'Search all invoices…'
            }
            className={`${inputCls} mb-3`}
          />

          {loadingInvoices ? (
            <div className="text-sm text-gray-400">Loading invoices…</div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-sm text-gray-400 py-2">
              {selectedClientId
                ? 'No active invoices for this client.'
                : invoiceSearch
                ? 'No invoices match your search.'
                : 'No invoices found.'}
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1">
              {filteredInvoices.map((inv) => (
                <label
                  key={inv.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={checkedInvoices.has(inv.id)}
                    onChange={() => toggleInvoice(inv.id)}
                    className="rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {inv.invoice_number}
                    </span>
                    {!selectedClientId && inv.client_name && (
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                        {inv.client_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {inv.issue_date?.slice(0, 10)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        inv.status === 'paid'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : inv.status === 'overdue'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : inv.status === 'sent'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {inv.status}
                    </span>
                    <span className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                      {Number(inv.total_amount).toFixed(2)} {inv.currency}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          )}

          {checkedInvoices.size > 0 && (
            <p className="mt-2 text-xs text-purple-600 dark:text-purple-400">
              {checkedInvoices.size} invoice PDF{checkedInvoices.size !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        {/* ── Report attachments ── */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Attach Reports
            </h2>
            <button
              type="button"
              onClick={addReport}
              className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
            >
              + Add report
            </button>
          </div>

          {reports.length === 0 ? (
            <p className="text-sm text-gray-400">
              No reports added. Click "+ Add report" to attach a generated PDF report.
            </p>
          ) : (
            <div className="space-y-4">
              {reports.map((r) => {
                const dateError = r.dateFrom && r.dateTo && r.dateFrom > r.dateTo;
                return (
                  <div
                    key={r.id}
                    className={`rounded-lg border p-3 space-y-3 ${
                      dateError
                        ? 'border-red-300 dark:border-red-700'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {/* Report type + remove */}
                    <div className="flex items-center gap-2">
                      <select
                        value={r.reportType}
                        onChange={(e) => updateReport(r.id, { reportType: e.target.value })}
                        className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      >
                        {REPORT_TYPES.map((rt) => (
                          <option key={rt.value} value={rt.value}>
                            {rt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeReport(r.id)}
                        className="shrink-0 text-gray-400 hover:text-red-500 dark:hover:text-red-400 text-lg leading-none"
                        title="Remove report"
                      >
                        ×
                      </button>
                    </div>

                    {/* Quick date presets */}
                    <div className="flex flex-wrap gap-1.5">
                      {PRESETS.map((p) => {
                        const active = r.dateFrom === p.from && r.dateTo === p.to;
                        return (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => applyDatePreset(r.id, p.from, p.to)}
                            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                              active
                                ? 'border-purple-500 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400'
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Date range */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                          From
                        </label>
                        <input
                          type="date"
                          value={r.dateFrom}
                          onChange={(e) => updateReport(r.id, { dateFrom: e.target.value })}
                          className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                            dateError
                              ? 'border-red-400 dark:border-red-600'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                          To
                        </label>
                        <input
                          type="date"
                          value={r.dateTo}
                          onChange={(e) => updateReport(r.id, { dateTo: e.target.value })}
                          className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                            dateError
                              ? 'border-red-400 dark:border-red-600'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}
                        />
                      </div>
                    </div>
                    {dateError && (
                      <p className="text-xs text-red-500 dark:text-red-400">
                        Start date must be before end date.
                      </p>
                    )}

                    {/* Options */}
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                          Language
                        </label>
                        <select
                          value={r.lang}
                          onChange={(e) =>
                            updateReport(r.id, { lang: e.target.value as 'en' | 'de' })
                          }
                          className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                          <option value="de">DE</option>
                          <option value="en">EN</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                          Currency
                        </label>
                        <select
                          value={r.currency}
                          onChange={(e) => updateReport(r.id, { currency: e.target.value })}
                          className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                          <option value="EUR">EUR</option>
                          <option value="USD">USD</option>
                          <option value="GBP">GBP</option>
                          <option value="CHF">CHF</option>
                        </select>
                      </div>
                      {r.reportType === 'time-tracking' && (
                        <label className="flex items-center gap-1.5 cursor-pointer pb-0.5">
                          <input
                            type="checkbox"
                            checked={r.hidePrices}
                            onChange={(e) => updateReport(r.id, { hidePrices: e.target.checked })}
                            className="rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500"
                          />
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            Hide hourly rates &amp; totals
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
            <p className="mt-2 text-xs text-purple-600 dark:text-purple-400">
              {reports.length} report PDF{reports.length !== 1 ? 's' : ''} will be generated and
              attached
            </p>
          )}
        </div>

        {/* ── Status messages ── */}
        {errorMsg && (
          <div className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="rounded-lg border border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
            <span>✓</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* ── Send button ── */}
        <div className="flex items-center justify-between">
          {attachmentSummary ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{attachmentSummary}</p>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={handleSend}
            disabled={sendMutation.isPending || templates.length === 0}
            className="rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {sendMutation.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Sending…
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
                Send Email
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
