/**
 * @fileoverview Client documents — the contracts and other paperwork signed
 * with a customer, and where each one stands.
 *
 * What a stored contract has to tell you at a glance is whether it is still
 * running and when it ends, so every card leads with that status, and contracts
 * that are about to run out are pulled to the top with a one-click "Extend".
 *
 * Extending a contract is usually also when the hourly rate changes, so the
 * extension form can set the new rate for the contract's project in the same
 * step — with the date it takes effect, and a preview of what that touches.
 *
 * Views (one modal, the save button always in the footer):
 * - list: documents grouped into version chains, newest version on top
 * - upload / new version / extend / edit: one form, pre-filled per case
 *
 * Opened from {@link ClientTable}; {@link ClientList} owns the mutations.
 *
 * @module components/business/clients/ClientDocumentsModal
 */

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  CalendarClock,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  History,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Client, Project } from '../../../api/types';
import {
  CLIENT_DOCUMENT_ACCEPT,
  CLIENT_DOCUMENT_TYPES,
  ClientDocument,
  ClientDocumentType,
  ClientDocumentUpdatePayload,
  ClientDocumentUploadPayload,
  downloadClientDocument,
  validateClientDocumentFile,
} from '../../../api/services/client-document.service';
import type { RateImpact, SavedProjectRate } from '../../../api/services/project-rate.service';
import { useClientDocuments } from '../../../hooks/api/useClientDocuments';
import { useProjects } from '../../../hooks/api/useProjects';
import { Alert } from '../../common/Alert';
import { Button } from '../../common/Button';
import { Dropdown } from '../../common/Dropdown';
import { Input, Select, Textarea } from '../../forms';
import { FileDropZone } from '../../forms/FileDropZone';
import { formatFileSize } from '../../../utils/fileSize';
import { Modal } from '../../ui/Modal';
import { EffectiveDateField, RateImpactPanel } from '../projects/RateChange';
import { addDaysYmd, addMonthsYmd, formatYmd } from '../../../utils/date';
import { ContractStatus, contractStatus, contractStatusRank, titleFromFilename } from '../../../utils/contractStatus';
import { extractErrorMessage } from '../../../utils/error';

/** A new rate for the contract's project, set together with the contract. */
export interface ContractRateChange {
  projectId: string;
  hourly_rate: number;
  valid_from: string;
  apply_to_existing: boolean;
  note?: string;
  /** A period already starting that day, replaced instead of conflicting. */
  replaceRateId?: string;
  /** The project's currency, for the confirmation message. */
  currency?: string;
}

interface ClientDocumentsModalProps {
  open: boolean;
  client: Client;
  onClose: () => void;
  onUpload: (payload: ClientDocumentUploadPayload) => Promise<boolean>;
  onUpdate: (documentId: string, payload: ClientDocumentUpdatePayload) => Promise<boolean>;
  /** Deletes a document; the modal has already confirmed inline. */
  onDelete: (document: ClientDocument) => Promise<boolean>;
  /** Stores a new hourly rate set as part of a contract (extension). */
  onRateChange: (change: ContractRateChange) => Promise<SavedProjectRate | null>;
  isUploading: boolean;
  isSaving: boolean;
  deletingId?: string | null;
  error?: string | null;
  successMessage?: string | null;
  onDismissError: () => void;
  onDismissSuccess: () => void;
}

/** One version chain: the newest document plus its superseded predecessors. */
interface DocumentChain {
  current: ClientDocument;
  /** Superseded versions, newest first. */
  history: ClientDocument[];
}

type FormMode = 'upload' | 'version' | 'extend' | 'edit';
type View = { kind: 'list' } | { kind: 'form'; mode: FormMode; source: ClientDocument | null; file: File | null };

const FORM_ID = 'client-document-form';

/** Document types that have a term worth extending. */
const EXTENDABLE_TYPES = new Set(['contract', 'amendment', 'order']);

