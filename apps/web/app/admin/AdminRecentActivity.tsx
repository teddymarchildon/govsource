'use client'

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  searchBillsAndExecutiveOrders,
  type BillSearchResult,
  type ExecutiveOrderSearchResult,
} from '@/services/api';

export type ActivityCategory = 'Bill' | 'Law' | 'Executive Order' | 'Supreme Court Case';
type PrimaryItemType = 'bill' | 'law' | 'executive_order' | 'cluster';

export interface AdminActivityItem {
  id: string;
  category: ActivityCategory;
  title: string;
  href: string;
  metadata?: string;
  updatedAt: string | null;
  createdAt: string;
}

interface AdminRecentActivityProps {
  items: AdminActivityItem[];
}

interface GenerationResult {
  articleId: number;
  status: string;
  title: string;
  updated: boolean;
  wordCount: number;
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildBillActivityItem(bill: BillSearchResult): AdminActivityItem {
  const labels: string[] = [];
  if (bill.type && bill.number) {
    labels.push(`${bill.type.toUpperCase()} ${bill.number}`);
  } else if (bill.type) {
    labels.push(bill.type.toUpperCase());
  } else if (bill.number) {
    labels.push(String(bill.number));
  }
  if (bill.congress) {
    labels.push(`Congress ${bill.congress}`);
  }
  if (bill.law_number) {
    labels.push(`Law ${bill.law_number}`);
  }

  const fallbackTitle = `Bill ${bill.type?.toUpperCase() ?? ''} ${bill.number ?? ''}`.trim();
  const lawTitle = bill.law_title?.trim() ?? '';
  const titleCandidate = bill.title?.trim() ?? '';
  const title =
    (titleCandidate.length > 0 ? titleCandidate : undefined) ??
    (lawTitle.length > 0 ? lawTitle : undefined) ??
    (fallbackTitle || `Bill ${bill.id}`);

  return {
    id: String(bill.id),
    category: 'Bill',
    title,
    href: `/bills/${bill.id}`,
    metadata: labels.length ? labels.join(' • ') : undefined,
    updatedAt: bill.updated_at,
    createdAt: bill.created_at,
  };
}

function buildExecutiveOrderActivityItem(order: ExecutiveOrderSearchResult): AdminActivityItem {
  const labels: string[] = [];
  if (order.remote_document_number) {
    labels.push(`#${order.remote_document_number}`);
  }
  if (order.president) {
    labels.push(order.president);
  }
  if (order.signing_date) {
    labels.push(`Signed ${order.signing_date}`);
  }

  const fallbackTitle = `Executive Order ${order.remote_document_number ?? ''}`.trim();
  const titleCandidate = order.title?.trim() ?? '';
  const title = titleCandidate.length > 0 ? titleCandidate : fallbackTitle || `Executive Order ${order.id}`;

  return {
    id: String(order.id),
    category: 'Executive Order',
    title,
    href: `/executive-orders/${order.id}`,
    metadata: labels.length ? labels.join(' • ') : undefined,
    updatedAt: order.updated_at,
    createdAt: order.created_at,
  };
}

function getActivityTimestamp(item: AdminActivityItem) {
  const value = item.updatedAt ?? item.createdAt;
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function useCategoryFilter(items: AdminActivityItem[]) {
  const [category, setCategory] = useState<ActivityCategory | 'All'>('All');

  const filteredItems = useMemo(() => {
    if (category === 'All') {
      return items;
    }
    return items.filter((item) => item.category === category);
  }, [category, items]);

  return {
    category,
    setCategory,
    filteredItems,
  };
}

const CATEGORY_FILTERS: (ActivityCategory | 'All')[] = [
  'All',
  'Bill',
  'Law',
  'Executive Order',
  'Supreme Court Case',
];

const CATEGORY_TO_TYPE: Record<ActivityCategory, PrimaryItemType> = {
  Bill: 'bill',
  Law: 'law',
  'Executive Order': 'executive_order',
  'Supreme Court Case': 'cluster',
};

export default function AdminRecentActivity({ items }: AdminRecentActivityProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [searchItems, setSearchItems] = useState<AdminActivityItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, GenerationResult>>({});
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const runSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        setSearchItems(null);
        setActiveQuery(null);
        setSearchError(null);
        setSearchLoading(false);
        return;
      }

      setSearchLoading(true);
      setSearchError(null);
      try {
        const { bills, executiveOrders } = await searchBillsAndExecutiveOrders(trimmed);
        const mapped: AdminActivityItem[] = [
          ...bills.map(buildBillActivityItem),
          ...executiveOrders.map(buildExecutiveOrderActivityItem),
        ].sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a));
        setSearchItems(mapped);
        setActiveQuery(trimmed);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to run search.';
        setSearchError(message);
        setSearchItems([]);
        setActiveQuery(trimmed);
      } finally {
        setSearchLoading(false);
      }
    },
    [],
  );

  const handleSearchSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await runSearch(searchQuery);
    },
    [runSearch, searchQuery],
  );

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setActiveQuery(null);
    setSearchItems(null);
    setSearchError(null);
    setSearchLoading(false);
  }, []);

  useEffect(() => {
    if (!activeQuery) {
      setSearchError(null);
      setSearchItems(null);
      setSearchLoading(false);
    }
  }, [activeQuery]);

  const itemsToDisplay = searchItems ?? items;
  const { category, setCategory, filteredItems } = useCategoryFilter(itemsToDisplay);

  useEffect(() => {
    if (activeQuery && category !== 'All' && category !== 'Bill' && category !== 'Executive Order') {
      setCategory('All');
    }
  }, [activeQuery, category, setCategory]);

  const isSearching = Boolean(activeQuery);

  const handleGenerate = useCallback(async (item: AdminActivityItem) => {
    const key = `${item.category}:${item.id}`;
    const primaryItemType = CATEGORY_TO_TYPE[item.category];
    const primaryItemId = Number(item.id);

    if (!Number.isFinite(primaryItemId)) {
      setAlert({ type: 'error', message: 'Invalid item identifier' });
      return;
    }
    if (!primaryItemType) {
      setAlert({ type: 'error', message: 'Unsupported item category' });
      return;
    }

    setPendingKey(key);
    setAlert(null);

    try {
      const response = await fetch('/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryItemType,
          primaryItemId,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to generate article');
      }

      setResults((prev) => ({ ...prev, [key]: payload as GenerationResult }));
      setAlert({
        type: 'success',
        message: payload.updated
          ? `Updated draft #${payload.articleId} (${payload.wordCount} words)`
          : `Created draft #${payload.articleId} (${payload.wordCount} words)`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate article';
      setAlert({ type: 'error', message });
    } finally {
      setPendingKey(null);
    }
  }, []);

  return (
    <div className="space-y-6">
      {alert && (
        <div
          className={[
            'rounded-md border px-4 py-3 text-sm',
            alert.type === 'success'
              ? 'border-green-300 bg-green-50 text-green-700'
              : 'border-red-300 bg-red-50 text-red-700',
          ].join(' ')}
        >
          {alert.message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_FILTERS.map((filter) => {
            const isActive = category === filter;
            return (
              <Button
                key={filter}
                variant={isActive ? 'default' : 'outline'}
                onClick={() => setCategory(filter)}
                className="min-w-[140px] justify-center"
              >
                {filter}
              </Button>
            );
          })}
        </div>
        <form className="flex w-full max-w-xl items-center gap-2" onSubmit={handleSearchSubmit}>
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search bills or executive orders by title or number"
            aria-label="Search bills or executive orders"
            type="search"
            className="flex-1"
          />
          <Button type="submit" variant="default" disabled={searchLoading}>
            Search
          </Button>
          {isSearching && (
            <Button type="button" variant="ghost" onClick={clearSearch}>
              Clear
            </Button>
          )}
        </form>
        {searchLoading && <span className="text-sm text-gray-500">Searching…</span>}
      </div>
      {isSearching && (
        <p className="text-sm text-gray-500">
          Showing results for “{activeQuery}” (Bills & Executive Orders)
        </p>
      )}
      {searchError && (
        <p className="text-sm text-red-600">{searchError}</p>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Category
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Title
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Details
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Updated
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {searchLoading ? (
              <tr>
                <td className="px-6 py-8 text-center text-sm text-gray-500" colSpan={5}>
                  Searching…
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td className="px-6 py-8 text-center text-sm text-gray-500" colSpan={5}>
                  {isSearching
                    ? 'No matching bills or executive orders found.'
                    : 'No records found for the selected filter.'}
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const rowKey = `${item.category}:${item.id}`;
                const result = results[rowKey];
                const isPending = pendingKey === rowKey;

                return (
                  <tr key={rowKey}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                      {item.category}
                    </td>
                    <td className="max-w-md px-6 py-4 text-sm text-gray-900">
                      <Link
                        href={item.href}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {item.metadata || '--'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {formatDate(item.updatedAt ?? item.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <div className="flex items-center justify-end gap-3">
                        {result ? (
                          <span className="text-xs text-gray-500">
                            {result.updated ? 'Draft updated' : 'Draft created'} (#{result.articleId})
                          </span>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerate(item)}
                          disabled={isPending}
                        >
                          {isPending
                            ? 'Generating...'
                            : result
                            ? 'Regenerate'
                            : 'Generate Summary'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
