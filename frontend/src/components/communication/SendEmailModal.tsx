/**
 * Reusable modal for sending an email using an MJML template.
 * Supports configurable PDF attachments (invoice PDFs, report PDFs).
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Mail, Paperclip, Send } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { SkeletonItem } from '../common/Skeleton';
import { fieldClasses, fieldLabelClass } from '../forms/fieldStyles';
import { useEmailTemplates } from '../../api/hooks/useEmailTemplates';
import { useSendEmail } from '../../api/hooks/useEmailSend';
import type { AttachmentOption, AttachmentSpec } from '../../api/services/email-send.service';
import type { EmailTemplate } from '../../api/services/email-template.service';
import apiClient from '../../api/services/client';

export type { AttachmentOption };

export interface SendEmailModalProps {
  open: boolean;
  onClose: () => void;
  defaultTo?: string;
  defaultTemplateCategory?: string;
  variables?: Record<string, string>;
  /**
   * List of attachable PDFs shown as checkboxes.
   * Each option with defaultChecked=true is pre-selected.
   */
  attachmentOptions?: AttachmentOption[];
  title?: string;
  onSent?: () => void;
}

export function SendEmailModal({
  open,
  onClose,
  defaultTo = '',
  defaultTemplateCategory,
  variables,
  attachmentOptions = [],
  title,
  onSent,
}: SendEmailModalProps) {
  const { t } = useTranslation('email-templates');
  const { data: templates = [], isLoading: loadingTemplates } = useEmailTemplates();
  const sendMutation = useSendEmail();

  const [to, setTo] = useState(defaultTo);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  // Track which attachment options are checked (by index)
  const [checkedAttachments, setCheckedAttachments] = useState<Set<number>>(new Set());

  // Filter templates by category if given
  const filtered: EmailTemplate[] = defaultTemplateCategory
    ? templates.filter((t) => t.category === defaultTemplateCategory)
    : templates;

  // Auto-select default template for the category, or first available
  useEffect(() => {
    if (!open || filtered.length === 0) return;
    const def = filtered.find((t) => t.is_default) ?? filtered[0];
    setSelectedTemplateId(def.id);
  }, [open, filtered.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setTo(defaultTo);
      setShowPreview(false);
      setPreviewHtml('');
      setErrorMsg(null);
      setSuccessMsg(null);
      sendMutation.reset();
      // Reset checkboxes to defaults
      const defaults = new Set<number>();
      attachmentOptions.forEach((opt, i) => { if (opt.defaultChecked !== false) defaults.add(i); });
      setCheckedAttachments(defaults);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAttachment = (index: number) => {
    setCheckedAttachments((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const loadPreview = async (templateId: string) => {
    if (!templateId) return;
    setLoadingPreview(true);
    try {
      const res = await apiClient.post(`/email-templates/${templateId}/preview`, {
        variables: variables ?? {},
      });
      setPreviewHtml(res.data.html ?? '');
    } catch {
      setPreviewHtml(`<p style="padding:20px;color:#e00;font-family:sans-serif;">${t('send.previewUnavailable')}</p>`);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handlePreviewToggle = () => {
    const next = !showPreview;
    setShowPreview(next);
    if (next && selectedTemplateId) void loadPreview(selectedTemplateId);
  };

  const handleTemplateChange = (id: string) => {
    setSelectedTemplateId(id);
    if (showPreview && id) void loadPreview(id);
  };

  const handleSend = async () => {
    setErrorMsg(null);
    if (!to.trim()) { setErrorMsg(t('send.errors.recipientRequired')); return; }
    if (!selectedTemplateId) { setErrorMsg(t('send.errors.templateRequired')); return; }

    // Build the attachments array from checked options
    const attachments: AttachmentSpec[] = attachmentOptions
      .filter((_, i) => checkedAttachments.has(i))
      .map(({ label: _label, defaultChecked: _dc, ...spec }) => spec); // strip UI-only fields

    try {
      await sendMutation.mutateAsync({
        to: to.trim(),
        templateId: selectedTemplateId,
        variables,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setSuccessMsg(t('send.success'));
      onSent?.();
      setTimeout(() => { setSuccessMsg(null); onClose(); }, 1500);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message ?? err?.message ?? t('send.errors.sendFailed'));
    }
  };

  const noTemplates = !loadingTemplates && filtered.length === 0;

  return (
    <Modal
      open={open}
      title={title ?? t('sendModal.title')}
      description={t('sendModal.description')}
      icon={<Mail className="h-5 w-5" aria-hidden="true" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={sendMutation.isPending}>
            {t('sendModal.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSend}
            isLoading={sendMutation.isPending}
            disabled={noTemplates}
            leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
          >
            {t('send.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Recipient */}
        <div>
          <label htmlFor="send-email-to" className={fieldLabelClass()}>{t('send.to')}</label>
          <input
            id="send-email-to"
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t('send.toPlaceholder')}
            className={fieldClasses()}
          />
        </div>

        {/* Template selector */}
        <div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="send-email-template" className={fieldLabelClass()}>{t('send.template')}</label>
            {/* Preview toggle */}
            {selectedTemplateId && !noTemplates && (
              <button
                type="button"
                onClick={handlePreviewToggle}
                aria-expanded={showPreview}
                className="mb-1.5 inline-flex items-center gap-1.5 rounded text-xs font-medium text-purple-600 transition-colors hover:text-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-purple-400 dark:hover:text-purple-300"
              >
                {showPreview ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                {showPreview ? t('send.hidePreview') : t('send.showPreview')}
              </button>
            )}
          </div>
          {loadingTemplates ? (
            <SkeletonItem className="h-10 w-full rounded-lg" />
          ) : noTemplates ? (
            <Alert
              type="warning"
              message={
                defaultTemplateCategory
                  ? t('sendModal.noTemplatesCategory', { category: defaultTemplateCategory })
                  : t('sendModal.noTemplates')
              }
            />
          ) : (
            <select
              id="send-email-template"
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className={fieldClasses()}
            >
              {filtered.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}{tpl.is_default ? ` ${t('sendModal.defaultSuffix')}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Preview iframe */}
        {showPreview && (
          <div className="animate-fade-in overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800">
            {loadingPreview ? (
              <div className="flex h-40 items-center justify-center text-sm text-gray-500">{t('send.loadingPreview')}</div>
            ) : (
              <iframe
                srcDoc={previewHtml}
                title={t('send.previewTitle')}
                className="h-64 w-full bg-white"
                sandbox="allow-same-origin"
              />
            )}
          </div>
        )}

        {/* Attachments */}
        {attachmentOptions.length > 0 && (
          <fieldset>
            <legend className={fieldLabelClass()}>{t('send.attachments')}</legend>
            <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
              {attachmentOptions.map((opt, i) => (
                <label
                  key={i}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                >
                  <input
                    type="checkbox"
                    checked={checkedAttachments.has(i)}
                    onChange={() => toggleAttachment(i)}
                    className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900"
                  />
                  <Paperclip className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                  {opt.type === 'report' && opt.dateFrom && opt.dateTo && (
                    <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      {opt.dateFrom} – {opt.dateTo}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {/* Status / error */}
        {errorMsg && <Alert type="error" message={errorMsg} />}
        {successMsg && <Alert type="success" message={successMsg} />}
      </div>
    </Modal>
  );
}