/** Opens in the browser instead of downloading. */
const isPreviewable = (mimetype: string | null) =>
  Boolean(mimetype && (mimetype === 'application/pdf' || mimetype.startsWith('image/')));

/**
 * Groups a flat document list into version chains.
 *
 * Following `supersedes_document_id` from every root gives one chain per
 * logical document. Anything not reached that way (a predecessor filtered out,
 * or legacy branched data) becomes its own chain — showing history oddly is
 * acceptable, hiding a signed document is not.
 */
const buildDocumentChains = (documents: ClientDocument[]): DocumentChain[] => {
  const byId = new Map(documents.map((document) => [document.id, document]));
  const successors = new Map<string, ClientDocument>();
  documents.forEach((document) => {
    if (document.supersedes_document_id && byId.has(document.supersedes_document_id)) {
      successors.set(document.supersedes_document_id, document);
    }
  });

  const roots = documents.filter(
    (document) => !document.supersedes_document_id || !byId.has(document.supersedes_document_id)
  );

  const chains = roots.map((root) => {
    const ordered: ClientDocument[] = [root];
    const seen = new Set<string>([root.id]);
    let next = successors.get(root.id);
    while (next && !seen.has(next.id)) {
      ordered.push(next);
      seen.add(next.id);
      next = successors.get(next.id);
    }
    return { current: ordered[ordered.length - 1], history: ordered.slice(0, -1).reverse() };
  });

  const placed = new Set(chains.flatMap((chain) => [chain.current.id, ...chain.history.map((d) => d.id)]));
  documents.forEach((document) => {
    if (!placed.has(document.id)) {
      chains.push({ current: document, history: [] });
      placed.add(document.id);
    }
  });

  return chains;
};

const statusOf = (document: ClientDocument): ContractStatus =>
  contractStatus(document.valid_from, document.valid_until);

/** Colour-coded term status: running, ends soon, ended, not yet started. */
const StatusBadge: FC<{ status: ContractStatus; document: ClientDocument }> = ({ status, document }) => {
  const { t, i18n } = useTranslation('clients');
  if (!status) return null;

  const styles: Record<NonNullable<ContractStatus>['kind'], string> = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    expiring: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    expired: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    upcoming: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  };

  let label: string;
  switch (status.kind) {
    case 'expiring':
      label =
        status.days === 0
          ? t('documents.status.expiresToday')
          : t('documents.status.expiresIn', { count: status.days });
      break;
    case 'expired':
      label = t('documents.status.expired', { date: formatYmd(document.valid_until, i18n.language) });
      break;
    case 'upcoming':
      label = t('documents.status.upcoming', { date: formatYmd(document.valid_from, i18n.language) });
      break;
    default:
      label = t('documents.status.active');
  }

  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', styles[status.kind])}>
      {status.kind === 'expiring' || status.kind === 'expired' ? (
        <CalendarClock className="h-3 w-3" aria-hidden="true" />
      ) : null}
      {label}
    </span>
  );
};

/** "Vertrag · Website-Relaunch · gültig 01.04.2026 – 31.10.2026 · unterzeichnet 15.03.2026" */
const DocumentMeta: FC<{ document: ClientDocument }> = ({ document }) => {
  const { t, i18n } = useTranslation('clients');
  const lng = i18n.language;
  const parts: string[] = [
    t(`documents.types.${document.document_type}`, { defaultValue: document.document_type }),
    document.project_name ?? t('documents.noProject'),
  ];
  if (document.valid_from || document.valid_until) {
    parts.push(
      document.valid_from && document.valid_until
        ? t('documents.term.range', { from: formatYmd(document.valid_from, lng), until: formatYmd(document.valid_until, lng) })
        : document.valid_from
          ? t('documents.term.from', { from: formatYmd(document.valid_from, lng) })
          : t('documents.term.until', { until: formatYmd(document.valid_until, lng) })
    );
  }
  if (document.signed_at) {
    parts.push(t('documents.term.signed', { date: formatYmd(document.signed_at, lng) }));
  }

  return (
    <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400">
      {parts.map((part, index) => (
        <span key={index} className="whitespace-nowrap">
          {index > 0 ? <span className="mr-2 text-gray-300 dark:text-gray-600">·</span> : null}
          {part}
        </span>
      ))}
    </p>
  );
};

