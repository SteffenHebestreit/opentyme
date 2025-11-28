/**
 * @fileoverview Modal for recording standalone expenses not tied to invoices.
 * 
 * Allows recording general business expenses like office rent, utilities, or
 * software subscriptions that aren't billable to a specific client/invoice.
 * 
 * @module components/business/payments/AddExpenseModal
 */

import React, { useState } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../common/Button';
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
        setError('Please enter a valid amount (positive number)');
        setIsSubmitting(false);
        return;
      }

      if (!description.trim()) {
        setError('Please enter a description');
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
      setError(err.response?.data?.message || err.response?.data?.details || 'Failed to record expense');
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
      title="Add Expense"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            form="expense-form"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Add Expense'}
          </Button>
        </div>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </div>
        )}

        <Input
          label="Description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g., Office rent - January 2025"
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            required
          />

          <Input
            label="Date"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            required
          />
        </div>

        <CustomSelect
          label="Payment Method"
          value={paymentMethod}
          onChange={(value) => setPaymentMethod(value)}
          options={[
            { value: 'bank_transfer', label: 'Bank Transfer' },
            { value: 'credit_card', label: 'Credit Card' },
            { value: 'debit_card', label: 'Debit Card' },
            { value: 'cash', label: 'Cash' },
            { value: 'check', label: 'Check' },
            { value: 'paypal', label: 'PayPal' },
            { value: 'other', label: 'Other' }
          ]}
        />

        <Input
          label="Transaction ID (optional)"
          type="text"
          value={transactionId}
          onChange={(e) => setTransactionId(e.target.value)}
          placeholder="e.g., TXN-2025-01-123"
        />

        <Textarea
          label="Additional Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional details..."
          rows={3}
        />
      </form>
    </Modal>
  );
};
