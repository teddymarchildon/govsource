'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import ExecutiveOrderCard from '@/components/ExecutiveOrderCard';
import { AgencyDocument } from '@/types/types';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import LoadingIndicator from '@/components/ui/LoadingIndicator';

interface ExecutiveOrdersClientProps {
  initialOrders: AgencyDocument[];
  initialPresidents: string[];
}

export default function ExecutiveOrdersClient({
  initialOrders,
  initialPresidents
}: ExecutiveOrdersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearchQuery = searchParams.get('q') || '';
  const currentStartDate = searchParams.get('start_date') || '';
  const currentEndDate = searchParams.get('end_date') || '';
  const currentSortOrder = searchParams.get('sort_order') || 'desc';
  const currentPresident = searchParams.get('president') || '';

  const [orders, setOrders] = useState<AgencyDocument[]>(initialOrders);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(currentSearchQuery);
  const [startDate, setStartDate] = useState(currentStartDate);
  const [endDate, setEndDate] = useState(currentEndDate);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(currentSortOrder === 'asc' ? 'asc' : 'desc');
  const [initialLoadComplete, setInitialLoadComplete] = useState(true); // Already loaded from server
  const [presidents] = useState<string[]>(initialPresidents);
  const [selectedPresident, setSelectedPresident] = useState(currentPresident);

  const fetchOrders = async (page: number) => {
    if (page === 1) {
      setOrders([]);
    }

    try {
      // Calculate range for pagination
      const from = (page - 1) * 50;
      const to = from + 49;

      let query = supabase
        .from('agency_document')
        .select(`
          id,
          title,
          remote_document_number,
          signing_date,
          publication_date,
          president,
          agency:agency_agencydocument!agency_document_id(
            agency:agency(id, name)
          )
        `)
        .eq('subtype', 'Executive Order')
        .not('signing_date', 'is', null)
        .order('signing_date', { ascending: sortOrder === 'asc' })
        .range(from, to);

      if (searchQuery) {
        // Search across multiple fields
        query = query.or(`title.ilike.%${searchQuery}%,remote_document_number.ilike.%${searchQuery}%`);
      }

      if (selectedPresident) {
        query = query.eq('president', selectedPresident);
      }

      // Apply date range filter if provided
      if (startDate) {
        query = query.gte('publication_date', startDate);
      }

      if (endDate) {
        query = query.lte('publication_date', endDate);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching executive orders:', error);
        return false;
      }

      // Transform the data to match our interface
      const transformedData = data?.map(order => ({
        ...order,
        agency: order.agency?.[0]?.agency || null
      })) || [];

      // Update orders state
      if (page === 1) {
        setOrders(transformedData as unknown as AgencyDocument[]);
      } else {
        setOrders(prevOrders => [...prevOrders, ...(transformedData as unknown as AgencyDocument[])]);
      }

      // Return whether there are more items to load
      return transformedData.length === 50;
    } catch (error) {
      console.error('Error fetching executive orders:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Set up infinite scrolling
  const { loading: loadingMore, sentinelRef, reset: resetScroll } = useInfiniteScroll(
    fetchOrders,
    { enabled: initialLoadComplete }
  );

  // Update URL and fetch data when filters change
  useEffect(() => {
    if (initialLoadComplete) {
      const params = new URLSearchParams();

      if (searchQuery) params.set('q', searchQuery);
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      if (sortOrder !== 'desc') params.set('sort_order', sortOrder);
      if (selectedPresident) params.set('president', selectedPresident);

      const queryString = params.toString();
      const url = queryString ? `/executive-orders?${queryString}` : '/executive-orders';
      router.push(url, { scroll: false });

      // Always fetch when any filter changes
      setLoading(true);
      resetScroll();
      fetchOrders(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, startDate, endDate, sortOrder, selectedPresident, initialLoadComplete, router]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handlePresidentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPresident(e.target.value);
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(e.target.value);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value);
  };

  const handleSortOrderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortOrder(e.target.value as 'asc' | 'desc');
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setSortOrder('desc');
    setSelectedPresident('');
  };

  // Individual clear handlers
  const clearSearchQueryFilter = () => setSearchQuery('');
  const clearPresidentFilter = () => setSelectedPresident('');
  const clearStartDateFilter = () => setStartDate('');
  const clearEndDateFilter = () => setEndDate('');
  const clearSortOrderFilter = () => setSortOrder('desc');

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Executive Orders</h1>

      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <input
              type="text"
              id="search"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search by title or document number"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="president" className="block text-sm font-medium text-gray-700 mb-2">
              President
            </label>
            <select
              id="president"
              value={selectedPresident}
              onChange={handlePresidentChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">All Presidents</option>
              {presidents.map(president => (
                <option key={president} value={president}>
                  {president}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="date-range" className="block text-sm font-medium text-gray-700 mb-2">
              Date Range
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <input
                  type="date"
                  id="start-date"
                  value={startDate}
                  onChange={handleStartDateChange}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Start date"
                />
              </div>
              <div>
                <input
                  type="date"
                  id="end-date"
                  value={endDate}
                  onChange={handleEndDateChange}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="End date"
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="sort-order" className="block text-sm font-medium text-gray-700 mb-2">
              Sort by Signing Date
            </label>
            <div className="flex">
              <select
                id="sort-order"
                value={sortOrder}
                onChange={handleSortOrderChange}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>
          </div>
        </div>

        {(searchQuery || startDate || endDate || sortOrder !== 'desc' || selectedPresident) && (
          <div className="mb-4 flex items-center flex-wrap">
            <div className="text-sm text-gray-600 mr-2">Active filters:</div>
            {searchQuery && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mr-2 mb-2">
                Search: {searchQuery}
                <button
                  onClick={clearSearchQueryFilter}
                  className="ml-2 text-purple-500 hover:text-purple-700 focus:outline-none"
                  aria-label="Clear search filter"
                >
                  &times;
                </button>
              </span>
            )}
            {selectedPresident && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2 mb-2">
                President: {selectedPresident}
                <button
                  onClick={clearPresidentFilter}
                  className="ml-2 text-green-500 hover:text-green-700 focus:outline-none"
                  aria-label="Clear president filter"
                >
                  &times;
                </button>
              </span>
            )}
            {startDate && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 mr-2 mb-2">
                From: {new Date(startDate).toLocaleDateString()}
                <button
                  onClick={clearStartDateFilter}
                  className="ml-2 text-amber-500 hover:text-amber-700 focus:outline-none"
                  aria-label="Clear start date filter"
                >
                  &times;
                </button>
              </span>
            )}
            {endDate && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 mr-2 mb-2">
                To: {new Date(endDate).toLocaleDateString()}
                <button
                  onClick={clearEndDateFilter}
                  className="ml-2 text-amber-500 hover:text-amber-700 focus:outline-none"
                  aria-label="Clear end date filter"
                >
                  &times;
                </button>
              </span>
            )}
            {sortOrder !== 'desc' && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 mr-2 mb-2">
                Sort: {sortOrder === 'asc' ? 'Oldest First' : 'Newest First'}
                <button
                  onClick={clearSortOrderFilter}
                  className="ml-2 text-indigo-500 hover:text-indigo-700 focus:outline-none"
                  aria-label="Clear sort order filter"
                >
                  &times;
                </button>
              </span>
            )}
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-xl">Loading...</div>
        </div>
      ) : (
        <>
          <p className="mb-4">Showing {orders.length} executive orders</p>
          {orders.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {orders.map((order) => (
                  <ExecutiveOrderCard key={order.id} order={order} />
                ))}
              </div>

              {/* Sentinel element for infinite scrolling */}
              <div ref={sentinelRef} className="h-4 mt-4"></div>

              {/* Loading indicator for more items */}
              {loadingMore && <LoadingIndicator size="medium" />}
            </>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-yellow-700">
                No executive orders found matching your filters. Try adjusting your search criteria.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
