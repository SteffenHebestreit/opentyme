/**
 * @fileoverview Modal for recording standalone expenses not tied to invoices.
 * 
 * Allows recording general business expenses like office rent, utilities, or
 * software subscriptions that aren't billable to a specific client/invoice.
 * 
 * @module components/business/payments/AddExpenseModal
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { createPayment } from '../../../api/services/payment.service';
import { Input, CustomSelect, Textarea } from '../../forms';

/**
 * Props for the AddExpenseModal component.
 * 
 * @interface AddExpenseModalProps
 * @property {boolean} isOpen - Whether the modal is currently visible
 * @property {() => void} onClose - Handler for modal close
 * @property {() => void} onExpenseAdded - Handler called after successful expense recording
 */
interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExpenseAdded: () => void;
}

/**
 * Modal component for adding standalone expenses.
 * 
 * Displays a form to record expenses like office rent, utilities, software subscriptions,
 * etc. that aren't tied to a specific client or invoice. All amounts are stored as positive
 * values with payment_type='expense' determining they should be subtracted in calculations.
 * 
 * Form Fields:
 * - **Amount** (required): Expense amount (always positive)
 * - **Description** (required): What the expense is for
 * - **Expense Date** (required): When the expense occurred
 * - **Payment Method** (optional): How it was paid (bank transfer, credit card, etc.)
 * - **Transaction ID** (optional): Reference number or transaction ID
 * - **Notes** (optional): Additional details
 * 
 * @component
 * @example
 * <AddExpenseModal
 *   isOpen={showExpenseModal}
 *   onClose={() => setShowExpenseModal(false)}
 *   onExpenseAdded={refetchPayments}
 * />
 */
export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  onExpenseAdded,
}) => {
  const { t } = useTranslation('payments');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<string>('bank_transfer');
  const [transactionId, setTransactionId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const expenseAmount = parseFloat(amount);
      
      // Validation
      if (isNaN(expenseAmount) || expenseAmount <= 0) {
        setError(t('addExpense.errors.invalidAmount'));
        setIsSubmitting(false);
        return;
      }

      if (!description.trim()) {
        setError(t('addExpense.errors.descriptionRequired'));
        setIsSubmitting(false);
        return;
      }

      // Create expense payment (no client_id or invoice_id)
      await createPayment({
        client_id: null,
        invoice_id: null,
        amount: expenseAmount,
        payment_type: 'expense',
        payment_method: paymentMethod,
        transaction_id: transactionId || null,
        payment_date: expenseDate,
        notes: description + (notes ? `\n\n${notes}` : ''),
      });

      // Success!
      onExpenseAdded();
      onClose();
      
      // Reset form
      setAmount('');
      setDescription('');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('bank_transfer');
      setTransactionId('');
      setNotes('');
    } catch (err: any) {
      console.error('Error recording expense:', err);
      setError(err.response?.data?.message || err.response?.data?.details || t('addExpense.errors.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setError(null);
      onClose();
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title={t('addExpense.title')}
      icon={<Wallet className="h-4 w-4" />}
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            {t('messages.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            form="expense-form"
            isLoading={isSubmitting}
          >
            {isSubmitting ? t('messages.saving') : t('addExpense.submit')}
          </Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit} className="space-y-5">
        {error && <Alert type="error" message={error} />}

        <Input
          label={t('addExpense.fields.description')}
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('addExpense.fields.descriptionPlaceholder')}
          required
        />

        <div className="grid grid-cols-2 gap-4 [&>div]:mb-0">
          <Input
            label={t('addExpense.fields.amount')}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            required
            className="tabular-nums"
          />

          <Input
            label={t('addExpense.fields.date')}
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 [&>div]:mb-0">
          <CustomSelect
            label={t('addExpense.fields.paymentMethod')}
            value={paymentMethod}
            onChange={(value) => setPaymentMethod(value)}
            options={[
              { value: 'bank_transfer', label: t('addExpense.methods.bankTransfer') },
              { value: 'credit_card', label: t('addExpense.methods.creditCard') },
              { value: 'debit_card', label: t('addExpense.methods.debitCard') },
              { value: 'cash', label: t('addExpense.methods.cash') },
              { value: 'check', label: t('addExpense.methods.check') },
              { value: 'paypal', label: t('addExpense.methods.paypal') },
              { value: 'other', label: t('addExpense.methods.other') }
            ]}
          />

          <Input
            label={t('addExpense.fields.transactionId')}
            type="text"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder={t('addExpense.fields.transactionIdPlaceholder')}
          />
        </div>

        <Textarea
          label={t('addExpense.fields.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('addExpense.fields.notesPlaceholder')}
          rows={3}
        />
      </form>
    </Modal>
  );
};
