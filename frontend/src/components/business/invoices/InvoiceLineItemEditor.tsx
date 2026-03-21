/**
 * @fileoverview Invoice line item editor component for adding/editing line items.
 * Provides a simple interface for managing invoice line items with description,
 * quantity, rate type, and price fields.
 */

import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../common/Button';
import { Input, CustomSelect } from '../../forms';
import { InvoiceLineItemPayload } from '../../../api/types';

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

  const handleAddItem = () => {
    onChange([...lineItems, createEmptyLineItem()]);
  };

  const handleRemoveItem = (id: string) => {
    onChange(lineItems.filter(item => item.id !== id));
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('lineItems.title', 'Line Items')}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddItem}
          disabled={disabled}
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('lineItems.addItem', 'Add Item')}
        </Button>
      </div>

      {lineItems.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          <p className="text-sm">{t('lineItems.empty', 'No line items added yet.')}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleAddItem}
            disabled={disabled}
            className="mt-2"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('lineItems.addFirstItem', 'Add your first item')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Header row - hidden on mobile */}
          <div className="hidden md:grid md:grid-cols-12 gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 px-1">
            <div className="col-span-5">{t('lineItems.headers.description', 'Description')}</div>
            <div className="col-span-2">{t('lineItems.headers.quantity', 'Qty')}</div>
            <div className="col-span-2">{t('lineItems.headers.rateType', 'Type')}</div>
            <div className="col-span-1">{t('lineItems.headers.unitPrice', 'Rate')}</div>
            <div className="col-span-1">{t('lineItems.headers.total', 'Total')}</div>
            <div className="col-span-1"></div>
          </div>

          {lineItems.map((item, index) => (
            <div
              key={item.id}
              className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              {/* Mobile: Stacked layout */}
              <div className="md:hidden space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('lineItems.itemNumber', 'Item {{number}}', { number: index + 1 })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveItem(item.id)}
                    disabled={disabled}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <Input
                  label={t('lineItems.headers.description', 'Description')}
                  value={item.description}
                  onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                  placeholder={t('lineItems.description.placeholder', 'e.g., Development work')}
                  disabled={disabled}
                />

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={t('lineItems.headers.quantity', 'Quantity')}
                    type="number"
                    step="0.25"
                    min="0"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                    placeholder="0"
                    disabled={disabled}
                  />

                  <CustomSelect
                    label={t('lineItems.headers.rateType', 'Type')}
                    value={item.rate_type}
                    onChange={(value) => handleItemChange(item.id, 'rate_type', value as RateType)}
                    options={rateTypeOptions}
                    disabled={disabled}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={t('lineItems.headers.unitPrice', 'Rate')}
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unit_price}
                    onChange={(e) => handleItemChange(item.id, 'unit_price', e.target.value)}
                    placeholder="0.00"
                    disabled={disabled}
                  />

                  <Input
                    label={t('lineItems.headers.total', 'Total')}
                    type="number"
                    step="0.01"
                    value={item.total_price}
                    disabled
                    className="bg-gray-100 dark:bg-gray-700"
                  />
                </div>
              </div>

              {/* Desktop: Grid layout */}
              <div className="hidden md:grid md:grid-cols-12 gap-2 items-start">
                <div className="col-span-5">
                  <Input
                    value={item.description}
                    onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                    placeholder={t('lineItems.description.placeholder', 'Description (optional)')}
                    disabled={disabled}
                  />
                </div>

                <div className="col-span-2">
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                    placeholder="0"
                    disabled={disabled}
                  />
                </div>

                <div className="col-span-2">
                  <CustomSelect
                    value={item.rate_type}
                    onChange={(value) => handleItemChange(item.id, 'rate_type', value as RateType)}
                    options={rateTypeOptions}
                    disabled={disabled}
                  />
                </div>

                <div className="col-span-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unit_price}
                    onChange={(e) => handleItemChange(item.id, 'unit_price', e.target.value)}
                    placeholder="0.00"
                    disabled={disabled}
                  />
                </div>

                <div className="col-span-1">
                  <Input
                    type="number"
                    step="0.01"
                    value={item.total_price}
                    disabled
                    className="bg-gray-100 dark:bg-gray-700"
                  />
                </div>

                <div className="col-span-1 flex justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveItem(item.id)}
                    disabled={disabled}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {/* Total summary */}
          {lineItems.length > 0 && (
            <div className="flex justify-end pt-2 pr-12">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('lineItems.subtotal', 'Subtotal')}: {' '}
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {lineItems.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}
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
