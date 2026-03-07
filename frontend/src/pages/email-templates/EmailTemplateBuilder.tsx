/**
 * @fileoverview Email Template Editor — core implementation.
 *
 * Core provides a code-based editor (HTML/MJML textarea + file upload).
 * The GrapeJS MJML drag-and-drop builder is available as the
 * "email-builder" addon which injects its UI via the 'email-template-builder' slot.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Slot } from '@/plugins/slots';
import { useSlotProvider } from '@/plugins/slots/SlotProvider';
import { useEmailTemplate, useCreateEmailTemplate, useUpdateEmailTemplate } from '@/api/hooks/useEmailTemplates';
import { previewRawMjml } from '@/api/services/email-template.service';

const CATEGORIES = ['custom', 'invoice', 'reminder', 'welcome', 'notification'];

const DEFAULT_MJML = `<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text font-size="20px" font-weight="bold" color="#7c3aed">
          {{company.name}}
        </mj-text>
        <mj-divider border-color="#e5e7eb" />
        <mj-text>
          Hello {{client.name}},
        </mj-text>
        <mj-text>
          Please find your invoice {{invoice.number}} attached.
        </mj-text>
        <mj-button background-color="#7c3aed" href="#">
          View Invoice
        </mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

export default function EmailTemplateBuilder() {
  const { t } = useTranslation('email-templates');
  const { hasSlotComponents } = useSlotProvider();
  const builderAddonActive = hasSlotComponents('email-template-builder');
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('custom');
  const [language, setLanguage] = useState('de');
  const [isDefault, setIsDefault] = useState(false);
  const [mjmlContent, setMjmlContent] = useState(DEFAULT_MJML);
  // Delay GrapeJS mount until existing template data has loaded.
  // For new templates the content is ready immediately (no async fetch needed).
  const [isContentReady, setIsContentReady] = useState(isNew);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [previewHtml, setPreviewHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPh, setShowPh] = useState(false);

  const { data: existing } = useEmailTemplate(id ?? '');
  const createTemplate = useCreateEmailTemplate();
  const updateTemplate = useUpdateEmailTemplate(id ?? '');

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setSubject(existing.subject);
      setCategory(existing.category);
      setLanguage(existing.language);
      setIsDefault(existing.is_default);
      setMjmlContent(existing.mjml_content);
      setIsContentReady(true);
    }
  }, [existing]);

  const handleSave = async () => {
    if (!name || !subject) {
      setSaveMsg({ type: 'error', text: t('builder.validationError') });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload = { name, subject, category, language, is_default: isDefault, mjml_content: mjmlContent };
      if (isNew) {
        const created = await createTemplate.mutateAsync(payload);
        setSaveMsg({ type: 'success', text: t('builder.saveSuccess') });
        navigate(`/email-templates/${created.id}`, { replace: true });
      } else {
        await updateTemplate.mutateAsync(payload);
        setSaveMsg({ type: 'success', text: t('builder.saveSuccess') });
      }
    } catch {
      setSaveMsg({ type: 'error', text: t('builder.saveError') });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setActiveTab('preview');
    try {
      const result = await previewRawMjml(mjmlContent, {
        'company.name': 'My Company',
        'invoice.number': 'INV-2026-001',
        'invoice.total': '1.234,00 \u20ac',
        'client.name': 'Max Mustermann',
        'client.email': 'max@example.com',
      });
      setPreviewHtml(result.html);
    } catch {
      setPreviewHtml('<p style="padding:20px;color:#e00;">Failed to render preview.</p>');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setMjmlContent(ev.target?.result as string);
    reader.readAsText(file);
    e.target.value = '';
  };

  const insertPlaceholder = (variable: string) => {
    const placeholder = `{{${variable}}}`;
    if (builderAddonActive) {
      // Delegate to GrapeJS editor via the bridge registered by the addon component.
      // If no text component is focused in the canvas, the bridge is a no-op.
      (window as any).__grapesjsInsert?.(placeholder);
      setShowPh(false);
      return;
    }
    const textarea = document.getElementById('mjml-editor') as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setMjmlContent(mjmlContent.slice(0, start) + placeholder + mjmlContent.slice(end));
    setTimeout(() => {
      textarea.focus();
      const pos = start + placeholder.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  };

  const PLACEHOLDER_GROUPS = [
    { label: 'Company', vars: ['company.name', 'company.email', 'company.phone', 'company.address', 'company.logo_url'] },
    { label: 'Invoice', vars: ['invoice.number', 'invoice.date', 'invoice.due_date', 'invoice.total', 'invoice.currency'] },
    { label: 'Client', vars: ['client.name', 'client.email', 'client.address'] },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <button onClick={() => navigate('/config/email-templates')} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">
          {'←'} {t('builder.back')}
        </button>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          {isNew ? t('builder.newTitle') : t('builder.editTitle')}
        </h1>
      </div>

      {/* Meta fields */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('builder.name')}</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('builder.namePlaceholder')} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('builder.subject')}</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('builder.subjectPlaceholder')} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100" />
        </div>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('builder.category')}</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('builder.language')}</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100">
              <option value="de">DE</option>
              <option value="en">EN</option>
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer pb-1.5">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-gray-300" />
            {t('builder.default')}
          </label>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden">
          <button onClick={() => setActiveTab('code')} className={`px-3 py-1.5 text-sm ${activeTab === 'code' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
            {t('builder.tabCode')}
          </button>
          <button onClick={handlePreview} className={`px-3 py-1.5 text-sm ${activeTab === 'preview' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
            {t('builder.tabPreview')}
          </button>
        </div>

        {/* Placeholder picker */}
        <div className="relative">
          <button onClick={() => setShowPh((v) => !v)} className="rounded border border-purple-300 dark:border-purple-700 px-3 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20">
            {'{{\u2026}}'} {t('builder.insertPlaceholder')}
          </button>
          {showPh && (
            <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
              <div className="p-2 max-h-60 overflow-y-auto">
                {PLACEHOLDER_GROUPS.map((g) => (
                  <div key={g.label} className="mb-2">
                    <div className="px-2 py-0.5 text-xs font-semibold text-gray-400 uppercase">{g.label}</div>
                    {g.vars.map((v) => (
                      <button key={v} onClick={() => { insertPlaceholder(v); setShowPh(false); }} className="block w-full text-left px-2 py-1 text-xs font-mono text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button onClick={() => fileInputRef.current?.click()} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
          {t('builder.uploadFile')}
        </button>
        <input ref={fileInputRef} type="file" accept=".html,.mjml,.txt" onChange={handleFileUpload} className="hidden" />

        <div className="flex-1" />

        <button onClick={handleSave} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? t('builder.saving') : t('builder.save')}
        </button>
      </div>

      {saveMsg && (
        <p className={`mb-2 text-xs ${saveMsg.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>{saveMsg.text}</p>
      )}

      {/* Code editor — addon replaces textarea with visual builder via slot */}
      {activeTab === 'code' && (
        builderAddonActive ? (
          isContentReady ? (
            <Slot
              name="email-template-builder"
              context={{ templateId: id, mjmlContent, setMjmlContent, onSave: handleSave }}
            />
          ) : (
            <div
              className="rounded-lg border border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-400 text-sm"
              style={{ height: 600 }}
            >
              Loading template…
            </div>
          )
        ) : (
          <textarea
            id="mjml-editor"
            value={mjmlContent}
            onChange={(e) => setMjmlContent(e.target.value)}
            spellCheck={false}
            className="w-full h-[600px] rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 font-mono text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
        )
      )}

      {/* Preview iframe */}
      {activeTab === 'preview' && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden" style={{ height: 600 }}>
          <iframe srcDoc={previewHtml || '<p style="padding:20px;color:#666;">Loading preview...</p>'} className="h-full w-full border-0 bg-white" title="Email preview" sandbox="allow-same-origin" />
        </div>
      )}
    </div>
  );
}
