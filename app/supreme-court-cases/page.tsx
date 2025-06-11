'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabase';
import CourtCaseCard from '../../components/CourtCaseCard';
import { Cluster, Judge } from '../../types/types';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import LoadingIndicator from '../../components/ui/LoadingIndicator';

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
  const [startDate, setStartDate] = useState(currentStartDate);
  const [endDate, setEndDate] = useState(currentEndDate);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(currentSortOrder === 'asc' ? 'asc' : 'desc');
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const supabase = createClient();
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
      // Calculate range for pagination
      const from = (page - 1) * 50;
      const to = from + 49;

      let query = supabase
        .from('cluster')
        .select(`
          *,
          court (*),
          opinions:court_opinion (
            *,
            author:judge (*)
          )
        `)
        .eq('court.remote_id', 'scotus')
        .order('date_filed', { ascending: sortOrder === 'asc' })
        .range(from, to);

      // Apply search filter if provided
      if (searchQuery) {
        query = query.or(`case_name.ilike.%${searchQuery}%,case_name_short.ilike.%${searchQuery}%`);
      }

      // Apply judge filter if selected
      if (judgeId) {
        // First get the case IDs associated with this judge
        const { data: judgeCases, error: judgeError } = await supabase
          .from('cluster')
          .select('id')
          .eq('opinions.author.id', judgeId);

        if (judgeError) throw judgeError;

        // If there are cases with this judge, filter the query
        if (judgeCases && judgeCases.length > 0) {
          const caseIds = judgeCases.map(item => item.id);
          query = query.in('id', caseIds);
        } else {
          // If no cases are associated with this judge, return empty array
          setLoading(false);
          if (page === 1) {
            setClusters([]);
          }
          return false;
        }
      }

      // Apply date range filter if provided
      if (startDate) {
        query = query.gte('date_filed', startDate);
      }

      if (endDate) {
        query = query.lte('date_filed', endDate);
      }

      // Execute the query
      const { data, error } = await query;
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
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (sortOrder !== 'desc') params.set('sort_order', sortOrder);

    const queryString = params.toString();
    router.push(`/supreme-court-cases${queryString ? `?${queryString}` : ''}`);
  }, [searchQuery, judgeId, startDate, endDate, sortOrder, router]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
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

  const handleJudgeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setJudgeId(e.target.value);
    const selectedJudgeId = e.target.value;
    setSelectedJudge(judges.find(j => j.id.toString() === selectedJudgeId) || null);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
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
  const clearStartDateFilter = () => setStartDate('');
  const clearEndDateFilter = () => setEndDate('');
  const clearSortOrderFilter = () => setSortOrder('desc');

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Supreme Court Cases</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
            Search Cases
          </label>
          <input
            id="search"
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Search by case name"
          />
        </div>

        <div>
          <label htmlFor="judge-filter" className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Judge
          </label>
          <select
            id="judge-filter"
            value={judgeId}
            onChange={handleJudgeChange}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">All Judges</option>
            {judges.map((judge) => (
              <option key={judge.id} value={judge.id}>
                {judge.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <label htmlFor="date-range" className="block text-sm font-medium text-gray-700 mb-2">
            Date Filed Range
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex-1">
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={handleStartDateChange}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Start date"
              />
            </div>
            <div className="flex-1">
              <input
                id="end-date"
                type="date"
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
            Sort by Date Filed
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

      {(searchQuery || startDate || endDate || sortOrder !== 'desc' || judgeId) && (
        <div className="mb-4 flex items-center flex-wrap">
          <div className="text-sm text-gray-600 mr-2">Active filters:</div>
          {searchQuery && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2 mb-2">
              Search: {searchQuery}
              <button
                onClick={clearSearchQueryFilter}
                className="ml-2 text-blue-500 hover:text-blue-700 focus:outline-none"
                aria-label="Clear search filter"
              >
                &times;
              </button>
            </span>
          )}
          {selectedJudge && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mr-2 mb-2">
              Judge: {selectedJudge.full_name}
              <button
                onClick={clearJudgeFilter}
                className="ml-2 text-purple-500 hover:text-purple-700 focus:outline-none"
                aria-label="Clear judge filter"
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

      {loading && clusters.length === 0 ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-xl">Loading...</div>
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
      <div className="text-xl">Loading...</div>
    </div>}>
      <SupremeCourtCasesContent />
    </Suspense>
  );
}
