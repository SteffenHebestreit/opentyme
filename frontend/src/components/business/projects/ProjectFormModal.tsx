import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FolderKanban, History } from 'lucide-react';
import { Alert } from '../../common/Alert';
import { Button } from '../../common/Button';
import { Input, CustomSelect, Textarea } from '../../forms';
import { Modal } from '../../ui/Modal';
import { Client, Project, ProjectPayload, ProjectStatus, RateType } from '../../../api/types';
import { CURRENCIES, formatCurrency } from '../../../utils/currency';
import { EffectiveDateField, RateImpactPanel } from './RateChange';
import { FormSection } from './uiParts';
import { checkboxClass, formSectionsClass } from './uiClasses';

/**
 * Modal form for creating and editing projects.
 *
 * **Features:**
 * - Create new project or edit existing project modes
 * - Client selection dropdown (requires at least one client)
 * - Project status selection (not_started, active, on_hold, completed)
 * - Date range picker (start date and due date)
 * - Budget and rate type configuration (hourly or fixed fee)
 * - Conditional hourly rate field (shown only for hourly projects)
 * - Estimated hours tracking
 * - Form validation with react-hook-form
 * - Warning when no clients exist
 * - Error display for submission failures
 * - Dark mode support
 *
 * **Form Fields:**
 * - **Name** (required): Project name
 * - **Client** (required): Associated client from dropdown
 * - **Status** (required): Project status
 * - **Description** (optional): Project overview
 * - **Start Date** (optional): Project start date
 * - **Due Date** (optional): Project end date
 * - **Budget** (optional): Total project budget
 * - **Rate Type** (optional): Hourly or fixed fee
 * - **Hourly Rate** (conditional): Required if rate type is hourly
 * - **Estimated Hours** (optional): Expected time investment
 *
 * @component
 * @example
 * // Create new project
 * <ProjectFormModal
 *   open={isModalOpen}
 *   mode="create"
 *   clients={clients}
 *   onSubmit={handleCreateProject}
 *   onClose={() => setIsModalOpen(false)}
 *   isSubmitting={false}
 * />
 *
 * @example
 * // Edit existing project
 * <ProjectFormModal
 *   open={showEditModal}
 *   mode="edit"
 *   initialProject={selectedProject}
 *   clients={clients}
 *   onSubmit={handleUpdateProject}
 *   onClose={closeEditModal}
 *   isSubmitting={isSaving}
 *   error={submissionError}
 * />
 *
 * @example
 * // With error handling
 * const handleSubmit = async (payload: ProjectPayload) => {
 *   try {
 *     if (mode === 'create') {
 *       await createProject(payload);
 *     } else {
 *       await updateProject(projectId, payload);
 *     }
 *     onClose();
 *   } catch (err) {
 *     setError(err.message);
 *   }
 * };
 *
 * <ProjectFormModal
 *   open={isOpen}
 *   mode={mode}
 *   initialProject={mode === 'edit' ? project : null}
 *   clients={clients}
 *   onSubmit={handleSubmit}
 *   onClose={onClose}
 *   isSubmitting={isLoading}
 *   error={error}
 * />
 */

/**
 * Props for the ProjectFormModal component.
 *
 * @interface ProjectFormModalProps
 * @property {boolean} open - Whether the modal is visible
 * @property {'create' | 'edit'} mode - Form mode (affects title and button text)
 * @property {Project | null} [initialProject] - Project data to edit (required for edit mode)
 * @property {Client[]} clients - Available clients for selection
 * @property {(payload: ProjectPayload) => Promise<void>} onSubmit - Callback when form is submitted
 * @property {() => void} onClose - Callback when modal should close
 * @property {boolean} isSubmitting - Whether the form is currently submitting
 * @property {string | null} [error] - Error message to display
 */
interface ProjectFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialProject?: Project | null;
  clients: Client[];
  onSubmit: (payload: ProjectPayload) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
  error?: string | null;
  /** Opens the project's rate timeline (edit mode). */
  onShowRateHistory?: (project: Project) => void;
}

/**
 * Internal form values for the project form.
 *
 * @interface FormValues
 */

