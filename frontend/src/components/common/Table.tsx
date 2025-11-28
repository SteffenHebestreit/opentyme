import { ReactNode, useState, Fragment, useMemo, useEffect } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: ReactNode;
  accessorKey?: keyof T;
  render?: (item: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  sortValue?: (item: T) => string | number | boolean | null | undefined;
  groupSortValue?: (groupKey: string, items: T[]) => string | number | boolean | null | undefined;
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
}

export interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  groupBy?: keyof T | ((item: T) => string);
  groupHeaderRender?: (groupKey: string, groupItems: T[], isExpanded: boolean, toggle: () => void) => ReactNode;
  groupSort?: (a: [string, T[]], b: [string, T[]]) => number;
  pagination?: PaginationProps;
  isLoading?: boolean;
  emptyMessage?: ReactNode;
  onRowClick?: (item: T) => void;
  className?: string;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  pageSize?: number;
}

export const Table = <T extends { id?: string | number }>({
  data,
  columns,
  groupBy,
  groupHeaderRender,
  groupSort,
  pagination,
  isLoading,
  emptyMessage = 'No data available',
  onRowClick,
  className,
  defaultSort,
  onSort,
  pageSize,
}: TableProps<T>) => {
  const { t } = useTranslation('common');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [internalSort, setInternalSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(defaultSort || null);
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState(pageSize || 10);

  useEffect(() => {
    if (pageSize) {
      setInternalPageSize(pageSize);
    }
  }, [pageSize]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (internalSort && internalSort.key === key && internalSort.direction === 'asc') {
      direction = 'desc';
    }
    
    if (onSort) {
      onSort(key, direction);
    }
    setInternalSort({ key, direction });
  };

  // Process data: Sort -> Group -> Paginate
  const processedData = useMemo(() => {
    let processed = [...data];

    // 1. Sort
    if (internalSort && !onSort) {
      processed.sort((a, b) => {
        const column = columns.find(c => c.key === internalSort.key);
        if (!column) return 0;

        const getSortValue = (item: T) => {
          if (column.sortValue) return column.sortValue(item);
          if (column.accessorKey) return item[column.accessorKey];
          return (item as any)[internalSort.key];
        };

        const aValue = getSortValue(a);
        const bValue = getSortValue(b);

        if (aValue === bValue) return 0;
        
        // Handle null/undefined values
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        const comparison = aValue > bValue ? 1 : -1;
        return internalSort.direction === 'asc' ? comparison : -comparison;
      });
    }

    return processed;
  }, [data, internalSort, onSort, columns]);

  // 2. Grouping Logic
  const groupedData = useMemo(() => {
    if (!groupBy) return null;

    const groups: Record<string, T[]> = {};
    processedData.forEach((item) => {
      const key = typeof groupBy === 'function' ? groupBy(item) : String(item[groupBy]);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    });

    const entries = Object.entries(groups);

    // Sort groups based on active column sort if available
    if (internalSort) {
      const column = columns.find(c => c.key === internalSort.key);
      if (column && column.groupSortValue) {
        entries.sort((a, b) => {
          const [keyA, itemsA] = a;
          const [keyB, itemsB] = b;
          // We know column.groupSortValue is defined here
          const valA = column.groupSortValue!(keyA, itemsA);
          const valB = column.groupSortValue!(keyB, itemsB);

          if (valA === valB) return 0;
          if (valA === null || valA === undefined) return 1;
          if (valB === null || valB === undefined) return -1;

          const comparison = valA > valB ? 1 : -1;
          return internalSort.direction === 'asc' ? comparison : -comparison;
        });
        return entries;
      }
    }

    if (groupSort) {
      entries.sort(groupSort);
    }
    return entries;
  }, [processedData, groupBy, groupSort, internalSort, columns]);

  // 3. Pagination Logic (Client-side if pageSize provided and no external pagination)
  const displayData = useMemo(() => {
    if (pagination || !internalPageSize || groupBy) return processedData;
    
    const startIndex = (internalPage - 1) * internalPageSize;
    return processedData.slice(startIndex, startIndex + internalPageSize);
  }, [processedData, pagination, internalPageSize, internalPage, groupBy]);

  const displayGroupedData = useMemo(() => {
    if (!groupedData) return null;
    if (pagination || !internalPageSize) return groupedData;

    const startIndex = (internalPage - 1) * internalPageSize;
    return groupedData.slice(startIndex, startIndex + internalPageSize);
  }, [groupedData, pagination, internalPageSize, internalPage]);

  const totalPages = useMemo(() => {
    if (pagination) return pagination.totalPages;
    if (!internalPageSize) return 1;
    
    const totalItems = groupedData ? groupedData.length : processedData.length;
    return Math.ceil(totalItems / internalPageSize);
  }, [pagination, internalPageSize, processedData.length, groupedData]);

  const currentPage = pagination ? pagination.currentPage : internalPage;
  const handlePageChange = pagination ? pagination.onPageChange : setInternalPage;
  
  const handlePageSizeChange = (newSize: number) => {
    setInternalPageSize(newSize);
    setInternalPage(1); // Reset to first page when changing page size
    if (pagination?.onPageSizeChange) {
      pagination.onPageSizeChange(newSize);
    }
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  const renderCell = (item: T, column: Column<T>) => {
    if (column.render) {
      return column.render(item);
    }
    if (column.accessorKey) {
      return item[column.accessorKey] as ReactNode;
    }
    return null;
  };

  const renderRow = (item: T, index: number) => (
    <tr
      key={item.id || index}
      onClick={() => onRowClick?.(item)}
      className={clsx(
        'transition hover:bg-gray-50 dark:hover:bg-gray-800/40',
        onRowClick && 'cursor-pointer'
      )}
    >
      {groupBy && <td className="px-6 py-4"></td>}
      {columns.map((column) => (
        <td
          key={column.key}
          className={clsx(
            'px-6 py-4 align-middle text-sm text-gray-700 dark:text-gray-300',
            column.align === 'right' && 'text-right',
            column.align === 'center' && 'text-center',
            column.className
          )}
        >
          {renderCell(item, column)}
        </td>
      ))}
    </tr>
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={clsx('overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900', className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-gray-800/60 dark:text-gray-300">
            <tr>
              {groupBy && <th className="w-10 px-6 py-3"></th>}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={clsx(
                    'group px-6 py-3',
                    column.align === 'right' && 'text-right',
                    column.align === 'center' && 'text-center',
                    column.sortable && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700',
                    column.headerClassName
                  )}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className={clsx(
                    'flex items-center gap-1',
                    column.align === 'right' && 'justify-end',
                    column.align === 'center' && 'justify-center'
                  )}>
                    {column.header}
                    {column.sortable && (
                      <span className="inline-block ml-1">
                        {internalSort?.key === column.key ? (
                          internalSort.direction === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 text-gray-400 opacity-40 group-hover:opacity-100" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {displayGroupedData ? (
              displayGroupedData.map(([groupKey, groupItems]) => {
                const isExpanded = expandedGroups.has(groupKey);
                return (
                  <Fragment key={groupKey}>
                    {/* Group Header */}
                    <tr
                      className="cursor-pointer bg-gray-50/50 hover:bg-gray-100 dark:bg-gray-800/30 dark:hover:bg-gray-800/50 transition"
                      onClick={() => toggleGroup(groupKey)}
                    >
                      {groupHeaderRender ? (
                        groupHeaderRender(groupKey, groupItems, isExpanded, () => toggleGroup(groupKey))
                      ) : (
                        <td className="px-6 py-4 align-middle" colSpan={columns.length + 1}>
                          <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                            <span>{groupKey}</span>
                            <span className="text-xs text-gray-500">({groupItems.length})</span>
                          </div>
                        </td>
                      )}
                    </tr>
                    {/* Group Items */}
                    {isExpanded && groupItems.map((item, index) => renderRow(item, index))}
                  </Fragment>
                );
              })
            ) : (
              displayData.map((item, index) => renderRow(item, index))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(pagination || (internalPageSize && totalPages > 1)) && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
          <div className="flex flex-1 justify-between sm:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              {t('pagination.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              {t('pagination.next')}
            </Button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t('pagination.showing')} <span className="font-medium">{currentPage}</span> {t('pagination.of')}{' '}
                <span className="font-medium">{totalPages}</span>
                {(pagination?.totalItems || (!pagination && processedData.length > 0)) && (
                  <>
                    {' '}
                    (<span className="font-medium">{pagination?.totalItems || processedData.length}</span> {t('pagination.entries')})
                  </>
                )}
              </p>
              <select
                value={internalPageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="block rounded-md border-gray-300 py-1.5 pl-3 pr-8 text-base focus:border-purple-500 focus:outline-none focus:ring-purple-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white sm:text-sm"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size} {t('pagination.perPage')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-l-md rounded-r-none"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <span className="sr-only">{t('pagination.previous')}</span>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                {/* Simple page numbers - can be improved for many pages */}
                {[...Array(totalPages)].map((_, i) => {
                  const page = i + 1;
                  // Show first, last, current, and neighbors
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <Button
                        key={page}
                        variant={page === currentPage ? 'primary' : 'outline'}
                        size="sm"
                        className={clsx(
                          'rounded-none',
                          page === currentPage ? 'z-10' : ''
                        )}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </Button>
                    );
                  } else if (
                    page === currentPage - 2 ||
                    page === currentPage + 2
                  ) {
                    return (
                      <span
                        key={page}
                        className="relative inline-flex items-center border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      >
                        ...
                      </span>
                    );
                  }
                  return null;
                })}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-l-none rounded-r-md"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <span className="sr-only">{t('pagination.next')}</span>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


