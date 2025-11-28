/**
 * @fileoverview Client form modal component for creating and editing clients.
 * 
 * Provides a comprehensive form interface for client management with validation,
 * status management, and contact information. Handles both create and edit modes
 * with proper form initialization and state management.
 * 
 * Features:
 * - Client information: name (required), email, phone, address, notes
 * - Status management: active/inactive toggle
 * - Billing address: optional separate billing address fields
 * - Form validation: required fields, email format validation
 * - Edit mode: pre-fills form with existing client data
 * - Optional fields: trims empty values before submission
 * - Error handling: displays submission errors with Alert component
 * - Loading states: disabled submit button during save operations
 * 
 * @module components/business/clients/ClientFormModal
 */

import { FC, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Client, ClientPayload, ClientStatus } from '../../../api/types';
import { Input } from '../../forms/Input';
import { Select } from '../../forms/Select';
import { Textarea } from '../../forms/Textarea';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { Modal } from '../../ui/Modal';

/**
 * Props for the ClientFormModal component.
 * 
 * @interface ClientFormModalProps
 * @property {boolean} open - Whether the modal is currently visible
 * @property {'create' | 'edit'} mode - Form mode determining behavior and title
 * @property {Client | null} [initialClient] - Client data for edit mode (null for create mode)
 * @property {(payload: ClientPayload) => Promise<void>} onSubmit - Async handler for form submission
 * @property {() => void} onClose - Handler for modal close (cancel button or backdrop click)
 * @property {boolean} isSubmitting - Loading state during form submission
 * @property {string | null} [error] - Error message to display above the form
 */
interface ClientFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialClient?: Client | null;
  onSubmit: (payload: ClientPayload) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
  error?: string | null;
}

/**
 * Internal form values interface for react-hook-form.
 * All fields are strings to work with form inputs.
 * 
 * @interface FormValues
 * @property {string} name - Client name (required)
 * @property {string} email - Client email address with validation
 * @property {string} phone - Client phone number
 * @property {string} address - Client physical address
 * @property {string} notes - Internal notes about the client
 * @property {ClientStatus} status - Client status (active/inactive)
 * @property {string} billing_contact_person - Separate billing contact person
 * @property {string} billing_email - Separate billing email address
 * @property {string} billing_phone - Separate billing phone number
 * @property {string} billing_address - Separate billing street address
 * @property {string} billing_city - Separate billing city
 * @property {string} billing_state - Separate billing state/province
 * @property {string} billing_postal_code - Separate billing postal/zip code
 * @property {string} billing_country - Separate billing country
 * @property {string} billing_tax_id - Separate billing tax ID number
 */
interface FormValues {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  status: ClientStatus;
  billing_contact_person: string;
  billing_email: string;
  billing_phone: string;
  billing_address: string;
  billing_city: string;
  billing_state: string;
  billing_postal_code: string;
  billing_country: string;
  billing_tax_id: string;
}

/**
 * Available status options for the status dropdown.
 * Maps client status enum values to user-friendly labels.
 * 
 * @constant
 * @type {Array<{label: string, value: ClientStatus}>}
 */
const getStatusOptions = (t: (key: string) => string): Array<{ label: string; value: ClientStatus }> => [
  { label: t('status.active'), value: 'active' },
  { label: t('status.inactive'), value: 'inactive' },
];

/**
 * Default form values for client creation.
 * Used when no initial client data is provided.
 * 
 * @constant
 * @type {FormValues}
 */
const DEFAULT_VALUES: FormValues = {
  name: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
  status: 'active',
  billing_contact_person: '',
  billing_email: '',
  billing_phone: '',
  billing_address: '',
  billing_city: '',
  billing_state: '',
  billing_postal_code: '',
  billing_country: '',
  billing_tax_id: '',
};

/**
 * Unique form ID for associating the submit button with the form element.
 * Allows submit button to be placed in modal footer outside the form.
 * 
 * @constant
 */
const formId = 'client-form-modal';

