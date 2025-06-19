'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import JudgeCard from '@/components/JudgeCard';
import { Judge } from '@/types/types';

function JudgesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearchQuery = searchParams.get('search') || '';

  const [judges, setJudges] = useState<Judge[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(currentSearchQuery);
    
  useEffect(() => {
    const fetchJudges = async () => {
      setLoading(true);
      try {
        let query = supabase.from('judge').select('*');

        // Apply search filter if provided
        if (searchQuery) {
          query = query.or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`);
        }

        // Sort by last name
        query = query.order('last_name', { ascending: true });

        // Execute the query
        const { data, error } = await query;
        if (error) throw error;

        setJudges(data || []);
      } catch (error) {
        console.error('Error fetching judges:', error);
        setJudges([]);
      } finally {
        setLoading(false);
      }
    };

    fetchJudges();
  }, [searchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    // Update URL query params
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('search', value);
    } else {
      params.delete('search');
    }

    router.push(`/judges${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const clearFilters = () => {
    setSearchQuery('');
    router.push('/judges');
  };

  // Individual clear handler
  const clearSearchQueryFilter = () => {
    setSearchQuery('');
    router.push('/judges');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Supreme Court Judges</h1>

      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="search-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Search Judges
            </label>
            <div className="flex">
              <input
                id="search-filter"
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search by name..."
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {searchQuery && (
        <div className="mb-4 flex items-center">
          <div className="text-sm text-gray-600 mr-2">Active filters:</div>
          {searchQuery && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mr-2">
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
          <button
            onClick={clearFilters}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear all
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-xl">Loading...</div>
        </div>
      ) : (
        <>
          <p className="mb-4">Showing {judges.length} judges</p>
          {judges.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {judges.map((judge) => (
                <JudgeCard key={judge.id} judge={judge} />
              ))}
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-yellow-700">
                No judges found matching your search. Try adjusting your search criteria.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function JudgesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">
      <div className="text-xl">Loading...</div>
    </div>}>
      <JudgesContent />
    </Suspense>
  );
}