interface FormValues {
  name: string;
  description: string;
  client_id: string;
  status: ProjectStatus;
  start_date: string;
  end_date: string;
  budget: string;
  currency: string;
  rate_type: RateType | '';
  hourly_rate: string;
  estimated_hours: string;
  recurring_payment: boolean;
}

/**
 * Status options for the project status dropdown.
 *
 * @constant
 */
const getStatusOptions = (t: (key: string) => string): Array<{ label: string; value: ProjectStatus }> => [
  { label: t('status.notStarted'), value: 'not_started' },
  { label: t('status.active'), value: 'active' },
  { label: t('status.onHold'), value: 'on_hold' },
  { label: t('status.completed'), value: 'completed' },
];

/**
 * Rate type options for the rate type dropdown.
 *
 * @constant
 */
const getRateTypeOptions = (t: (key: string) => string): Array<{ label: string; value: RateType }> => [
  { label: t('form.rateType.hourly'), value: 'hourly' },
  { label: t('form.rateType.fixedFee'), value: 'fixed_fee' },
];

/**
 * Default values for the form when creating a new project.
 *
 * @constant
 */
const DEFAULT_VALUES: FormValues = {
  name: '',
  description: '',
  client_id: '',
  status: 'not_started',
  start_date: '',
  end_date: '',
  budget: '',
  currency: 'USD',
  rate_type: '',
  hourly_rate: '',
  estimated_hours: '',
  recurring_payment: false,
};

/**
 * Unique form ID for linking submit button to form.
 *
 * @constant
 */
const formId = 'project-form-modal';

/**
 * Formats a date string or Date object to YYYY-MM-DD format for date inputs.
 *
 * @param {string | null | undefined} value - Date string or null
 * @returns {string} Formatted date string or empty string
 */
