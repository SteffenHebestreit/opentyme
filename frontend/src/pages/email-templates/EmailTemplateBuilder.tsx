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
import { ArrowLeft, Braces, Code2, Eye, Mail, Save, Upload } from 'lucide-react';
import { Slot } from '@/plugins/slots';
import { useSlotProvider } from '@/plugins/slots/SlotProvider';
import { useEmailTemplate, useCreateEmailTemplate, useUpdateEmailTemplate } from '@/api/hooks/useEmailTemplates';
import { previewRawMjml } from '@/api/services/email-template.service';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { Tabs } from '@/components/common/Tabs';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { fieldClasses, fieldLabelClass } from '@/components/forms/fieldStyles';
import { usePresence } from '@/hooks/ui/usePresence';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';

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
  const placeholderMenuRef = useRef<HTMLDivElement>(null);

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
  // Set after a save attempt with missing fields, to highlight them
  const [showValidation, setShowValidation] = useState(false);
  const [showPh, setShowPh] = useState(false);
  const placeholderMenu = usePresence(showPh, 140);

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

  // Close the placeholder menu on outside click / Escape
  useEffect(() => {
    if (!showPh) return;
    const onPointer = (event: MouseEvent) => {
      if (placeholderMenuRef.current && !placeholderMenuRef.current.contains(event.target as Node)) setShowPh(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setShowPh(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showPh]);

  const handleSave = async () => {
    if (!name || !subject) {
      setShowValidation(true);
      toast.error(t('builder.validationError'));
      return;
    }
    setSaving(true);
    try {
      const payload = { name, subject, category, language, is_default: isDefault, mjml_content: mjmlContent };
      if (isNew) {
        const created = await createTemplate.mutateAsync(payload);
        toast.success(t('builder.saveSuccess'));
        navigate(`/email-templates/${created.id}`, { replace: true });
      } else {
        await updateTemplate.mutateAsync(payload);
        toast.success(t('builder.saveSuccess'));
      }
    } catch {
      toast.error(t('builder.saveError'));
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
      setPreviewHtml(`<p style="padding:20px;color:#e00;font-family:sans-serif;">${t('builder.previewError')}</p>`);
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
    { label: t('builder.groups.company'), vars: ['company.name', 'company.email', 'company.phone', 'company.address', 'company.logo_url'] },
    { label: t('builder.groups.invoice'), vars: ['invoice.number', 'invoice.date', 'invoice.due_date', 'invoice.total', 'invoice.currency'] },
    { label: t('builder.groups.client'), vars: ['client.name', 'client.email', 'client.address'] },
  ];

  const nameMissing = showValidation && !name;
  const subjectMissing = showValidation && !subject;

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/config/email-templates')}
        className="mb-4 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-gray-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('builder.back')}
      </button>

      <PageHeader
        title={isNew ? t('builder.newTitle') : t('builder.editTitle')}
        subtitle={t('builder.subtitle')}
        icon={Mail}
        actions={
          <Button
            type="button"
            onClick={handleSave}
            isLoading={saving}
            leftIcon={<Save className="h-4 w-4" aria-hidden="true" />}
          >
            {saving ? t('builder.saving') : t('builder.save')}
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Meta fields */}
        <section className="surface p-5 sm:p-6" aria-labelledby="tpl-settings-heading">
          <h2 id="tpl-settings-heading" className="section-title mb-4">
            {t('builder.settings')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <label htmlFor="tpl-name" className={fieldLabelClass(nameMissing)}>
                {t('builder.name')}
              </label>
              <input
                id="tpl-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('builder.namePlaceholder')}
                aria-invalid={nameMissing || undefined}
                className={fieldClasses({ error: nameMissing })}
              />
            </div>
            <div className="lg:col-span-7">
              <label htmlFor="tpl-subject" className={fieldLabelClass(subjectMissing)}>
                {t('builder.subject')}
              </label>
              <input
                id="tpl-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('builder.subjectPlaceholder')}
                aria-invalid={subjectMissing || undefined}
                className={fieldClasses({ error: subjectMissing })}
              />
            </div>
            <div className="lg:col-span-3">
              <label htmlFor="tpl-category" className={fieldLabelClass()}>
                {t('builder.category')}
              </label>
              <select
                id="tpl-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={fieldClasses()}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`categories.${c}`, c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label htmlFor="tpl-language" className={fieldLabelClass()}>
                {t('builder.language')}
              </label>
              <select
                id="tpl-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className={fieldClasses()}
              >
                <option value="de">DE</option>
                <option value="en">EN</option>
              </select>
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-7">
              <label className="flex h-10 cursor-pointer items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900"
                />
                {t('builder.default')}
              </label>
            </div>
          </div>
        </section>

        {/* Editor */}
        <section className="surface" aria-label={t('builder.content')}>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <Tabs
              variant="pills"
              tabs={[
                { id: 'code', label: t('builder.tabCode'), icon: Code2 },
                { id: 'preview', label: t('builder.tabPreview'), icon: Eye },
              ]}
              activeTab={activeTab}
              onChange={(tab) => (tab === 'preview' ? void handlePreview() : setActiveTab('code'))}
            />

            <div className="flex-1" />

            {/* Placeholder picker */}
            <div className="relative" ref={placeholderMenuRef}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPh((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={showPh}
                leftIcon={<Braces className="h-4 w-4" aria-hidden="true" />}
              >
                {t('builder.insertPlaceholder')}
              </Button>
              {placeholderMenu.mounted && (
                <div
                  role="menu"
                  className={cn(
                    'absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-xl border border-gray-200 bg-white p-1.5 shadow-overlay sm:left-0 sm:right-auto sm:origin-top-left',
                    'dark:border-gray-800 dark:bg-gray-900',
                    placeholderMenu.closing ? 'animate-scale-out' : 'animate-scale-in'
                  )}
                >
                  <div className="max-h-72 overflow-y-auto">
                    {PLACEHOLDER_GROUPS.map((g) => (
                      <div key={g.label} className="py-1">
                        <div className="eyebrow px-2 pb-1 pt-1 text-[11px]">{g.label}</div>
                        {g.vars.map((v) => (
                          <button
                            key={v}
                            type="button"
                            role="menuitem"
                            onClick={() => { insertPlaceholder(v); setShowPh(false); }}
                            className="block w-full rounded-md px-2 py-1.5 text-left font-mono text-xs text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white"
                          >
                            {`{{${v}}}`}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              leftIcon={<Upload className="h-4 w-4" aria-hidden="true" />}
            >
              {t('builder.uploadFile')}
            </Button>
            <input ref={fileInputRef} type="file" accept=".html,.mjml,.txt" onChange={handleFileUpload} className="hidden" />
          </div>

          <div id={`${activeTab}-panel`} role="tabpanel" aria-labelledby={`${activeTab}-tab`} className="p-3 sm:p-4">
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
                    className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-200 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400"
                    style={{ height: 600 }}
                  >
                    <LoadingSpinner />
                    {t('builder.loadingTemplate')}
                  </div>
                )
              ) : (
                <textarea
                  id="mjml-editor"
                  value={mjmlContent}
                  onChange={(e) => setMjmlContent(e.target.value)}
                  spellCheck={false}
                  aria-label={t('builder.tabCode')}
                  className="block h-[600px] w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-[13px] leading-relaxed text-gray-900 transition-[border-color,box-shadow] focus:border-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-500/15 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-purple-400 dark:focus:ring-purple-400/15"
                />
              )
            )}

            {/* Preview iframe */}
            {activeTab === 'preview' && (
              <div className="animate-fade-in overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800" style={{ height: 600 }}>
                <iframe
                  srcDoc={previewHtml || `<p style="padding:20px;color:#666;font-family:sans-serif;">${t('builder.loadingPreview')}</p>`}
                  className="h-full w-full border-0 bg-white"
                  title={t('builder.previewTitle')}
                  sandbox="allow-same-origin"
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
