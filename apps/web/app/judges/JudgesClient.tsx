'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import JudgeCard from '@/components/JudgeCard';
import { Judge } from '@/types/types';
import {
  FilterToolbar,
  type FilterChip,
} from "@/components/listing/FilterToolbar";

export default function JudgesClient({ initialJudges }: { initialJudges: Judge[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearchQuery = searchParams.get('search') || '';

  const [searchQuery, setSearchQuery] = useState(currentSearchQuery);
  const judges = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return initialJudges;
    return initialJudges.filter((judge) =>
      [judge.first_name, judge.last_name, judge.full_name]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [initialJudges, searchQuery]);

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
      <h1 className="text-3xl font-bold mb-2">Supreme Court justices</h1>
      <p className="text-gray-600 text-sm mb-6">
        Browse justices and open a profile to explore the opinions they authored.
      </p>

      <FilterToolbar
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        searchLabel="Search justices"
        searchPlaceholder="Search by name..."
        helperText="Type to filter the directory instantly."
        activeFilters={activeFilters}
        clearAll={searchQuery ? clearFilters : undefined}
        className="mb-8"
      />

      <>
          <p className="mb-4">Showing {judges.length} justices</p>
          {judges.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {judges.map((judge) => (
                <JudgeCard key={judge.id} judge={judge} />
              ))}
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-yellow-700">
                No justices found matching your search. Try adjusting your search criteria.
              </p>
            </div>
          )}
      </>
    </div>
  );
}
