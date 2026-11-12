/**
 * @fileoverview Flows that ship with OpenTyme, as starting points.
 *
 * A template is copied into a new draft; the copy still needs what only the
 * user can choose (above all the email templates), so it publishes once those
 * are filled in.
 *
 * @module services/workflow/workflow-templates
 */

import type { WorkflowGraph, WorkflowTemplate } from '../../types/workflow.types';

type Lang = 'de' | 'en';

const TEXT = {
  de: {
    name: 'Stundennachweis mit Unterschrift',
    description:
      'Für Kunden über Vermittler: Stundennachweis ohne Beträge zur Unterschrift schicken, den unterschriebenen Nachweis hochladen, dann die Rechnung mit Nachweis versenden.',
    start: 'Start',
    summarize: 'Stunden zusammenzählen',
    gateway: 'Stunden erfasst?',
    yes: 'ja',
    no: 'nein',
    sheet: 'Stundennachweis ohne € erzeugen',
    mailSheet: 'Nachweis an Kunde zur Unterschrift',
    upload: 'Unterschriebenen Nachweis hochladen',
    uploadTitle: 'Unterschriebenen Stundennachweis hochladen: {{client.name}}, {{period.label}}',
    uploadDescription: 'Der Kunde schickt den unterschriebenen Nachweis zurück. Laden Sie ihn hier hoch, dann geht es mit der Rechnung weiter.',
    afterDays: 'nach 5 Tagen',
    remind: 'Erinnerung an Kunde senden',
    invoice: 'Rechnungsentwurf aus Zeiteinträgen',
    link: 'Nachweis der Rechnung zuordnen',
    review: 'Rechnung prüfen',
    reviewTitle: 'Rechnung {{steps.n_invoice.invoiceNumber}} prüfen: {{client.name}}',
    reviewDescription: 'Sehen Sie sich den Entwurf an. Mit „Erledigt“ geht die Rechnungsmail in die Freigabe.',
    mailInvoice: 'Rechnungsmail mit Rechnung + Nachweis',
    end: 'Ende',
    endResult: 'Rechnung {{steps.n_invoice.invoiceNumber}} versendet',
    endEmpty: 'Ende: nichts abzurechnen',
    endEmptyResult: 'Keine Stunden im Zeitraum {{period.label}}',
  },
  en: {
    name: 'Signed timesheet, then invoice',
    description:
      'For clients won through an agency: send the timesheet without amounts for signature, upload the signed sheet, then send the invoice with the sheet attached.',
    start: 'Start',
    summarize: 'Add up the hours',
    gateway: 'Any hours logged?',
    yes: 'yes',
    no: 'no',
    sheet: 'Create timesheet without amounts',
    mailSheet: 'Send timesheet for signature',
    upload: 'Upload the signed timesheet',
    uploadTitle: 'Upload the signed timesheet: {{client.name}}, {{period.label}}',
    uploadDescription: 'The client returns the signed timesheet. Upload it here to continue with the invoice.',
    afterDays: 'after 5 days',
    remind: 'Remind the client',
    invoice: 'Draft invoice from time entries',
    link: 'Tie the timesheet to the invoice',
    review: 'Check the invoice',
    reviewTitle: 'Check invoice {{steps.n_invoice.invoiceNumber}}: {{client.name}}',
    reviewDescription: 'Look at the draft. "Done" sends the invoice email on for approval.',
    mailInvoice: 'Invoice email with invoice + timesheet',
    end: 'End',
    endResult: 'Invoice {{steps.n_invoice.invoiceNumber}} sent',
    endEmpty: 'End: nothing to bill',
    endEmptyResult: 'No hours in {{period.label}}',
  },
} as const;

