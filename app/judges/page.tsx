'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import JudgeCard from '@/components/JudgeCard';
import { Judge } from '@/types/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

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

      <div className="mb-8 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-end md:space-x-4 gap-4 mb-4">
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium mb-1">
              Search Judges
            </label>
            <Input
              id="search"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full"
            />
          </div>
          <div className="ml-auto">
            <Button variant="outline" onClick={clearFilters} size="sm">
              Clear Filter
            </Button>
          </div>
        </div>
        {searchQuery && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-2">Active filters:</span>
            {searchQuery && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                Search: {searchQuery}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-4 w-4 p-0"
                  onClick={clearSearchQueryFilter}
                  aria-label="Clear search filter"
                >
                  <X className="h-3 w-3" />
                </Button>
              </span>
            )}
          </div>
        )}
      </div>

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
