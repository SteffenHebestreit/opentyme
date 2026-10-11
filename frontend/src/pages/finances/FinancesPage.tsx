/**
 * @fileoverview Main finances page with tabbed interface for managing financial data.
 * 
 * Provides centralized access to:
 * - Invoice management
 * - Payment tracking
 * - Expense management
 * 
 * Uses tab navigation for better UX and organization.
 * 
 * @module pages/finances/FinancesPage
 */

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import InvoiceList from '@/components/business/invoices/InvoiceList';
import PaymentsPage from '@/pages/payments/PaymentsPage';
import ExpensesPage from '@/pages/expenses/ExpensesPage';
import TaxPrepaymentsPage from '@/pages/finances/TaxPrepaymentsPage';
import RecurringInvoicesPage from '@/pages/finances/RecurringInvoicesPage';
import { fetchPayments } from '@/api/services/payment.service';
import { fetchInvoices } from '@/api/services/invoice.service';
import { fetchExpenseSummary } from '@/api/services/expense.service';
import { Payment, Invoice } from '@/api/types';
import { formatCurrency } from '@/utils/currency';
import { PageHeader, StatCard, Tabs, TabPanel } from '@/components/common';
import type { Tab } from '@/components/common';
import { fieldClasses, fieldLabelClass } from '@/components/forms/fieldStyles';
import { cn } from '@/lib/cn';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  FileText,
  Landmark,
  Receipt,
  Repeat,
  Scale,
  Wallet,
} from 'lucide-react';

type FinanceTab = 'invoices' | 'recurring' | 'payments' | 'expenses' | 'tax-prepayments';

/**
 * Main finances page component with tabbed interface.
 * 
 * Features:
 * - Tab navigation between finance sections (shared Tabs, sliding indicator)
 * - Date range filter in the page header with key figures below it
 * - Key figures count to their new value when the range or data changes
 * - Dark mode support
 * 
 * @component
 * @example
 * <Route path="/finances" element={<FinancesPage />} />
 * 
 * @returns {JSX.Element} Finances page with tab navigation
 */
