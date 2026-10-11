/**
 * @fileoverview Status chip for invoices with one consistent colour and icon per status.
 *
 * @module components/business/invoices/InvoiceStatusBadge
 */

import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  FilePen,
  LucideIcon,
  Send,
  XCircle,
} from 'lucide-react';
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

/**
 * Icon per status, so the status reads without relying on colour alone
 * (e.g. paid vs. overdue for red-green colour blindness).
 */
const invoiceStatusIcon: Record<InvoiceStatus, LucideIcon> = {
  draft: FilePen,
  sent: Send,
  partially_paid: CircleDashed,
  paid: CheckCircle2,
  overdue: AlertTriangle,
  cancelled: XCircle,
};

/** Icon size matching the badge's text size. */
const iconSizeClass: Record<BadgeSize, string> = {
  sm: 'h-3 w-3',
  md: 'h-3 w-3',
  lg: 'h-3.5 w-3.5',
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
 * Invoice status as a tinted chip with a status icon. Cancelled invoices are shown muted and
 * struck through.
 *
 * @example
 * <InvoiceStatusBadge status={invoice.status} />
 */
export const InvoiceStatusBadge: FC<InvoiceStatusBadgeProps> = ({ status, size = 'md', className }) => {
  const { t } = useTranslation('invoices');
  const cancelled = status === 'cancelled';
  const Icon = invoiceStatusIcon[status as InvoiceStatus];

  return (
    <Badge
      variant={invoiceStatusVariant[status as InvoiceStatus] ?? 'gray'}
      size={size}
      dot={!Icon}
      icon={Icon ? <Icon className={iconSizeClass[size]} aria-hidden="true" /> : undefined}
      className={cn(cancelled && 'line-through opacity-80', className)}
    >
      {t(`status.${invoiceStatusKey(status)}`, { defaultValue: status })}
    </Badge>
  );
};

export default InvoiceStatusBadge;