/**
 * Modal form component for creating and editing clients.
 * 
 * Provides a comprehensive form interface with validation and proper state management.
 * Handles both create and edit modes, automatically initializing the form with
 * existing client data when editing.
 * 
 * Form Fields:
 * - **Name** (required): Client name with validation
 * - **Email** (optional): Email with format validation
 * - **Phone** (optional): Phone number
 * - **Address** (optional): Physical address (textarea)
 * - **Notes** (optional): Internal notes (textarea)
 * - **Status** (required): Active or Inactive dropdown
 * 
 * Validation Rules:
 * - Name is required
 * - Email must be valid format if provided
 * - Optional fields trim whitespace and omit if empty
 * 
 * Modal Behavior:
 * - Resets form when modal opens
 * - Pre-fills data in edit mode
 * - Displays error messages from submission
 * - Disables submit button during submission
 * - Two-button footer: Cancel and Save/Create
 * 
 * @component
 * @example
 * // Create new client
 * <ClientFormModal
 *   open={isCreateModalOpen}
 *   mode="create"
 *   onSubmit={async (payload) => {
 *     await createClientMutation.mutateAsync(payload);
 *     setIsCreateModalOpen(false);
 *   }}
 *   onClose={() => setIsCreateModalOpen(false)}
 *   isSubmitting={createClientMutation.isPending}
 *   error={createClientMutation.error?.message}
 * />
 * 
 * @example
 * // Edit existing client
 * <ClientFormModal
 *   open={isEditModalOpen}
 *   mode="edit"
 *   initialClient={selectedClient}
 *   onSubmit={async (payload) => {
 *     await updateClientMutation.mutateAsync({
 *       id: selectedClient.id,
 *       ...payload
 *     });
 *     setIsEditModalOpen(false);
 *   }}
 *   onClose={() => setIsEditModalOpen(false)}
 *   isSubmitting={updateClientMutation.isPending}
 *   error={updateClientMutation.error?.message}
 * />
 * 
 * @param {ClientFormModalProps} props - Component props
 * @returns {JSX.Element} Client form modal component
 */
