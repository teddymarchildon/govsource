'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import ExecutiveOrderCard from '@/components/ExecutiveOrderCard';
import { AgencyDocument } from '@/types/types';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import {
  FilterToolbar,
  type FilterChip,
} from "@/components/listing/FilterToolbar";
import { FilterPopover } from "@/components/listing/FilterPopover";

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
  const [startDate, setStartDate] = useState<Date | undefined>(
    currentStartDate ? new Date(currentStartDate) : undefined,
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    currentEndDate ? new Date(currentEndDate) : undefined,
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(currentSortOrder === 'asc' ? 'asc' : 'desc');
  const [initialLoadComplete, _setInitialLoadComplete] = useState(true); // Already loaded from server
  const [presidents] = useState<string[]>(initialPresidents);
  const [selectedPresident, setSelectedPresident] = useState(currentPresident);

  const fetchOrders = async (page: number) => {
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
        query = query.gte('publication_date', startDate.toISOString().split('T')[0]);
      }

      if (endDate) {
        query = query.lte('publication_date', endDate.toISOString().split('T')[0]);
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
      if (startDate) params.set('start_date', startDate.toISOString().split('T')[0]);
      if (endDate) params.set('end_date', endDate.toISOString().split('T')[0]);
      if (sortOrder !== 'desc') params.set('sort_order', sortOrder);
      if (selectedPresident) params.set('president', selectedPresident);

      const queryString = params.toString();
      const url = queryString ? `/executive-orders?${queryString}` : '/executive-orders';
      router.push(url, { scroll: false });

      // Reset and trigger a new fetch - the hook will handle loading state
      setLoading(true);
      resetScroll(true); // Pass true to trigger immediate load
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, startDate, endDate, sortOrder, selectedPresident, initialLoadComplete, router]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handlePresidentChange = (value: string) => {
    setSelectedPresident(value);
  };

  const handleStartDateChange = (date: Date | undefined) => {
    setStartDate(date);
  };

  const handleEndDateChange = (date: Date | undefined) => {
    setEndDate(date);
  };

  const handleSortOrderChange = (value: string) => {
    setSortOrder(value as 'asc' | 'desc');
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStartDate(undefined);
    setEndDate(undefined);
    setSortOrder('desc');
    setSelectedPresident('');
  };

  // Individual clear handlers
  const clearSearchQueryFilter = () => setSearchQuery('');
  const clearPresidentFilter = () => setSelectedPresident('');
  const clearStartDateFilter = () => setStartDate(undefined);
  const clearEndDateFilter = () => setEndDate(undefined);
  const clearSortOrderFilter = () => setSortOrder('desc');

  const appliedFilterCount =
    (selectedPresident ? 1 : 0) +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0);

  const activeFilters: FilterChip[] = [];

  if (searchQuery) {
    activeFilters.push({
      id: 'search',
      label: `Search: ${searchQuery}`,
      onRemove: clearSearchQueryFilter,
    });
  }

  if (selectedPresident) {
    activeFilters.push({
      id: 'president',
      label: `President: ${selectedPresident}`,
      onRemove: clearPresidentFilter,
    });
  }

  if (startDate) {
    activeFilters.push({
      id: 'start',
      label: `From: ${startDate.toLocaleDateString()}`,
      onRemove: clearStartDateFilter,
    });
  }

  if (endDate) {
    activeFilters.push({
      id: 'end',
      label: `To: ${endDate.toLocaleDateString()}`,
      onRemove: clearEndDateFilter,
    });
  }

  if (sortOrder !== 'desc') {
    activeFilters.push({
      id: 'sort',
      label: `Sort: ${sortOrder === 'asc' ? 'Oldest first' : 'Newest first'}`,
      onRemove: clearSortOrderFilter,
    });
  }

  const toolbarActions = (
    <>
      <FilterPopover count={appliedFilterCount}>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              President
            </p>
            <Select value={selectedPresident} onValueChange={handlePresidentChange}>
              <SelectTrigger>
                <SelectValue placeholder="All presidents" />
              </SelectTrigger>
              <SelectContent>
                {presidents.map((president) => (
                  <SelectItem key={president} value={president}>
                    {president}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Publication date
            </p>
            <div className="grid grid-cols-2 gap-2">
              <DatePicker
                date={startDate}
                setDate={handleStartDateChange}
                placeholder="Start date"
              />
              <DatePicker
                date={endDate}
                setDate={handleEndDateChange}
                placeholder="End date"
              />
            </div>
          </div>
        </div>
      </FilterPopover>
      <Select value={sortOrder} onValueChange={handleSortOrderChange}>
        <SelectTrigger className="h-10 w-[240px] text-sm">
          <SelectValue placeholder="Sort by date..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="desc">Newest first</SelectItem>
          <SelectItem value="asc">Oldest first</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Executive Orders</h1>
      <p className="text-gray-600 text-sm mb-6">
        Track presidential directives, filter by administration, and see when each order was issued.
      </p>

      <FilterToolbar
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        searchLabel="Search executive orders"
        searchPlaceholder="Search by title or document number..."
        helperText="Use the filters to focus on a specific president or timeframe."
        actions={toolbarActions}
        activeFilters={activeFilters}
        clearAll={clearFilters}
        className="mb-8"
      />

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingIndicator size="large" />
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
