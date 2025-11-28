/**
 * @fileoverview Asset Register Table component
 * 
 * Displays a table of all depreciated assets with filtering options
 * 
 * @module components/dashboard/AssetRegisterTable
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAssetRegister } from '../../api/services/depreciation.service';
import { formatCurrency } from '../../utils/currency';
import { Table, Column } from '../common/Table';

/**
 * AssetRegisterTable Component
 * 
 * @returns Table showing all depreciated assets
 */
const AssetRegisterTable: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'fully_depreciated'>('all');
  const currentYear = new Date().getFullYear();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['asset-register', currentYear, statusFilter === 'all' ? undefined : statusFilter],
    queryFn: () => getAssetRegister({
      year: currentYear,
      status: statusFilter === 'all' ? undefined : statusFilter,
    }),
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const columns: Column<any>[] = useMemo(() => [
    {
      key: 'description',
      accessorKey: 'description',
      header: 'Beschreibung',
      render: (asset) => (
        <>
          <div className="font-medium">{asset.description}</div>
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
      header: 'Anschaffung',
      render: (asset) => (
        <div className="text-gray-600 dark:text-gray-400">
          {formatDate(asset.purchase_date)}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'netAmount',
      accessorKey: 'net_amount',
      header: 'Anschaffungswert',
      align: 'right',
      render: (asset) => (
        <div className="font-medium text-gray-900 dark:text-white">
          {formatCurrency(asset.net_amount)}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'years',
      accessorKey: 'depreciation_years',
      header: 'Nutzungsdauer',
      align: 'center',
      render: (asset) => (
        <div className="text-gray-600 dark:text-gray-400">
          {asset.depreciation_years} Jahre
        </div>
      ),
      sortable: true,
    },
    {
      key: 'annual',
      accessorKey: 'annual_depreciation',
      header: 'Jährlich',
      align: 'right',
      render: (asset) => (
        <div className="text-gray-600 dark:text-gray-400">
          {formatCurrency(asset.annual_depreciation)}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'remaining',
      accessorKey: 'remaining_value',
      header: 'Restwert',
      align: 'right',
      render: (asset) => (
        <div className="font-medium text-gray-900 dark:text-white">
          {formatCurrency(asset.remaining_value)}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'status',
      accessorKey: 'status',
      header: 'Status',
      align: 'center',
      render: (asset) => (
        asset.status === 'active' ? (
          <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Aktiv
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">
            Abgeschrieben
          </span>
        )
      ),
      sortable: true,
    },
  ], []);

  if (error) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-red-600 dark:text-red-400">
            Fehler beim Laden des Anlagenverzeichnisses
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Anlagenverzeichnis
          </h3>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Alle
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
              statusFilter === 'active'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Aktiv
          </button>
          <button
            onClick={() => setStatusFilter('fully_depreciated')}
            className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
              statusFilter === 'fully_depreciated'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Vollständig abgeschrieben
          </button>
        </div>
      </div>

      <Table
        data={data?.assets || []}
        columns={columns}
        isLoading={isLoading}
        emptyMessage="Keine Vermögenswerte vorhanden"
        className="border-0 shadow-none"
        pageSize={10}
      />
      
      {data && (
        <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Gesamt: {data.total} Vermögenswerte
        </div>
      )}
    </div>
  );
};

export default AssetRegisterTable;