export default function FinancesPage() {
  const { t } = useTranslation('finances');
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<FinanceTab>('invoices');
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState<string>('');
  // Set by `?wizard=start` (dashboard "Create invoice"): the invoices tab opens its create form once
  const [createInvoiceRequested, setCreateInvoiceRequested] = useState(false);
  
  // Handle URL params for tab switching, invoice search and the create-invoice entry point
  useEffect(() => {
    const tab = searchParams.get('tab') as FinanceTab | null;
    const search = searchParams.get('search');
    const startWizard = searchParams.get('wizard') === 'start';
    
    if (tab && ['invoices', 'recurring', 'payments', 'expenses', 'tax-prepayments'].includes(tab)) {
      setActiveTab(tab);
    }
    
    if (!search && !startWizard) {
      return;
    }

    const newParams = new URLSearchParams(searchParams);
    if (search) {
      setInvoiceSearchTerm(search);
      // Clear the search param after capturing it
      newParams.delete('search');
      newParams.delete('tab');
    }
    if (startWizard) {
      setActiveTab('invoices');
      setCreateInvoiceRequested(true);
      // Remove it so a reload doesn't open the form again
      newParams.delete('wizard');
    }
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Handler for navigating from payments to invoices
  const handleNavigateToInvoice = (invoiceId: string) => {
    // Find the invoice number for this invoice (we can search by ID or number)
    const invoice = invoices.find(inv => inv.id === invoiceId);
    const searchTerm = invoice?.invoice_number || invoiceId;
    setInvoiceSearchTerm(searchTerm);
    setActiveTab('invoices');
  };
  
  // Initialize date filters: Start from January 1st of current year to today
  // Use local date formatting to avoid timezone shifts (toISOString converts to UTC)
  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const today = new Date();
  const currentYear = today.getFullYear();
  const jan1 = new Date(currentYear, 0, 1); // January 1st of current year
  const [startDate, setStartDate] = useState<string>(formatLocalDate(jan1));
  const [endDate, setEndDate] = useState<string>(formatLocalDate(today));

  // Fetch data for calculations
  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ['payments'],
    queryFn: fetchPayments,
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: fetchInvoices,
  });

  // Fetch expense summary for the date range
  const { data: expenseSummary } = useQuery({
    queryKey: ['expenses', 'summary', { date_from: startDate, date_to: endDate }],
    queryFn: () => fetchExpenseSummary({ date_from: startDate, date_to: endDate }),
  });

  // Calculate totals based on date range
  const totals = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include the entire end date

    // Filter payments by date range
    const filteredPayments = payments.filter(payment => {
      const paymentDate = new Date(payment.payment_date);
      return paymentDate >= start && paymentDate <= end;
    });

    // Filter invoices by date range
    const filteredInvoices = invoices.filter(invoice => {
      const invoiceDate = new Date(invoice.issue_date);
      return invoiceDate >= start && invoiceDate <= end;
    });

    // Calculate payment totals
    const income = filteredPayments
      .filter(p => p.payment_type === 'payment' || p.payment_type === 'vat_refund' || p.payment_type === 'income_tax_refund')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const refunds = filteredPayments
      .filter(p => p.payment_type === 'refund')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    // Get approved expenses from expense summary (only approved expenses count)
    const expenses = expenseSummary?.approved_amount || 0;
    const expensesNet = expenseSummary?.approved_net_amount || 0;
    const expensesTax = expenseSummary?.approved_tax_amount || 0;

    // Calculate invoice totals with tax breakdown
    const totalInvoiced = filteredInvoices
      .reduce((sum, inv) => sum + Number(inv.total_amount), 0);

    const invoiceNet = filteredInvoices
      .reduce((sum, inv) => sum + Number(inv.sub_total), 0);

    const invoiceTax = filteredInvoices
      .reduce((sum, inv) => sum + Number(inv.tax_amount), 0);

    // Calculate paid invoices breakdown (for income card - shows what was actually paid)
    const paidInvoicesList = filteredInvoices.filter(inv => inv.status === 'paid');
    const paidInvoices = paidInvoicesList
      .reduce((sum, inv) => sum + Number(inv.total_amount), 0);
    const paidInvoicesNet = paidInvoicesList
      .reduce((sum, inv) => sum + Number(inv.sub_total), 0);
    const paidInvoicesTax = paidInvoicesList
      .reduce((sum, inv) => sum + Number(inv.tax_amount), 0);

    // Calculate unpaid invoices (sent, overdue, partially_paid - not draft or cancelled)
    const unpaidInvoices = filteredInvoices
      .filter(inv => inv.status !== 'paid' && inv.status !== 'draft' && inv.status !== 'cancelled')
      .reduce((sum, inv) => sum + Number(inv.total_amount), 0);

    const netAmount = income - refunds - expenses;

    return {
      income,
      refunds,
      expenses,
      expensesNet,
      expensesTax,
      netAmount,
      totalInvoiced,
      invoiceNet,
      invoiceTax,
      paidInvoices,
      paidInvoicesNet,
      paidInvoicesTax,
      unpaidInvoices,
    };
  }, [payments, invoices, expenseSummary, startDate, endDate]);

  const tabs: Tab[] = [
    { id: 'invoices', label: t('tabs.invoices'), icon: FileText },
    { id: 'recurring', label: t('tabs.recurring', { defaultValue: 'Recurring' }), icon: Repeat },
    { id: 'payments', label: t('tabs.payments'), icon: CreditCard },
    { id: 'expenses', label: t('tabs.expenses'), icon: Receipt },
    { id: 'tax-prepayments', label: t('tabs.taxPrepayments'), icon: Landmark },
  ];

  const currencyFormat = (value: number) => formatCurrency(value);
  const dateInputClass = cn(fieldClasses(), 'w-full sm:w-40');

  return (
    <div className="space-y-6">
      {/* Page Header with the date range */}
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={Wallet}
        actions={
          <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:items-end">
            <div>
              <label htmlFor="finances-start-date" className={fieldLabelClass()}>
                {t('dateRange.startDate')}
              </label>
              <input
                id="finances-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={dateInputClass}
              />
            </div>
            <div>
              <label htmlFor="finances-end-date" className={fieldLabelClass()}>
                {t('dateRange.endDate')}
              </label>
              <input
                id="finances-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={dateInputClass}
              />
            </div>
          </div>
        }
      />

      {/* Key figures for the selected range */}
      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('summary.totalIncome')}
          value={totals.income}
          format={currencyFormat}
          icon={ArrowDownLeft}
          variant="green"
          hint={
            totals.paidInvoicesNet > 0 && totals.paidInvoicesTax > 0 ? (
              <>
                <span className="tabular-nums">
                  {formatCurrency(totals.paidInvoicesNet)} / {formatCurrency(totals.paidInvoicesTax)}
                </span>{' '}
                · {t('summary.netTax')}
              </>
            ) : undefined
          }
        />

        <StatCard
          label={t('summary.totalExpensesRefunds')}
          value={totals.expenses + totals.refunds}
          format={currencyFormat}
          icon={ArrowUpRight}
          variant="red"
          hint={
            totals.expensesNet > 0 && totals.expensesTax > 0 ? (
              <>
                <span className="tabular-nums">
                  {formatCurrency(totals.expensesNet)} / {formatCurrency(totals.expensesTax)}
                </span>{' '}
                · {t('summary.netTax')}
              </>
            ) : undefined
          }
        />

        <StatCard
          label={t('summary.totalInvoiced')}
          value={totals.totalInvoiced}
          format={currencyFormat}
          icon={FileText}
          variant="blue"
          footer={
            <dl className="space-y-1 text-xs tabular-nums">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{t('summary.paid')}</dt>
                <dd className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(totals.paidInvoices)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{t('summary.unpaid')}</dt>
                <dd className="font-medium text-amber-600 dark:text-amber-400">{formatCurrency(totals.unpaidInvoices)}</dd>
              </div>
            </dl>
          }
        />

        <StatCard
          label={t('summary.netAmount')}
          value={totals.netAmount}
          format={currencyFormat}
          icon={Scale}
          variant={totals.netAmount >= 0 ? 'indigo' : 'orange'}
        />
      </div>

      {/* Tabs */}
      <div className="space-y-6">
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(tabId) => setActiveTab(tabId as FinanceTab)}
        />

        <TabPanel tabId="invoices" activeTab={activeTab}>
          <InvoiceList
            startDate={startDate}
            endDate={endDate}
            initialSearchTerm={invoiceSearchTerm}
            openCreateForm={createInvoiceRequested}
            onCreateFormOpened={() => setCreateInvoiceRequested(false)}
          />
        </TabPanel>
        <TabPanel tabId="recurring" activeTab={activeTab}>
          <RecurringInvoicesPage />
        </TabPanel>
        <TabPanel tabId="payments" activeTab={activeTab}>
          <PaymentsPage startDate={startDate} endDate={endDate} onNavigateToInvoice={handleNavigateToInvoice} />
        </TabPanel>
        <TabPanel tabId="expenses" activeTab={activeTab}>
          <ExpensesPage startDate={startDate} endDate={endDate} />
        </TabPanel>
        <TabPanel tabId="tax-prepayments" activeTab={activeTab}>
          <TaxPrepaymentsPage />
        </TabPanel>
      </div>
    </div>
  );
}
