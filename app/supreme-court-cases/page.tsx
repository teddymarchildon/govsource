'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../utils/supabase/client';
import CourtCaseCard from '../../components/CourtCaseCard';
import { Cluster, Judge } from '../../types/types';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import LoadingIndicator from '../../components/ui/LoadingIndicator';
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { DatePicker } from '@/components/ui/date-picker';

function SupremeCourtCasesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get query parameters
  const currentSearchQuery = searchParams.get('search') || '';
  const currentJudgeId = searchParams.get('judge_id') || '';
  const currentStartDate = searchParams.get('start_date') || '';
  const currentEndDate = searchParams.get('end_date') || '';
  const currentSortOrder = searchParams.get('sort_order') || 'desc';

  // State variables
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(currentSearchQuery);
  const [judgeId, setJudgeId] = useState(currentJudgeId);
  const [selectedJudge, setSelectedJudge] = useState<Judge | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>(
    currentStartDate ? new Date(currentStartDate) : undefined,
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    currentEndDate ? new Date(currentEndDate) : undefined,
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(currentSortOrder === 'asc' ? 'asc' : 'desc');
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
    
  // Fetch judges for the dropdown
  useEffect(() => {
    const fetchJudges = async () => {
      try {
        const { data, error } = await supabase
          .from('judge')
          .select('*')
          .order('full_name');

        if (error) throw error;
        setJudges(data || []);

        // If a judge ID is in the URL, find the corresponding judge
        if (currentJudgeId) {
          const judge = data?.find(j => j.id.toString() === currentJudgeId) || null;
          setSelectedJudge(judge);
        }
      } catch (error) {
        console.error('Error fetching judges:', error);
      }
    };

    fetchJudges();
  }, [currentJudgeId]);

  const fetchClusters = async (page: number) => {
    if (page === 1) {
      setClusters([]);
    }

    try {
      const from = (page - 1) * 50;
      const to = from + 49;

      let query;

      if (judgeId) {
        query = supabase
          .from('cluster')
          .select(`
            *,
            court (*),
            opinions:court_opinion!inner (
              *,
              author:judge!inner (*)
            )
          `)
          .eq('opinions.author.id', judgeId);
      } else {
        query = supabase
          .from('cluster')
          .select(`
            *,
            court (*),
            opinions:court_opinion (
              *,
              author:judge (*)
            )
          `);
      }

      query = query.eq('court.remote_id', 'scotus');
      
      // Apply search filter if provided
      if (searchQuery) {
        query = query.or(`case_name.ilike.%${searchQuery}%,case_name_short.ilike.%${searchQuery}%`);
      }

      // Apply date range filter if provided
      if (startDate) {
        query = query.gte('date_filed', startDate.toISOString().split('T')[0]);
      }

      if (endDate) {
        query = query.lte('date_filed', endDate.toISOString().split('T')[0]);
      }

      // Execute the query
      const { data, error } = await query
        .order('date_filed', { ascending: sortOrder === 'asc' })
        .range(from, to);
        
      if (error) throw error;

      // Update clusters state
      if (page === 1) {
        setClusters(data || []);
      } else {
        setClusters(prevClusters => [...prevClusters, ...(data || [])]);
      }

      // Return whether there are more items to load
      return data?.length === 50;
    } catch (error) {
      console.error('Error fetching clusters:', error);
      return false;
    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
    }
  };

  // Set up infinite scrolling
  const { loading: loadingMore, sentinelRef, reset: resetScroll } = useInfiniteScroll(
    fetchClusters,
    { enabled: initialLoadComplete }
  );

  // Reset scroll and fetch initial data when filters change
  useEffect(() => {
    setLoading(true);
    resetScroll();
    fetchClusters(1);

    // Update URL query params
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (judgeId) params.set('judge_id', judgeId);
    if (startDate) params.set('start_date', startDate.toISOString().split('T')[0]);
    if (endDate) params.set('end_date', endDate.toISOString().split('T')[0]);
    if (sortOrder !== 'desc') params.set('sort_order', sortOrder);

    const queryString = params.toString();
    router.push(`/supreme-court-cases${queryString ? `?${queryString}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, judgeId, startDate, endDate, sortOrder, router]);

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

  const handleJudgeChange = (value: string) => {
    setJudgeId(value);
    const selectedJudgeId = value;
    setSelectedJudge(judges.find(j => j.id.toString() === selectedJudgeId) || null);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStartDate(undefined);
    setEndDate(undefined);
    setSortOrder('desc');
    setJudgeId('');
    setSelectedJudge(null);
  };

  // Individual clear handlers
  const clearSearchQueryFilter = () => setSearchQuery('');
  const clearJudgeFilter = () => {
    setJudgeId('');
    setSelectedJudge(null);
  };
  const clearStartDateFilter = () => setStartDate(undefined);
  const clearEndDateFilter = () => setEndDate(undefined);
  const clearSortOrderFilter = () => setSortOrder('desc');

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Supreme Court Cases</h1>
      <p className="text-gray-600 text-sm mb-6">Explore Supreme Court cases, their judges, and outcomes.</p>

      <div className="mb-8 rounded-xl border bg-card p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
          <div>
            <label htmlFor="search-filter" className="block text-sm font-medium mb-1">
              Search Cases
            </label>
            <Input
              id="search-filter"
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search by case name..."
            />
          </div>

          <div>
            <label htmlFor="judge-filter" className="block text-sm font-medium mb-1">
              Filter by Judge
            </label>
            <Select value={judgeId} onValueChange={handleJudgeChange}>
              <SelectTrigger id="judge-filter">
                <SelectValue placeholder="All Judges" />
              </SelectTrigger>
              <SelectContent>
                {judges.map((judge) => (
                  <SelectItem key={judge.id} value={judge.id.toString()}>
                    {judge.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Date Filed Range
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

        {(searchQuery || judgeId || startDate || endDate || sortOrder !== 'desc') && (
        <div className="mt-4 flex items-center flex-wrap gap-2">
          <span className="text-sm text-muted-foreground mr-2">Active filters:</span>
          {searchQuery && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              Search: {searchQuery}
              <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 p-0" onClick={clearSearchQueryFilter} aria-label="Clear search filter">
                <X className="h-3 w-3" />
              </Button>
            </span>
          )}
          {selectedJudge && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              Judge: {selectedJudge.full_name}
              <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 p-0" onClick={clearJudgeFilter} aria-label="Clear judge filter">
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

      {loading && clusters.length === 0 ? (
        <div className="flex justify-center items-center h-64">
          <LoadingIndicator size="large" />
        </div>
      ) : (
        <>
          <p className="mb-4">Showing {clusters.length} cases</p>
          {clusters.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {clusters.map((cluster) => (
                  <CourtCaseCard key={cluster.id} cluster={cluster} />
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
                No cases found matching your filters. Try adjusting your search criteria.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SupremeCourtCasesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">
      <LoadingIndicator size="large" />
    </div>}>
      <SupremeCourtCasesContent />
    </Suspense>
  );
}
