/**
 * Reusable modal for sending an email using an MJML template.
 * Supports configurable PDF attachments (invoice PDFs, report PDFs).
 */

import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
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
  title = 'Send Email',
  onSent,
}: SendEmailModalProps) {
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
      setPreviewHtml('<p style="color:red">Preview unavailable.</p>');
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
    if (!to.trim()) { setErrorMsg('Please enter a recipient email address.'); return; }
    if (!selectedTemplateId) { setErrorMsg('Please select a template.'); return; }

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
      setSuccessMsg('Email sent successfully.');
      onSent?.();
      setTimeout(() => { setSuccessMsg(null); onClose(); }, 1500);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message ?? err?.message ?? 'Failed to send email.');
    }
  };

  const noTemplates = !loadingTemplates && filtered.length === 0;

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      size="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="outline" size="sm" onClick={onClose} disabled={sendMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSend}
            isLoading={sendMutation.isPending}
            disabled={noTemplates}
          >
            Send Email
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Recipient */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To</label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>

        {/* Template selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template</label>
          {loadingTemplates ? (
            <div className="text-sm text-gray-400">Loading templates…</div>
          ) : noTemplates ? (
            <Alert
              type="warning"
              message={
                defaultTemplateCategory
                  ? `No "${defaultTemplateCategory}" templates found. Create one in Config → Email Templates.`
                  : 'No email templates found. Create one in Config → Email Templates.'
              }
            />
          ) : (
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              {filtered.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}{tpl.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Preview toggle */}
        {selectedTemplateId && !noTemplates && (
          <button
            type="button"
            onClick={handlePreviewToggle}
            className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
          >
            {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
        )}

        {/* Preview iframe */}
        {showPreview && (
          <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
            {loadingPreview ? (
              <div className="h-40 flex items-center justify-center text-sm text-gray-400">Loading preview…</div>
            ) : (
              <iframe
                srcDoc={previewHtml}
                title="Email preview"
                className="w-full h-64 bg-white"
                sandbox="allow-same-origin"
              />
            )}
          </div>
        )}

        {/* Attachments */}
        {attachmentOptions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Attachments
            </label>
            <div className="space-y-2">
              {attachmentOptions.map((opt, i) => (
                <label key={i} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkedAttachments.has(i)}
                    onChange={() => toggleAttachment(i)}
                    className="rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                  {opt.type === 'report' && opt.dateFrom && opt.dateTo && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      ({opt.dateFrom} – {opt.dateTo})
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Status / error */}
        {errorMsg && <Alert type="error" message={errorMsg} />}
        {successMsg && <Alert type="success" message={successMsg} />}
      </div>
    </Modal>
  );
}
