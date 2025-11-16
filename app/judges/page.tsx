'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import JudgeCard from '@/components/JudgeCard';
import { Judge } from '@/types/types';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import {
  FilterToolbar,
  type FilterChip,
} from "@/components/listing/FilterToolbar";

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

  const handleSearchChange = (value: string) => {
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

  const activeFilters: FilterChip[] = searchQuery
    ? [
        {
          id: 'search',
          label: `Search: ${searchQuery}`,
          onRemove: clearSearchQueryFilter,
        },
      ]
    : [];

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Supreme Court Judges</h1>
      <p className="text-gray-600 text-sm mb-6">
        Browse current and former justices, then search to quickly zero in on a particular name.
      </p>

      <FilterToolbar
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        searchLabel="Search judges"
        searchPlaceholder="Search by name..."
        helperText="Type to filter the directory instantly."
        activeFilters={activeFilters}
        clearAll={searchQuery ? clearFilters : undefined}
        className="mb-8"
      />

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingIndicator size="large" />
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
      <LoadingIndicator size="large" />
    </div>}>
      <JudgesContent />
    </Suspense>
  );
}
