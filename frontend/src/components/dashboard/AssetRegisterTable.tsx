/**
 * @fileoverview Asset Register Table component
 *
 * Displays a table of all depreciated assets with filtering options
 *
 * @module components/dashboard/AssetRegisterTable
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Package } from 'lucide-react';
import { Asset, getAssetRegister } from '../../api/services/depreciation.service';
import { formatCurrency } from '../../utils/currency';
import { formatYmd } from '../../utils/date';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { SkeletonItem } from '../common/Skeleton';
import { Table, Column } from '../common/Table';
import { Tabs } from '../common/Tabs';

type StatusFilter = 'all' | 'active' | 'fully_depreciated';

const statusFilters: StatusFilter[] = ['all', 'active', 'fully_depreciated'];
const TAB_PREFIX = 'asset-register-';

/**
 * AssetRegisterTable Component
 *
 * @returns Table showing all depreciated assets
 */
const AssetRegisterTable: React.FC = () => {
  const { t, i18n } = useTranslation('dashboard');
  const locale = i18n.language;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const currentYear = new Date().getFullYear();

  const { data, isLoading, error } = useQuery({
    queryKey: ['asset-register', currentYear, statusFilter === 'all' ? undefined : statusFilter],
    queryFn: () => getAssetRegister({
      year: currentYear,
      status: statusFilter === 'all' ? undefined : statusFilter,
    }),
  });

  const filterLabels: Record<StatusFilter, string> = {
    all: t('depreciation.register.filterAll'),
    active: t('depreciation.register.filterActive'),
    fully_depreciated: t('depreciation.register.filterDepreciated'),
  };

  const columns: Column<Asset>[] = useMemo(() => [
    {
      key: 'description',
      accessorKey: 'description',
      header: t('depreciation.register.columns.description'),
      render: (asset) => (
        <>
          <div className="font-medium text-gray-900 dark:text-white">{asset.description}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {asset.useful_life_category}
          </div>
        </>
      ),
      sortable: true,
    },
    {
      key: 'purchaseDate',
      accessorKey: 'purchase_date',
      header: t('depreciation.register.columns.purchaseDate'),
      className: 'whitespace-nowrap',
      render: (asset) => (
        <span className="tabular-nums text-gray-600 dark:text-gray-400">
          {formatYmd(asset.purchase_date, locale)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'netAmount',
      accessorKey: 'net_amount',
      header: t('depreciation.register.columns.netAmount'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (asset) => (
        <span className="font-medium tabular-nums text-gray-900 dark:text-white">
          {formatCurrency(asset.net_amount)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'years',
      accessorKey: 'depreciation_years',
      header: t('depreciation.register.columns.usefulLife'),
      align: 'center',
      className: 'whitespace-nowrap',
      render: (asset) => (
        <span className="tabular-nums text-gray-600 dark:text-gray-400">
          {t('depreciation.schedule.years', { count: asset.depreciation_years })}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'annual',
      accessorKey: 'annual_depreciation',
      header: t('depreciation.register.columns.annual'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (asset) => (
        <span className="tabular-nums text-gray-600 dark:text-gray-400">
          {formatCurrency(asset.annual_depreciation)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'remaining',
      accessorKey: 'remaining_value',
      header: t('depreciation.register.columns.remaining'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (asset) => (
        <span className="font-medium tabular-nums text-gray-900 dark:text-white">
          {formatCurrency(asset.remaining_value)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'status',
      accessorKey: 'status',
      header: t('depreciation.register.columns.status'),
      align: 'center',
      render: (asset) => (
        asset.status === 'active' ? (
          <Badge variant="green" dot>{t('depreciation.register.statusActive')}</Badge>
        ) : (
          <Badge variant="gray">{t('depreciation.register.statusDepreciated')}</Badge>
        )
      ),
      sortable: true,
    },
  ], [t, locale]);

  const assets = data?.assets || [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6 dark:border-gray-800">
        <div className="flex min-w-0 items-center gap-2.5">
          <Package className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h3 className="section-title truncate">{t('depreciation.register.title')}</h3>
        </div>
        <Tabs
          variant="pills"
          tabs={statusFilters.map((filter) => ({ id: `${TAB_PREFIX}${filter}`, label: filterLabels[filter] }))}
          activeTab={`${TAB_PREFIX}${statusFilter}`}
          onChange={(id) => setStatusFilter(id.slice(TAB_PREFIX.length) as StatusFilter)}
        />
      </div>

      {error ? (
        <div className="flex h-48 animate-fade-in flex-col items-center justify-center gap-2 px-6 text-center" role="alert">
          <AlertTriangle className="h-5 w-5 text-red-500 dark:text-red-400" aria-hidden="true" />
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            {t('depreciation.register.error')}
          </p>
        </div>
      ) : isLoading ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-800/70" aria-busy="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-6 px-6 py-4">
              <div className="flex-1 space-y-2">
                <SkeletonItem className="h-4 w-1/3" />
                <SkeletonItem className="h-3 w-1/4" />
              </div>
              <SkeletonItem className="h-4 w-20" />
              <SkeletonItem className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : assets.length === 0 ? (
        <EmptyState
          compact
          icon={Package}
          title={t('depreciation.register.empty')}
          description={t('depreciation.register.emptyHint')}
        />
      ) : (
        <Table
          data={assets}
          columns={columns}
          className="!rounded-none !border-0 !shadow-none"
          pageSize={10}
        />
      )}

      {data && !error && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400">
          {t('depreciation.register.total', { count: data.total })}
        </div>
      )}
    </Card>
  );
};

export default AssetRegisterTable;
