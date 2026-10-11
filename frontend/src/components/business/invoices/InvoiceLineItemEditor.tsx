/**
 * @fileoverview Invoice line item editor component for adding/editing line items.
 * Provides a simple interface for managing invoice line items with description,
 * quantity, rate type, and price fields.
 */

import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../common/Button';
import { fieldClasses } from '../../forms/fieldStyles';
import { InvoiceLineItemPayload } from '../../../api/types';
import { cn } from '../../../lib/cn';

export type RateType = 'hourly' | 'daily';

export interface LineItemFormData {
  id: string; // Temporary ID for React key
  description: string;
  quantity: string;
  rate_type: RateType;
  unit_price: string;
  total_price: string;
}

interface InvoiceLineItemEditorProps {
  lineItems: LineItemFormData[];
  onChange: (items: LineItemFormData[]) => void;
  disabled?: boolean;
}

/**
 * Generate a temporary ID for new line items
 */
const generateTempId = () => `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Create an empty line item with default values
 */
export const createEmptyLineItem = (): LineItemFormData => ({
  id: generateTempId(),
  description: '',
  quantity: '',
  rate_type: 'hourly',
  unit_price: '',
  total_price: '',
});

/** Column layout shared by the header and every row on wide screens. */
const rowGrid = 'lg:grid-cols-[minmax(0,1fr)_6rem_7.5rem_8rem_8rem_2.25rem] lg:items-center';

/** Field caption: visible on narrow screens, screen-reader only on wide ones (the header row labels them). */
const fieldCaption = 'mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400 lg:sr-only';

/** Length of the fade-out before a removed row is dropped (matches `animate-fade-out`). */
const REMOVE_MS = 150;

/**
 * Invoice line item editor component.
 * Provides a simple interface for managing invoice line items.
 * Project is already selected at the invoice level - line items just need
 * description, quantity, rate type, and price.
 */
export const InvoiceLineItemEditor: FC<InvoiceLineItemEditorProps> = ({
  lineItems,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation('invoices');

  const rateTypeOptions = useMemo(() => [
    { value: 'hourly', label: t('lineItems.rateType.hourly', 'Hours') },
    { value: 'daily', label: t('lineItems.rateType.daily', 'Days') },
  ], [t]);

  // Rows fade out briefly before they are removed
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const latestItems = useRef(lineItems);
  latestItems.current = lineItems;
  const removeTimers = useRef<number[]>([]);
  useEffect(() => {
    const timers = removeTimers.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const handleAddItem = () => {
    onChange([...lineItems, createEmptyLineItem()]);
  };

  const handleRemoveItem = (id: string) => {
    if (removingIds.includes(id)) return;
    setRemovingIds((prev) => [...prev, id]);
    const timer = window.setTimeout(() => {
      onChange(latestItems.current.filter(item => item.id !== id));
      setRemovingIds((prev) => prev.filter((removingId) => removingId !== id));
    }, REMOVE_MS);
    removeTimers.current.push(timer);
  };

  const handleItemChange = (id: string, field: keyof LineItemFormData, value: string) => {
    onChange(lineItems.map(item => {
      if (item.id !== id) return item;

      const updated = { ...item, [field]: value };

      // Auto-calculate total when quantity or unit_price changes
      if (field === 'quantity' || field === 'unit_price') {
        const quantity = parseFloat(field === 'quantity' ? value : updated.quantity) || 0;
        const unitPrice = parseFloat(field === 'unit_price' ? value : updated.unit_price) || 0;
        updated.total_price = (quantity * unitPrice).toFixed(2);
      }

      return updated;
    }));
  };

  const subtotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="eyebrow">
          {t('lineItems.title', 'Line Items')}
        </h3>
        {lineItems.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddItem}
            disabled={disabled}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            {t('lineItems.addItem', 'Add Item')}
          </Button>
        )}
      </div>

      {lineItems.length === 0 ? (
        <div className="animate-fade-in rounded-xl border border-dashed border-gray-300 bg-gray-50/50 px-6 py-8 text-center dark:border-gray-800 dark:bg-gray-900/30">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('lineItems.empty', 'No line items added yet.')}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddItem}
            disabled={disabled}
            className="mt-3"
            leftIcon={<Plus className="h-4 w-4" />}
          >
            {t('lineItems.addFirstItem', 'Add your first item')}
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
          {/* Header row - wide screens only */}
          <div
            className={cn(
              'hidden gap-3 border-b border-gray-100 bg-gray-50/80 px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-gray-500 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400 lg:grid',
              rowGrid
            )}
            aria-hidden="true"
          >
            <div>{t('lineItems.headers.description', 'Description')}</div>
            <div className="text-right">{t('lineItems.headers.quantity', 'Qty')}</div>
            <div>{t('lineItems.headers.rateType', 'Type')}</div>
            <div className="text-right">{t('lineItems.headers.unitPrice', 'Rate')}</div>
            <div className="text-right">{t('lineItems.headers.total', 'Total')}</div>
            <div />
          </div>

          <ul className="divide-y divide-gray-100 dark:divide-gray-800/70">
            {lineItems.map((item, index) => {
              const removing = removingIds.includes(item.id);
              const removeButton = (
                <button
                  type="button"
                  onClick={() => handleRemoveItem(item.id)}
                  disabled={disabled || removing}
                  aria-label={t('lineItems.removeItem', 'Remove item {{number}}', { number: index + 1 })}
                  title={t('lineItems.removeItem', 'Remove item {{number}}', { number: index + 1 })}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:pointer-events-none disabled:opacity-50 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              );

              return (
                <li
                  key={item.id}
                  className={cn('px-3 py-3 lg:py-2.5', removing ? 'animate-fade-out' : 'animate-fade-in')}
                >
                  {/* Narrow screens: item caption with remove action */}
                  <div className="mb-2 flex items-center justify-between lg:hidden">
                    <span className="eyebrow">
                      {t('lineItems.itemNumber', 'Item {{number}}', { number: index + 1 })}
                    </span>
                    {removeButton}
                  </div>

                  <div className={cn('grid grid-cols-2 gap-x-3 gap-y-2', rowGrid)}>
                    <label className="col-span-2 block lg:col-span-1">
                      <span className={fieldCaption}>{t('lineItems.headers.description', 'Description')}</span>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                        placeholder={t('lineItems.description.placeholder', 'Description (optional)')}
                        disabled={disabled}
                        className={fieldClasses()}
                      />
                    </label>

                    <label className="block">
                      <span className={fieldCaption}>{t('lineItems.headers.quantity', 'Qty')}</span>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                        placeholder="0"
                        disabled={disabled}
                        className={cn(fieldClasses(), 'text-right tabular-nums')}
                      />
                    </label>

                    <label className="block">
                      <span className={fieldCaption}>{t('lineItems.headers.rateType', 'Type')}</span>
                      <span className="relative block">
                        <select
                          value={item.rate_type}
                          onChange={(e) => handleItemChange(item.id, 'rate_type', e.target.value as RateType)}
                          disabled={disabled}
                          className={cn(fieldClasses(), 'cursor-pointer appearance-none pr-8')}
                        >
                          {rateTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <ChevronDown
                          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                          aria-hidden="true"
                        />
                      </span>
                    </label>

                    <label className="block">
                      <span className={fieldCaption}>{t('lineItems.headers.unitPrice', 'Rate')}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unit_price}
                        onChange={(e) => handleItemChange(item.id, 'unit_price', e.target.value)}
                        placeholder="0.00"
                        disabled={disabled}
                        className={cn(fieldClasses(), 'text-right tabular-nums')}
                      />
                    </label>

                    <div>
                      <span className={fieldCaption}>{t('lineItems.headers.total', 'Total')}</span>
                      <output
                        className="flex h-10 items-center justify-end rounded-lg bg-gray-50 px-3 text-sm font-medium tabular-nums text-gray-900 dark:bg-white/[0.03] dark:text-white"
                        aria-live="polite"
                      >
                        {item.total_price || '0.00'}
                      </output>
                    </div>

                    <div className="hidden lg:flex lg:justify-center">{removeButton}</div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Total summary */}
          <div className="flex items-baseline justify-end gap-3 border-t border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('lineItems.subtotal', 'Subtotal')}
            </span>
            <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-white">
              {subtotal.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Convert form data to API payload.
 * Uses description if provided, otherwise the invoice's project name will be used.
 */
export const lineItemsToPayload = (items: LineItemFormData[], projectName?: string): InvoiceLineItemPayload[] => {
  return items
    .filter(item => item.quantity && item.unit_price)
    .map(item => ({
      description: item.description || projectName || 'Services',
      quantity: parseFloat(item.quantity) || 0,
      unit_price: parseFloat(item.unit_price) || 0,
      total_price: parseFloat(item.total_price) || 0,
      rate_type: item.rate_type,
    }));
};

export default InvoiceLineItemEditor;
