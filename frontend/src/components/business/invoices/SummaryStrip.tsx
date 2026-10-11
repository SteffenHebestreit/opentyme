/**
 * @fileoverview Compact row of key figures for a finance tab (invoices, payments).
 *
 * Lighter than a grid of StatCards, so it can sit under the page-level stat tiles
 * without competing with them. Values count to their new number and briefly
 * highlight when filters or data change.
 *
 * @module components/business/invoices/SummaryStrip
 */

import { FC } from 'react';
import { AnimatedNumber } from '../../common/AnimatedNumber';
import { cn } from '../../../lib/cn';

export interface SummaryStripItem {
  key: string;
  label: string;
  value: number;
  /** Formats the (animated) value, e.g. as currency; defaults to a locale number */
  format?: (value: number) => string;
  /** Text colour classes for the value (light + dark), e.g. emerald for money in */
  tone?: string;
}

interface SummaryStripProps {
  items: SummaryStripItem[];
  className?: string;
}

export const SummaryStrip: FC<SummaryStripProps> = ({ items, className }) => (
  <dl
    className={cn(
      'grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-soft dark:border-gray-800 dark:bg-gray-800 dark:shadow-none lg:grid-cols-4',
      className
    )}
  >
    {items.map((item) => (
      <div key={item.key} className="min-w-0 bg-white px-5 py-4 dark:bg-gray-900">
        <dt className="eyebrow truncate">{item.label}</dt>
        <dd className={cn('mt-1 truncate text-lg font-semibold tracking-tight tabular-nums', item.tone ?? 'text-gray-900 dark:text-white')}>
          <AnimatedNumber value={item.value} format={item.format} />
        </dd>
      </div>
    ))}
  </dl>
);

export default SummaryStrip;