function formatDateInput(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

export const ProjectFormModal: FC<ProjectFormModalProps> = ({
  open,
  mode,
  initialProject,
  clients,
  onSubmit,
  onClose,
  isSubmitting,
  error,
  onShowRateHistory,
}) => {
  const { t } = useTranslation('projects');
  const hasClients = clients.length > 0;

  // A changed rate always needs the day it takes effect — deliberately NOT
  // pre-filled, so "from today" is a choice the user makes, never a default
  // that silently re-prices the rest of the month.
  const [rateValidFrom, setRateValidFrom] = useState('');
  const [applyRateToExisting, setApplyRateToExisting] = useState(true);
  const [rateDateError, setRateDateError] = useState<string | undefined>(undefined);
  const noopImpact = useCallback(() => undefined, []);

  const initialValues = useMemo((): FormValues => {
    if (!initialProject) {
      return DEFAULT_VALUES;
    }
    
    // Infer rate_type from existing data if not explicitly set
    let rateType: '' | RateType = initialProject.rate_type ?? '';
    if (!rateType && initialProject.hourly_rate != null) {
      rateType = 'hourly';
    } else if (!rateType && initialProject.budget != null) {
      rateType = 'fixed_fee';
    }
    
    return {
      name: initialProject.name ?? '',
      description: initialProject.description ?? '',
      client_id: initialProject.client_id ?? '',
      status: initialProject.status,
      start_date: formatDateInput(initialProject.start_date),
      end_date: formatDateInput(initialProject.end_date),
      budget: initialProject.budget != null ? String(initialProject.budget) : '',
      currency: initialProject.currency ?? 'USD',
      rate_type: rateType,
      hourly_rate: initialProject.hourly_rate != null ? String(initialProject.hourly_rate) : '',
      estimated_hours: initialProject.estimated_hours != null ? String(initialProject.estimated_hours) : '',
      recurring_payment: initialProject.recurring_payment ?? false,
    };
  }, [initialProject]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: initialValues,
  });

  const selectedRateType = watch('rate_type');
  const selectedClientId = watch('client_id');
  const selectedStatus = watch('status');
  const selectedCurrency = watch('currency');

  // Client options for CustomSelect
  const clientOptions = clients.map((client) => ({
    value: client.id,
    label: client.name,
  }));

  // Currency options for CustomSelect
  const currencyOptions = CURRENCIES.map((currency) => ({
    value: currency.code,
    label: `${currency.code} (${currency.symbol})`,
  }));

  const statusOptions = getStatusOptions(t);
  const rateTypeOptions = getRateTypeOptions(t);

  // Rate type options with "No rate" option
  const rateTypeSelectOptions = [
    { value: '', label: t('form.rateType.noRate') },
    ...rateTypeOptions,
  ];

  useEffect(() => {
    if (open) {
      reset(initialValues);
      setRateValidFrom('');
      setApplyRateToExisting(true);
      setRateDateError(undefined);
    }
  }, [initialValues, open, reset]);

  const watchedRate = watch('hourly_rate');
  const previousRate =
    mode === 'edit' && initialProject?.hourly_rate != null ? Number(initialProject.hourly_rate) : null;
  const enteredRate = watchedRate === '' || watchedRate == null ? null : Number(watchedRate);
  const rateChanged =
    selectedRateType === 'hourly' &&
    previousRate !== null &&
    enteredRate !== null &&
    !Number.isNaN(enteredRate) &&
    enteredRate !== previousRate;

  const handleFormSubmit = async (values: FormValues) => {
    if (rateChanged && !rateValidFrom) {
      setRateDateError(t('rates.form.validFrom.requiredOnChange'));
      return;
    }

    const payload: ProjectPayload = {
      name: values.name.trim(),
      client_id: values.client_id,
      status: values.status,
      description: values.description.trim() ? values.description.trim() : undefined,
      start_date: values.start_date ? new Date(values.start_date).toISOString() : null,
      end_date: values.end_date ? new Date(values.end_date).toISOString() : null,
      budget: values.budget ? Number(values.budget) : null,
      currency: values.currency || 'USD',
      rate_type: values.rate_type || null,
      hourly_rate: values.rate_type === 'hourly' && values.hourly_rate ? Number(values.hourly_rate) : null,
      estimated_hours: values.estimated_hours ? Number(values.estimated_hours) : null,
      recurring_payment: values.recurring_payment,
      ...(rateChanged
        ? { hourly_rate_valid_from: rateValidFrom, apply_rate_to_existing: applyRateToExisting }
        : {}),
    };

    await onSubmit(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? t('addProject') : t('editProject')}
      icon={<FolderKanban className="h-4 w-4" aria-hidden="true" />}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={isSubmitting || !hasClients} isLoading={isSubmitting}>
            {isSubmitting ? t('saving') : mode === 'create' ? t('createProject') : t('saveChanges')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(handleFormSubmit)}>
        {error || !hasClients ? (
          <div className="mb-5 space-y-3">
            {error ? <Alert type="error" message={error} /> : null}
            {!hasClients ? (
              <Alert
                type="warning"
                message={t('client.noClients')}
              />
            ) : null}
          </div>
        ) : null}

        <div className={formSectionsClass}>
          <FormSection title={t('form.sections.general')}>
            <Input
              id="project-name"
              label={t('form.name.label')}
              placeholder={t('form.name.placeholder')}
              autoFocus
              required
              {...register('name', { required: t('form.name.required') })}
              error={errors.name?.message}
            />

            <div className="grid gap-x-4 sm:grid-cols-2">
              <div className="mb-4">
                <CustomSelect
                  label={t('client.label')}
                  value={selectedClientId}
                  onChange={(value) => setValue('client_id', value)}
                  options={clientOptions}
                  disabled={!hasClients}
                  required
                  error={errors.client_id?.message}
                  size="md"
                />
              </div>
              <div className="mb-4">
                <CustomSelect
                  label={t('status.label')}
                  value={selectedStatus}
                  onChange={(value) => setValue('status', value as ProjectStatus)}
                  options={statusOptions}
                  required
                  size="md"
                />
              </div>
            </div>

            <Textarea
              id="project-description"
              label={t('form.description.label')}
              rows={3}
              placeholder={t('form.description.placeholder')}
              {...register('description')}
            />
          </FormSection>

          <FormSection title={t('form.sections.timeline')}>
            <div className="grid gap-x-4 sm:grid-cols-3">
              <Input
                id="project-start-date"
                label={t('form.startDate.label')}
                type="date"
                {...register('start_date')}
                error={errors.start_date?.message}
              />
              <Input
                id="project-end-date"
                label={t('form.dueDate.label')}
                type="date"
                {...register('end_date')}
                error={errors.end_date?.message}
              />
              <Input
                id="project-estimated-hours"
                label={t('form.estimatedHours.label')}
                type="number"
                min="0"
                step="0.1"
                placeholder={t('form.estimatedHours.placeholder')}
                {...register('estimated_hours', {
                  min: { value: 0, message: t('form.estimatedHours.min') },
                })}
                error={errors.estimated_hours?.message}
              />
            </div>
          </FormSection>

          <FormSection title={t('form.sections.billing')}>
            <div className="grid gap-x-4 sm:grid-cols-3">
              <div className="mb-4">
                <CustomSelect
                  label={t('form.rateType.label')}
                  value={selectedRateType}
                  onChange={(value) => setValue('rate_type', value as RateType | '')}
                  options={rateTypeSelectOptions}
                  size="md"
                />
              </div>
              <Input
                id="project-budget"
                label={t('form.budget.label')}
                type="number"
                min="0"
                step="0.01"
                placeholder={t('form.budget.placeholder')}
                {...register('budget', {
                  min: { value: 0, message: t('form.budget.min') },
                })}
                error={errors.budget?.message}
              />
              <div className="mb-4">
                <CustomSelect
                  label={t('form.currency.label')}
                  value={selectedCurrency}
                  onChange={(value) => setValue('currency', value)}
                  options={currencyOptions}
                  size="md"
                />
              </div>
            </div>

            {selectedRateType === 'hourly' ? (
              <div className="animate-fade-up">
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <Input
                    id="project-hourly-rate"
                    label={t('form.hourlyRate.label')}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t('form.hourlyRate.placeholder')}
                    {...register('hourly_rate', {
                      required: t('form.hourlyRate.required'),
                      min: { value: 0, message: t('form.hourlyRate.min') },
                    })}
                    error={errors.hourly_rate?.message}
                    helperText={
                      mode === 'create'
                        ? t('form.hourlyRate.helperCreate')
                        : previousRate !== null && !rateChanged
                          ? t('form.hourlyRate.helperEdit')
                          : undefined
                    }
                  />

                  {mode === 'edit' && initialProject && onShowRateHistory && !rateChanged ? (
                    <div className="mb-4 sm:pt-7">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400 dark:hover:text-brand-300"
                        onClick={() => onShowRateHistory(initialProject)}
                      >
                        <History className="h-4 w-4" aria-hidden="true" />
                        {t('form.hourlyRate.showHistory')}
                      </button>
                    </div>
                  ) : null}
                </div>

                {rateChanged && initialProject ? (
                  <div className="mb-4 animate-fade-up rounded-xl border border-brand-200 bg-brand-50/40 p-4 dark:border-brand-500/25 dark:bg-brand-500/[0.04]">
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {t('form.hourlyRate.changeTitle')}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {t('form.hourlyRate.changeHint', {
                          previous: formatCurrency(previousRate as number, initialProject.currency || 'EUR'),
                        })}
                      </p>
                    </div>
                    <div className="grid gap-x-4 sm:grid-cols-2">
                      <EffectiveDateField
                        id="project-rate-change-from"
                        label={t('rates.form.validFrom.labelRequired')}
                        value={rateValidFrom}
                        onChange={(value) => {
                          setRateValidFrom(value);
                          setRateDateError(undefined);
                        }}
                        error={rateDateError}
                      />
                    </div>
                    {rateValidFrom ? (
                      <RateImpactPanel
                        projectId={initialProject.id}
                        currency={initialProject.currency || 'EUR'}
                        newRate={enteredRate}
                        validFrom={rateValidFrom}
                        applyToExisting={applyRateToExisting}
                        onApplyToExistingChange={setApplyRateToExisting}
                        onImpact={noopImpact}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mb-4 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
              <input
                type="checkbox"
                id="recurring_payment"
                checked={watch('recurring_payment')}
                onChange={(e) => setValue('recurring_payment', e.target.checked)}
                className={`${checkboxClass} mt-0.5`}
              />
              <div className="flex-1">
                <label htmlFor="recurring_payment" className="cursor-pointer text-sm font-medium text-gray-900 dark:text-white">
                  {t('form.recurringPayment.label')}
                </label>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('form.recurringPayment.description')}
                </p>
              </div>
            </div>
          </FormSection>
        </div>
      </form>
    </Modal>
  );
};
