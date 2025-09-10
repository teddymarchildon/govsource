'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import LawCard from '@/components/LawCard';
import { Law, PolicyArea } from '@/types/types';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';

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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
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

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Laws</h1>
      <p className="text-gray-600 text-sm mb-6">Explore federal laws enacted by Congress.</p>

      <div className="mb-8 rounded-xl border bg-card p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
          <div>
            <label htmlFor="policy-area" className="block text-sm font-medium mb-1">
              Policy Area
            </label>
            <Select value={selectedPolicyArea} onValueChange={handlePolicyAreaChange}>
              <SelectTrigger id="policy-area">
                <SelectValue placeholder="All Policy Areas" />
              </SelectTrigger>
              <SelectContent>
                {policyAreas.map((area) => (
                  <SelectItem key={area} value={area}>{area}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="search-filter" className="block text-sm font-medium mb-1">
              Search Laws
            </label>
            <Input
              id="search-filter"
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search by title..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Enacted Date Range
            </label>
            <div className="grid grid-cols-2 gap-4">
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

          <div>
            <label htmlFor="sort-order" className="block text-sm font-medium mb-1">
              Sort By
            </label>
            <Select value={sortOrder} onValueChange={handleSortOrderChange}>
              <SelectTrigger id="sort-order">
                <SelectValue placeholder="Sort by date..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Newest First</SelectItem>
                <SelectItem value="asc">Oldest First</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-end">
           <Button variant="outline" onClick={clearFilters} size="sm">
              Clear All Filters
            </Button>
        </div>

        {(selectedPolicyArea || searchQuery || startDate || endDate || sortOrder !== 'desc') && (
        <div className="mt-4 flex items-center flex-wrap gap-2">
          <span className="text-sm text-muted-foreground mr-2">Active filters:</span>
          {selectedPolicyArea && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              Policy: {selectedPolicyArea}
              <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 p-0" onClick={clearPolicyAreaFilter} aria-label="Clear policy area filter">
                <X className="h-3 w-3" />
              </Button>
            </span>
          )}
          {searchQuery && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              Search: {searchQuery}
              <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 p-0" onClick={clearSearchQueryFilter} aria-label="Clear search filter">
                <X className="h-3 w-3" />
              </Button>
            </span>
          )}
          {startDate && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              From: {startDate.toLocaleDateString()}
              <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 p-0" onClick={clearStartDateFilter} aria-label="Clear start date filter">
                <X className="h-3 w-3" />
              </Button>
            </span>
          )}
          {endDate && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              To: {endDate.toLocaleDateString()}
              <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 p-0" onClick={clearEndDateFilter} aria-label="Clear end date filter">
                <X className="h-3 w-3" />
              </Button>
            </span>
          )}
          {sortOrder !== 'desc' && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              Sort: {sortOrder === 'asc' ? 'Oldest First' : 'Newest First'}
              <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 p-0" onClick={clearSortOrderFilter} aria-label="Clear sort order filter">
                <X className="h-3 w-3" />
              </Button>
            </span>
          )}
        </div>
      )}
      </div>

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
