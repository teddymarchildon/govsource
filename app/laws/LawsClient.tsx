'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import LawCard from '@/components/LawCard';
import { Law, PolicyArea } from '@/types/types';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import {
  FilterToolbar,
  type FilterChip,
} from "@/components/listing/FilterToolbar";
import { FilterPopover } from "@/components/listing/FilterPopover";

interface LawsClientProps {
  initialLaws: Law[];
  policyAreas: PolicyArea[];
}

export default function LawsClient({ initialLaws, policyAreas }: LawsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPolicyArea = searchParams.get('policy_area') || '';
  const currentSearchQuery = searchParams.get('search') || '';
  const currentStartDate = searchParams.get('start_date') || '';
  const currentEndDate = searchParams.get('end_date') || '';
  const currentSortOrder = searchParams.get('sort_order') || 'desc';
  const [laws, setLaws] = useState<Law[]>(initialLaws);
  const [loading, setLoading] = useState(false);
  const [selectedPolicyArea, setSelectedPolicyArea] = useState<PolicyArea | ''>(currentPolicyArea as PolicyArea | '');
  const [searchQuery, setSearchQuery] = useState(currentSearchQuery);
  const [startDate, setStartDate] = useState<Date | undefined>(
    currentStartDate ? new Date(currentStartDate) : undefined,
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    currentEndDate ? new Date(currentEndDate) : undefined,
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(currentSortOrder === 'asc' ? 'asc' : 'desc');
  const [initialLoadComplete, _setInitialLoadComplete] = useState(true); // Already loaded from server

  const fetchLaws = async (page: number) => {
      
    if (page === 1) {
      setLaws([]);
    }

    try {
      // Calculate range for pagination
      const from = (page - 1) * 50;
      const to = from + 49;

      // Base query for laws from bills table, where law_enacted_date is not null
      let baseQuery = supabase
        .from('bill')
        .select(`
          *,
          sponsor:sponsored_bills(
            congressman:congressman(*)
          )
        `)
        .not('law_enacted_date', 'is', null)
        .order('law_enacted_date', { ascending: sortOrder === 'asc' })
        .range(from, to);

      // Apply policy area filter if selected
      if (selectedPolicyArea) {
        baseQuery = baseQuery.eq('policy_area', selectedPolicyArea);
      }

      // Apply search filter if provided
      if (searchQuery) {
        baseQuery = baseQuery.or(`title.ilike.%${searchQuery}%,law_title.ilike.%${searchQuery}%`);
      }

      // Apply date range filter if provided
      if (startDate) {
        baseQuery = baseQuery.gte('law_enacted_date', startDate.toISOString().split('T')[0]);
      }

      if (endDate) {
        baseQuery = baseQuery.lte('law_enacted_date', endDate.toISOString().split('T')[0]);
      }

      // Execute the query
      const { data, error } = await baseQuery;
      if (error) throw error;

      // Transform the data to match our Law interface
      const fetchedLaws = data?.map((law: any) => ({
        ...law,
        sponsor: law.sponsor?.[0]?.congressman || null
      })) || [];

      // Update laws state
      if (page === 1) {
        setLaws(fetchedLaws as Law[]);
      } else {
        setLaws(prevLaws => [...prevLaws, ...(fetchedLaws as Law[])]);
      }

      // Return whether there are more items to load
      return fetchedLaws.length === 50;
    } catch (error) {
      console.error('Error fetching laws:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Set up infinite scrolling
  const { loading: loadingMore, sentinelRef, reset: resetScroll } = useInfiniteScroll(
    fetchLaws,
    { enabled: initialLoadComplete }
  );

  // Update URL and fetch data when filters change
  useEffect(() => {
    if (initialLoadComplete) {
      const params = new URLSearchParams();

      if (selectedPolicyArea) params.set('policy_area', selectedPolicyArea);
      if (searchQuery) params.set('search', searchQuery);
      if (startDate) params.set('start_date', startDate.toISOString().split('T')[0]);
      if (endDate) params.set('end_date', endDate.toISOString().split('T')[0]);
      if (sortOrder !== 'desc') params.set('sort_order', sortOrder);

      const queryString = params.toString();
      const url = queryString ? `/laws?${queryString}` : '/laws';
      router.push(url, { scroll: false });

      // Always fetch, even if no filters are applied
      setLoading(true);
      resetScroll();
      fetchLaws(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPolicyArea, searchQuery, startDate, endDate, sortOrder, initialLoadComplete, router]);

  const handlePolicyAreaChange = (value: string) => {
    setSelectedPolicyArea(value as PolicyArea | '');
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
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
    setSelectedPolicyArea('');
    setSearchQuery('');
    setStartDate(undefined);
    setEndDate(undefined);
    setSortOrder('desc');
  };

  // Individual clear handlers
  const clearPolicyAreaFilter = () => setSelectedPolicyArea('');
  const clearSearchQueryFilter = () => setSearchQuery('');
  const clearStartDateFilter = () => setStartDate(undefined);
  const clearEndDateFilter = () => setEndDate(undefined);
  const clearSortOrderFilter = () => setSortOrder('desc');

  const appliedFilterCount =
    (selectedPolicyArea ? 1 : 0) +
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

  if (selectedPolicyArea) {
    activeFilters.push({
      id: 'policy',
      label: `Policy: ${selectedPolicyArea}`,
      onRemove: clearPolicyAreaFilter,
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
              Policy area
            </p>
            <Select
              value={selectedPolicyArea}
              onValueChange={handlePolicyAreaChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="All policy areas" />
              </SelectTrigger>
              <SelectContent>
                {policyAreas.map((area) => (
                  <SelectItem key={area} value={area}>
                    {area}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Enacted between
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
      <h1 className="text-3xl font-bold mb-2">Laws</h1>
      <p className="text-gray-600 text-sm mb-6">Explore federal laws enacted by Congress</p>

      <FilterToolbar
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        searchLabel="Search laws"
        searchPlaceholder="Search by law title or topic..."
        helperText="Use search, policy areas, or dates to zero in on enacted legislation."
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
          <p className="mb-4">Showing {laws.length} laws</p>
          {laws.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {laws.map((law) => (
                  <LawCard key={law.id} law={law} />
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
                No laws found matching your filters. Try adjusting your search criteria.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