export const ClientFormModal: FC<ClientFormModalProps> = ({
  open,
  mode,
  initialClient,
  onSubmit,
  onClose,
  isSubmitting,
  error,
}) => {
  const { t } = useTranslation('clients');
  
  const initialValues = useMemo<FormValues>(() => {
    if (!initialClient) {
      return DEFAULT_VALUES;
    }
    return {
      name: initialClient.name ?? '',
      email: initialClient.email ?? '',
      phone: initialClient.phone ?? '',
      address: initialClient.address ?? '',
      notes: initialClient.notes ?? '',
      status: initialClient.status,
      billing_contact_person: initialClient.billing_contact_person ?? '',
      billing_email: initialClient.billing_email ?? '',
      billing_phone: initialClient.billing_phone ?? '',
      billing_address: initialClient.billing_address ?? '',
      billing_city: initialClient.billing_city ?? '',
      billing_state: initialClient.billing_state ?? '',
      billing_postal_code: initialClient.billing_postal_code ?? '',
      billing_country: initialClient.billing_country ?? '',
      billing_tax_id: initialClient.billing_tax_id ?? '',
    };
  }, [initialClient]);

  // State to toggle billing address section visibility
  const hasBillingData = initialClient && (
    initialClient.billing_contact_person ||
    initialClient.billing_email ||
    initialClient.billing_phone ||
    initialClient.billing_address ||
    initialClient.billing_city ||
    initialClient.billing_state ||
    initialClient.billing_postal_code ||
    initialClient.billing_country ||
    initialClient.billing_tax_id
  );
  const [showBillingAddress, setShowBillingAddress] = useState(!!hasBillingData);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: initialValues,
  });

  useEffect(() => {
    if (open) {
      reset(initialValues);
      // Reset billing address toggle when modal opens
      setShowBillingAddress(!!hasBillingData);
    }
  }, [initialValues, open, reset, hasBillingData]);

  const handleFormSubmit = async (values: FormValues) => {
    const payload: ClientPayload = {
      name: values.name.trim(),
      status: values.status,
      email: values.email.trim() ? values.email.trim() : undefined,
      phone: values.phone.trim() ? values.phone.trim() : undefined,
      address: values.address.trim() ? values.address.trim() : undefined,
      notes: values.notes.trim() ? values.notes.trim() : undefined,
      billing_contact_person: values.billing_contact_person.trim() ? values.billing_contact_person.trim() : undefined,
      billing_email: values.billing_email.trim() ? values.billing_email.trim() : undefined,
      billing_phone: values.billing_phone.trim() ? values.billing_phone.trim() : undefined,
      billing_address: values.billing_address.trim() ? values.billing_address.trim() : undefined,
      billing_city: values.billing_city.trim() ? values.billing_city.trim() : undefined,
      billing_state: values.billing_state.trim() ? values.billing_state.trim() : undefined,
      billing_postal_code: values.billing_postal_code.trim() ? values.billing_postal_code.trim() : undefined,
      billing_country: values.billing_country.trim() ? values.billing_country.trim() : undefined,
      billing_tax_id: values.billing_tax_id.trim() ? values.billing_tax_id.trim() : undefined,
    };

    await onSubmit(payload);
  };

  const statusOptions = getStatusOptions(t);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? t('addClient') : t('editClient')}
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isSubmitting}
          >
            {isSubmitting ? t('saving') : mode === 'create' ? t('createClient') : t('saveChanges')}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-5" onSubmit={handleSubmit(handleFormSubmit)}>
        {error ? <Alert type="error" message={error} /> : null}

        <Input
          id="client-name"
          label={t('form.name.label')}
          placeholder={t('form.name.placeholder')}
          autoFocus
          required
          {...register('name', { required: t('form.name.required') })}
          error={errors.name?.message}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="client-email"
            label={t('form.email.label')}
            type="email"
            placeholder={t('form.email.placeholder')}
            {...register('email', {
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: t('form.email.invalid'),
              },
            })}
            error={errors.email?.message}
          />
          <Input
            id="client-phone"
            label={t('form.phone.label')}
            type="tel"
            placeholder={t('form.phone.placeholder')}
            {...register('phone')}
            error={errors.phone?.message}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Textarea
            label={t('form.address.label')}
            rows={3}
            placeholder={t('form.address.placeholder')}
            {...register('address')}
            error={errors.address?.message}
          />
          <Textarea
            label={t('form.notes.label')}
            rows={3}
            placeholder={t('form.notes.placeholder')}
            {...register('notes')}
            error={errors.notes?.message}
          />
        </div>

        <div className="border-t border-gray-200 pt-5 dark:border-gray-700">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={showBillingAddress}
              onChange={(e) => setShowBillingAddress(e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 dark:border-gray-400 text-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-0 bg-transparent"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('form.billing.toggle')}
            </span>
          </label>
        </div>

        {showBillingAddress && (
          <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('form.billing.title')}
            </h4>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="billing-contact-person"
                label={t('form.contactPerson.label')}
                placeholder={t('form.contactPerson.placeholder')}
                {...register('billing_contact_person')}
              />
              <Input
                id="billing-tax-id"
                label={t('form.vatNumber.label')}
                placeholder={t('form.vatNumber.placeholder')}
                {...register('billing_tax_id')}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="billing-email"
                label={t('form.billing.email')}
                type="email"
                placeholder={t('form.email.placeholder')}
                {...register('billing_email', {
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: t('form.email.invalid'),
                  },
                })}
                error={errors.billing_email?.message}
              />
              <Input
                id="billing-phone"
                label={t('form.billing.phone')}
                type="tel"
                placeholder={t('form.phone.placeholder')}
                {...register('billing_phone')}
              />
            </div>

            <Input
              id="billing-address"
              label={t('form.billing.address')}
              placeholder={t('form.billing.addressPlaceholder')}
              {...register('billing_address')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="billing-city"
                label={t('form.city.label')}
                placeholder={t('form.city.placeholder')}
                {...register('billing_city')}
              />
              <Input
                id="billing-state"
                label={t('form.billing.state')}
                placeholder={t('form.billing.statePlaceholder')}
                {...register('billing_state')}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="billing-postal-code"
                label={t('form.zipCode.label')}
                placeholder={t('form.zipCode.placeholder')}
                {...register('billing_postal_code')}
              />
              <Input
                id="billing-country"
                label={t('form.country.label')}
                placeholder={t('form.country.placeholder')}
                {...register('billing_country')}
              />
            </div>
          </div>
        )}

        <div>
          <Select
            id="client-status-select"
            label={t('status.label')}
            {...register('status', { required: true })}
            error={errors.status?.message}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </form>
    </Modal>
  );
};
