/**
 * @fileoverview Status chip for invoices with one consistent colour per status.
 *
 * @module components/business/invoices/InvoiceStatusBadge
 */

import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, BadgeSize, BadgeVariant } from '../../common/Badge';
import { InvoiceStatus } from '../../../api/types';
import { cn } from '../../../lib/cn';

/** Semantic colour per status: neutral draft, blue sent, amber partial, green paid, red overdue. */
const invoiceStatusVariant: Record<InvoiceStatus, BadgeVariant> = {
  draft: 'gray',
  sent: 'blue',
  partially_paid: 'amber',
  paid: 'green',
  overdue: 'red',
  cancelled: 'gray',
};

/** Key below `invoices:status.` for a status (`partially_paid` is translated as `partiallyPaid`). */
const invoiceStatusKey = (status: string): string =>
  status === 'partially_paid' ? 'partiallyPaid' : status;

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus | string;
  size?: BadgeSize;
  className?: string;
}

/**
 * Invoice status as a tinted chip. Cancelled invoices are shown muted and struck through.
 *
 * @example
 * <InvoiceStatusBadge status={invoice.status} />
 */
export const InvoiceStatusBadge: FC<InvoiceStatusBadgeProps> = ({ status, size = 'md', className }) => {
  const { t } = useTranslation('invoices');
  const cancelled = status === 'cancelled';

  return (
    <Badge
      variant={invoiceStatusVariant[status as InvoiceStatus] ?? 'gray'}
      size={size}
      dot={!cancelled}
      className={cn(cancelled && 'line-through opacity-80', className)}
    >
      {t(`status.${invoiceStatusKey(status)}`, { defaultValue: status })}
    </Badge>
  );
};

export default InvoiceStatusBadge;