/**
 * The form behind upload, new version, extension and metadata edit.
 *
 * Keeps its own state (the file comes from drag & drop as often as from the
 * picker, which react-hook-form's FileList binding does not cover) and is
 * submitted by the modal footer through `form={FORM_ID}`.
 */
const DocumentForm: FC<{
  mode: FormMode;
  source: ClientDocument | null;
  initialFile: File | null;
  projects: Project[];
  defaultProjectId: string;
  onUpload: (payload: ClientDocumentUploadPayload) => Promise<boolean>;
  onUpdate: (documentId: string, payload: ClientDocumentUpdatePayload) => Promise<boolean>;
  onRateChange: (change: ContractRateChange) => Promise<SavedProjectRate | null>;
  onDone: () => void;
  onBusyChange: (busy: boolean) => void;
}> = ({ mode, source, initialFile, projects, defaultProjectId, onUpload, onUpdate, onRateChange, onDone, onBusyChange }) => {
  const { t, i18n } = useTranslation('clients');
  const lng = i18n.language;
  const needsFile = mode !== 'edit';

  const [file, setFile] = useState<File | null>(initialFile);
  const [title, setTitle] = useState(() =>
    source ? source.title : initialFile ? titleFromFilename(initialFile.name) : ''
  );
  const [titleTouched, setTitleTouched] = useState(Boolean(source));
  const [documentType, setDocumentType] = useState<ClientDocumentType>(
    (source?.document_type as ClientDocumentType) ?? 'contract'
  );
  const [projectId, setProjectId] = useState(source?.project_id ?? defaultProjectId);
  const [signedAt, setSignedAt] = useState(mode === 'edit' ? source?.signed_at?.slice(0, 10) ?? '' : '');
  const [validFrom, setValidFrom] = useState(() => {
    if (mode === 'edit') return source?.valid_from?.slice(0, 10) ?? '';
    // An extension starts the day after the current term ends.
    if (mode === 'extend' && source?.valid_until) return addDaysYmd(source.valid_until.slice(0, 10), 1);
    return '';
  });
  const [validUntil, setValidUntil] = useState(mode === 'edit' ? source?.valid_until?.slice(0, 10) ?? '' : '');
  const [notes, setNotes] = useState(mode === 'upload' ? '' : source?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  // Rate change together with the contract.
  const project = projects.find((candidate) => candidate.id === projectId) ?? null;
  const projectBillsHourly = Boolean(project && (project.rate_type === 'hourly' || project.hourly_rate != null));
  const [rateEnabled, setRateEnabled] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [rateValidFrom, setRateValidFrom] = useState('');
  const [rateDateTouched, setRateDateTouched] = useState(false);
  const [applyToExisting, setApplyToExisting] = useState(true);
  const [impact, setImpact] = useState<RateImpact | null>(null);
  const handleImpact = useCallback((next: RateImpact | null) => setImpact(next), []);

  // Until the user picks a different day, the new rate starts with the contract.
  useEffect(() => {
    if (!rateDateTouched) setRateValidFrom(validFrom);
  }, [validFrom, rateDateTouched]);

  const chooseFile = (picked: File | null) => {
    setFile(picked);
    setErrors((current) => ({ ...current, file: undefined }));
    if (picked && !titleTouched) {
      setTitle(titleFromFilename(picked.name));
      setErrors((current) => ({ ...current, title: undefined }));
    }
  };

  const parsedRate = rateInput.trim() === '' ? null : Number(rateInput.replace(',', '.'));

  const validate = () => {
    const next: Record<string, string | undefined> = {};
    if (needsFile) {
      if (!file) next.file = t('documents.validation.fileRequired');
      else {
        const problem = validateClientDocumentFile(file);
        if (problem === 'size') next.file = t('documents.validation.fileTooLarge');
        if (problem === 'type') next.file = t('documents.validation.fileType');
      }
    }
    if (!title.trim()) next.title = t('documents.validation.titleRequired');
    if (validFrom && validUntil && validUntil < validFrom) next.validUntil = t('documents.validation.untilBeforeFrom');
    if (rateEnabled && projectBillsHourly) {
      if (parsedRate === null || Number.isNaN(parsedRate) || parsedRate < 0) next.rate = t('documents.rate.rateRequired');
      if (!rateValidFrom) next.rateDate = t('documents.rate.dateRequired');
    }
    setErrors(next);
    return Object.values(next).every((value) => !value);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    onBusyChange(true);
    try {
      if (mode === 'edit' && source) {
        const saved = await onUpdate(source.id, {
          title: title.trim(),
          document_type: documentType,
          project_id: projectId || null,
          signed_at: signedAt || null,
          valid_from: validFrom || null,
          valid_until: validUntil || null,
          notes: notes.trim() || null,
        });
        if (saved) onDone();
        return;
      }

      const uploaded = await onUpload({
        file: file as File,
        title: title.trim(),
        document_type: documentType,
        project_id: projectId || undefined,
        signed_at: signedAt || undefined,
        valid_from: validFrom || undefined,
        valid_until: validUntil || undefined,
        notes: notes.trim() || undefined,
        supersedes_document_id: mode === 'version' || mode === 'extend' ? source?.id : undefined,
      });
      if (!uploaded) return;

      if (rateEnabled && projectBillsHourly && project && parsedRate !== null) {
        await onRateChange({
          projectId: project.id,
          hourly_rate: parsedRate,
          valid_from: rateValidFrom,
          apply_to_existing: applyToExisting,
          note: title.trim(),
          currency: project.currency || 'EUR',
          replaceRateId:
            impact?.existing_period && impact.valid_from === rateValidFrom ? impact.existing_period.id : undefined,
        });
      }
      onDone();
    } finally {
      onBusyChange(false);
    }
  };

  const heading: Record<FormMode, string> = {
    upload: t('documents.form.uploadTitle'),
    version: t('documents.form.versionTitle', { title: source?.title ?? '' }),
    extend: t('documents.form.extendTitle', { title: source?.title ?? '' }),
    edit: t('documents.form.editTitle', { title: source?.title ?? '' }),
  };

  return (
    <form id={FORM_ID} className="space-y-5" onSubmit={handleSubmit} noValidate>
      <h3 className="text-base font-semibold text-gray-900 dark:text-white">{heading[mode]}</h3>

      {(mode === 'version' || mode === 'extend') && source ? (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
          {mode === 'extend' && source.valid_until
            ? t('documents.form.extendHint', { date: formatYmd(source.valid_until, lng), version: source.version })
            : t('documents.form.versionHint', { version: source.version })}
        </p>
      ) : null}

      {needsFile ? (
        <FileDropZone
          file={file}
          onFile={chooseFile}
          accept={CLIENT_DOCUMENT_ACCEPT}
          prompt={t('documents.drop.prompt')}
          hint={t('documents.fields.fileHint')}
          changeLabel={t('documents.drop.change')}
          removeLabel={t('documents.drop.remove')}
          error={errors.file}
          locale={lng}
        />
      ) : null}

      <Input
        id="client-document-title"
        label={t('documents.fields.title')}
        placeholder={t('documents.fields.titlePlaceholder')}
        required
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          setTitleTouched(true);
          setErrors((current) => ({ ...current, title: undefined }));
        }}
        error={errors.title}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          id="client-document-type"
          label={t('documents.fields.type')}
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value as ClientDocumentType)}
        >
          {CLIENT_DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`documents.types.${type}`)}
            </option>
          ))}
        </Select>
        <Select
          id="client-document-project"
          label={t('documents.fields.project')}
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setRateEnabled(false);
          }}
        >
          <option value="">{t('documents.noProject')}</option>
          {projects.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </Select>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('documents.form.term')}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            id="client-document-valid-from"
            type="date"
            label={t('documents.fields.validFrom')}
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
          />
          <div>
            <Input
              id="client-document-valid-until"
              type="date"
              label={t('documents.fields.validUntil')}
              value={validUntil}
              onChange={(event) => {
                setValidUntil(event.target.value);
                setErrors((current) => ({ ...current, validUntil: undefined }));
              }}
              error={errors.validUntil}
            />
            {validFrom ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[6, 12].map((months) => {
                  const until = addDaysYmd(addMonthsYmd(validFrom, months), -1);
                  return (
                    <button
                      key={months}
                      type="button"
                      onClick={() => setValidUntil(until)}
                      className={clsx(
                        'rounded-full border px-2.5 py-1 text-xs font-medium',
                        validUntil === until
                          ? 'border-purple-500 bg-purple-100 text-purple-800 dark:border-purple-400 dark:bg-purple-900/40 dark:text-purple-200'
                          : 'border-gray-300 text-gray-600 hover:border-purple-400 dark:border-gray-700 dark:text-gray-300'
                      )}
                    >
                      {t('documents.form.plusMonths', { count: months })}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <Input
            id="client-document-signed-at"
            type="date"
            label={t('documents.fields.signedAt')}
            value={signedAt}
            onChange={(event) => setSignedAt(event.target.value)}
          />
        </div>
      </fieldset>

      {mode !== 'edit' && projectBillsHourly && project ? (
        <div
          className={clsx(
            'rounded-xl border p-4',
            rateEnabled
              ? 'border-purple-300 dark:border-purple-700/70'
              : 'border-gray-200 dark:border-gray-800'
          )}
        >
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              checked={rateEnabled}
              onChange={(event) => setRateEnabled(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900 dark:text-white">
                {t('documents.rate.toggle', { project: project.name })}
              </span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                {project.hourly_rate != null
                  ? t('documents.rate.current', {
                      rate: new Intl.NumberFormat(undefined, {
                        style: 'currency',
                        currency: project.currency || 'EUR',
                      }).format(Number(project.hourly_rate)),
                    })
                  : t('documents.rate.none')}
              </span>
            </span>
          </label>

          {rateEnabled ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="client-document-rate"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  label={t('documents.rate.newRate')}
                  value={rateInput}
                  onChange={(event) => {
                    setRateInput(event.target.value);
                    setErrors((current) => ({ ...current, rate: undefined }));
                  }}
                  error={errors.rate}
                />
                <EffectiveDateField
                  id="client-document-rate-from"
                  label={t('documents.rate.validFrom')}
                  value={rateValidFrom}
                  onChange={(value) => {
                    setRateValidFrom(value);
                    setRateDateTouched(true);
                    setErrors((current) => ({ ...current, rateDate: undefined }));
                  }}
                  error={errors.rateDate}
                />
              </div>
              {rateValidFrom ? (
                <RateImpactPanel
                  projectId={project.id}
                  currency={project.currency || 'EUR'}
                  newRate={parsedRate}
                  validFrom={rateValidFrom}
                  applyToExisting={applyToExisting}
                  onApplyToExistingChange={setApplyToExisting}
                  onImpact={handleImpact}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <Textarea
        id="client-document-notes"
        label={t('documents.fields.notes')}
        rows={2}
        placeholder={t('documents.fields.notesPlaceholder')}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
    </form>
  );
};

export const ClientDocumentsModal: FC<ClientDocumentsModalProps> = ({
  open,
  client,
  onClose,
  onUpload,
  onUpdate,
  onDelete,
  onRateChange,
  isUploading,
  isSaving,
  deletingId,
  error,
  successMessage,
  onDismissError,
  onDismissSuccess,
}) => {
  const { t, i18n } = useTranslation('clients');
  const lng = i18n.language;

  const [projectFilter, setProjectFilter] = useState('');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [expandedChains, setExpandedChains] = useState<string[]>([]);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const filters = useMemo(() => (projectFilter ? { project_id: projectFilter } : undefined), [projectFilter]);
  const { data: documents, isLoading, isError, error: listError } = useClientDocuments(client.id, filters, open);
  const { data: projectData } = useProjects({ clientId: client.id });
  const projects = useMemo<Project[]>(() => projectData ?? [], [projectData]);

  const chains = useMemo(() => {
    // What needs attention first: expiring, running, upcoming, undated, expired.
    return buildDocumentChains(documents ?? []).sort((a, b) => {
      const rank = contractStatusRank(statusOf(a.current)) - contractStatusRank(statusOf(b.current));
      if (rank !== 0) return rank;
      return new Date(b.current.created_at).getTime() - new Date(a.current.created_at).getTime();
    });
  }, [documents]);

  const openForm = (mode: FormMode, source: ClientDocument | null, file: File | null = null) => {
    setDownloadError(null);
    setConfirmingDeleteId(null);
    onDismissError();
    onDismissSuccess();
    setView({ kind: 'form', mode, source, file });
  };

  const backToList = () => {
    onDismissError();
    setView({ kind: 'list' });
  };

  /** Fetches the file behind the bearer token as a Blob. */
  const fetchBlob = async (document_: ClientDocument) => {
    setDownloadError(null);
    setDownloadingId(document_.id);
    try {
      return await downloadClientDocument(document_.id);
    } catch (downloadErr) {
      // The request uses responseType 'blob', so an error body is a Blob and
      // extractErrorMessage would yield "[object Blob]".
      console.error('Client document download failed', downloadErr);
      setDownloadError(t('documents.downloadError'));
      return null;
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownload = async (document_: ClientDocument) => {
    const blob = await fetchBlob(document_);
    if (!blob) return;
    const url = window.URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = document_.file_filename || document_.title;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  /** Opens a PDF or image in a new tab instead of downloading it. */
  const handleOpen = async (document_: ClientDocument) => {
    // Open the tab synchronously, inside the click, or the popup blocker eats it.
    const tab = window.open('', '_blank');
    const blob = await fetchBlob(document_);
    if (!blob) {
      tab?.close();
      return;
    }
    const url = window.URL.createObjectURL(blob);
    if (tab) {
      tab.location.href = url;
    } else {
      window.open(url, '_blank');
    }
    // Give the viewer time to load before releasing the object URL.
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  };

  const handleConfirmDelete = async (document_: ClientDocument) => {
    await onDelete(document_);
    setConfirmingDeleteId(null);
  };

  const toggleHistory = (chainId: string) =>
    setExpandedChains((current) =>
      current.includes(chainId) ? current.filter((id) => id !== chainId) : [...current, chainId]
    );

  const listErrorMessage = isError ? extractErrorMessage(listError) || t('documents.loadError') : null;

  const isFormView = view.kind === 'form';
  const submitLabel = (() => {
    if (view.kind !== 'form') return '';
    if (busy || isUploading || isSaving) return view.mode === 'edit' ? t('documents.saving') : t('documents.uploading');
    switch (view.mode) {
      case 'extend':
        return t('documents.form.extendSubmit');
      case 'edit':
        return t('documents.save');
      default:
        return t('documents.upload');
    }
  })();

  const footer = isFormView ? (
    <>
      <Button type="button" variant="outline" onClick={backToList} disabled={busy}>
        {t('documents.form.back')}
      </Button>
      {/* Distinct keys: see ProjectRatesModal — reusing the "upload" button's
          DOM node would submit the empty form during the very click that opens it. */}
      <Button key="document-form-submit" type="submit" form={FORM_ID} disabled={busy || isUploading || isSaving}>
        {submitLabel}
      </Button>
    </>
  ) : (
    <>
      <Button type="button" variant="outline" onClick={onClose}>
        {t('documents.close')}
      </Button>
      <Button key="document-open-form" type="button" onClick={() => openForm('upload', null)}>
        <FilePlus2 className="mr-1 h-4 w-4" aria-hidden="true" />
        {t('documents.upload')}
      </Button>
    </>
  );

  /** Actions shared by the card and the history rows. */
  const confirmRow = (document_: ClientDocument) =>
    confirmingDeleteId === document_.id ? (
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/60 dark:bg-red-950/30">
        <p className="flex-1 text-xs text-red-800 dark:text-red-200">
          {t('documents.messages.deleteConfirm', { title: document_.title })}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingDeleteId(null)}>
          {t('documents.cancel')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="danger"
          onClick={() => void handleConfirmDelete(document_)}
          disabled={deletingId === document_.id}
        >
          {deletingId === document_.id ? t('documents.deleting') : t('documents.delete')}
        </Button>
      </div>
    ) : null;

  return (
    <Modal open={open} onClose={onClose} title={t('documents.title', { name: client.name })} size="xl" footer={footer}>
      {view.kind === 'form' ? (
        <>
          {error ? <Alert type="error" message={error} onClose={onDismissError} /> : null}
          <DocumentForm
            key={`${view.mode}-${view.source?.id ?? 'new'}`}
            mode={view.mode}
            source={view.source}
            initialFile={view.file}
            projects={projects}
            defaultProjectId={projectFilter}
            onUpload={onUpload}
            onUpdate={onUpdate}
            onRateChange={onRateChange}
            onDone={() => setView({ kind: 'list' })}
            onBusyChange={setBusy}
          />
        </>
      ) : (
        <div
          className="relative space-y-4"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault();
              setIsDraggingOver(true);
            }
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDraggingOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDraggingOver(false);
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) openForm('upload', null, dropped);
          }}
        >
          {isDraggingOver ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-purple-500 bg-purple-50/90 dark:bg-purple-950/80">
              <p className="text-sm font-semibold text-purple-800 dark:text-purple-200">{t('documents.drop.release')}</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('documents.subtitle')}</p>
            {projects.length > 1 ? (
              <select
                aria-label={t('documents.filterProject')}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
              >
                <option value="">{t('documents.allProjects')}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {successMessage ? <Alert type="success" message={successMessage} onClose={onDismissSuccess} /> : null}
          {error ? <Alert type="error" message={error} onClose={onDismissError} /> : null}
          {downloadError ? <Alert type="error" message={downloadError} onClose={() => setDownloadError(null)} /> : null}
          {listErrorMessage ? <Alert type="error" message={listErrorMessage} /> : null}

          {isLoading ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('documents.loading')}</p>
          ) : chains.length === 0 ? (
            projectFilter ? (
              <p className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {t('documents.emptyFiltered')}
              </p>
            ) : (
              <FileDropZone
                file={null}
                onFile={(picked) => picked && openForm('upload', null, picked)}
                accept={CLIENT_DOCUMENT_ACCEPT}
                prompt={t('documents.drop.emptyPrompt')}
                hint={t('documents.fields.fileHint')}
                changeLabel={t('documents.drop.change')}
                removeLabel={t('documents.drop.remove')}
                locale={lng}
              />
            )
          ) : (
            <ul className="space-y-3">
              {chains.map((chain) => {
                const document_ = chain.current;
                const status = statusOf(document_);
                const extendable = EXTENDABLE_TYPES.has(document_.document_type);
                const urgent = status?.kind === 'expiring' || status?.kind === 'expired';
                const previewable = isPreviewable(document_.file_mimetype);
                const expanded = expandedChains.includes(document_.id);
                const size = formatFileSize(document_.file_size, lng);

                return (
                  <li
                    key={document_.id}
                    className={clsx(
                      'rounded-xl border bg-white shadow-sm dark:bg-gray-900',
                      urgent && extendable
                        ? 'border-amber-300 dark:border-amber-800/70'
                        : 'border-gray-200 dark:border-gray-800'
                    )}
                  >
                    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-start">
                      <FileText className="hidden h-5 w-5 shrink-0 text-purple-600 md:mt-0.5 md:block dark:text-purple-400" aria-hidden="true" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">{document_.title}</span>
                          <StatusBadge status={status} document={document_} />
                          {chain.history.length > 0 ? (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                              {t('documents.version', { number: document_.version })}
                            </span>
                          ) : null}
                        </div>
                        <DocumentMeta document={document_} />
                        <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                          {document_.file_filename ?? '—'}
                          {size ? ` · ${size}` : ''}
                        </p>
                        {document_.notes ? (
                          <p className="whitespace-pre-line text-xs text-gray-600 dark:text-gray-300">{document_.notes}</p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {extendable ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={urgent ? 'primary' : 'outline'}
                            onClick={() => openForm('extend', document_)}
                          >
                            <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            {t('documents.extend')}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void (previewable ? handleOpen(document_) : handleDownload(document_))}
                          disabled={downloadingId === document_.id}
                        >
                          {previewable ? (
                            <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {downloadingId === document_.id
                            ? t('documents.downloading')
                            : previewable
                              ? t('documents.open')
                              : t('documents.download')}
                        </Button>
                        <Dropdown
                          align="right"
                          trigger={
                            <button
                              type="button"
                              className="rounded-lg border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                              aria-label={t('documents.moreActions', { title: document_.title })}
                            >
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </button>
                          }
                          items={[
                            ...(previewable
                              ? [{ label: t('documents.download'), icon: Download, onClick: () => void handleDownload(document_) }]
                              : []),
                            { label: t('documents.newVersion'), icon: FilePlus2, onClick: () => openForm('version', document_) },
                            { label: t('documents.edit'), icon: Pencil, onClick: () => openForm('edit', document_) },
                            { label: '', onClick: () => undefined, divider: true },
                            {
                              label: t('documents.delete'),
                              icon: Trash2,
                              danger: true,
                              onClick: () => setConfirmingDeleteId(document_.id),
                            },
                          ]}
                        />
                      </div>
                    </div>

                    {confirmRow(document_) ? <div className="px-4 pb-4">{confirmRow(document_)}</div> : null}

                    {chain.history.length > 0 ? (
                      <div className="border-t border-gray-100 px-4 py-2.5 dark:border-gray-800">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 hover:underline dark:text-purple-400"
                          onClick={() => toggleHistory(document_.id)}
                          aria-expanded={expanded}
                        >
                          <History className="h-3.5 w-3.5" aria-hidden="true" />
                          {expanded
                            ? t('documents.hideHistory')
                            : t('documents.history', { count: chain.history.length })}
                        </button>

                        {expanded ? (
                          <ul className="mt-2 space-y-1.5">
                            {chain.history.map((historic) => (
                              <li key={historic.id} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                    {t('documents.version', { number: historic.version })}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <DocumentMeta document={historic} />
                                  </span>
                                  <button
                                    type="button"
                                    className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-white"
                                    onClick={() =>
                                      void (isPreviewable(historic.file_mimetype) ? handleOpen(historic) : handleDownload(historic))
                                    }
                                    aria-label={t('documents.openVersion', { number: historic.version })}
                                    title={isPreviewable(historic.file_mimetype) ? t('documents.open') : t('documents.download')}
                                  >
                                    {isPreviewable(historic.file_mimetype) ? (
                                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                    ) : (
                                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                    onClick={() => setConfirmingDeleteId(historic.id)}
                                    aria-label={t('documents.deleteVersion', { number: historic.version })}
                                    title={t('documents.delete')}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  </button>
                                </div>
                                {confirmRow(historic)}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ClientDocumentsModal;