function signedTimesheetGraph(lang: Lang): WorkflowGraph {
  const t = TEXT[lang];
  const period = { clientId: { $ref: 'client.id' }, start: { $ref: 'period.start' }, end: { $ref: 'period.end' } };
  return {
    nodes: [
      { id: 'n_start', type: 'start', position: { x: 0, y: 120 }, data: { label: t.start, trigger: 'manual' } },
      { id: 'n_sum', type: 'action', position: { x: 140, y: 100 }, data: { label: t.summarize, action: 'time.summarize', mode: 'auto', input: period } },
      { id: 'n_gw', type: 'gateway', position: { x: 400, y: 112 }, data: { label: t.gateway } },
      {
        id: 'n_sheet',
        type: 'action',
        position: { x: 540, y: 100 },
        data: { label: t.sheet, action: 'timesheet.generate', mode: 'auto', input: { ...period, hidePrices: true, lang } },
      },
      {
        id: 'n_mail_sheet',
        type: 'action',
        position: { x: 800, y: 100 },
        data: {
          label: t.mailSheet,
          action: 'email.send',
          mode: 'approval',
          input: { to: { $ref: 'client.email' }, templateId: '', attachDocumentIds: [{ $ref: 'steps.n_sheet.documentId' }], markInvoiceSent: false },
        },
      },
      {
        id: 'n_upload',
        type: 'task',
        position: { x: 1060, y: 100 },
        data: { label: t.upload, kind: 'upload', title: t.uploadTitle, description: t.uploadDescription, documentType: 'timesheet_signed', dueInDays: 5 },
      },
      {
        id: 'n_remind',
        type: 'action',
        position: { x: 1060, y: 300 },
        data: {
          label: t.remind,
          action: 'email.send',
          mode: 'auto',
          input: { to: { $ref: 'client.email' }, templateId: '', attachDocumentIds: [{ $ref: 'steps.n_sheet.documentId' }], markInvoiceSent: false },
        },
      },
      { id: 'n_invoice', type: 'action', position: { x: 1320, y: 100 }, data: { label: t.invoice, action: 'invoice.createDraft', mode: 'auto', input: period } },
      {
        id: 'n_link',
        type: 'action',
        position: { x: 1580, y: 100 },
        data: {
          label: t.link,
          action: 'document.link',
          mode: 'auto',
          input: { documentId: { $ref: 'steps.n_upload.documentId' }, invoiceId: { $ref: 'steps.n_invoice.invoiceId' } },
        },
      },
      {
        id: 'n_review',
        type: 'task',
        position: { x: 1840, y: 100 },
        data: { label: t.review, kind: 'confirm', title: t.reviewTitle, description: t.reviewDescription },
      },
      {
        id: 'n_mail_invoice',
        type: 'action',
        position: { x: 2100, y: 100 },
        data: {
          label: t.mailInvoice,
          action: 'email.send',
          mode: 'approval',
          input: {
            to: { $ref: 'client.invoice_email' },
            templateId: '',
            attachInvoiceId: { $ref: 'steps.n_invoice.invoiceId' },
            attachDocumentIds: [{ $ref: 'steps.n_upload.documentId' }],
            markInvoiceSent: true,
          },
        },
      },
      { id: 'n_end', type: 'end', position: { x: 2360, y: 120 }, data: { label: t.end, result: t.endResult } },
      { id: 'n_end_empty', type: 'end', position: { x: 400, y: 320 }, data: { label: t.endEmpty, result: t.endEmptyResult } },
    ],
    edges: [
      { id: 'e_start', source: 'n_start', target: 'n_sum' },
      { id: 'e_sum', source: 'n_sum', target: 'n_gw' },
      {
        id: 'e_yes',
        source: 'n_gw',
        target: 'n_sheet',
        label: t.yes,
        condition: { match: 'all', rules: [{ left: 'steps.n_sum.totalHours', op: 'gt', right: 0 }] },
      },
      { id: 'e_no', source: 'n_gw', target: 'n_end_empty', label: t.no },
      { id: 'e_sheet', source: 'n_sheet', target: 'n_mail_sheet' },
      { id: 'e_mail_sheet', source: 'n_mail_sheet', target: 'n_upload' },
      { id: 'e_upload', source: 'n_upload', target: 'n_invoice' },
      { id: 'e_timeout', source: 'n_upload', target: 'n_remind', sourceHandle: 'timeout', label: t.afterDays },
      { id: 'e_remind', source: 'n_remind', target: 'n_upload' },
      { id: 'e_invoice', source: 'n_invoice', target: 'n_link' },
      { id: 'e_link', source: 'n_link', target: 'n_review' },
      { id: 'e_review', source: 'n_review', target: 'n_mail_invoice' },
      { id: 'e_mail_invoice', source: 'n_mail_invoice', target: 'n_end' },
    ],
  };
}

export function listWorkflowTemplates(lang: string | undefined): WorkflowTemplate[] {
  const language: Lang = lang?.toLowerCase().startsWith('de') ? 'de' : 'en';
  return [
    {
      key: 'signed-timesheet-invoice',
      name: TEXT[language].name,
      description: TEXT[language].description,
      subject_type: 'client',
      graph: signedTimesheetGraph(language),
    },
  ];
}

export function getWorkflowTemplate(key: string, lang: string | undefined): WorkflowTemplate | undefined {
  return listWorkflowTemplates(lang).find((template) => template.key === key);
}
