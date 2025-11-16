'use client';

import { useEffect, useState } from 'react';
import { Agency } from '@/types/types';
import { getTopLevelAgencies, getAgencies } from '@/services/api';
import AgencyCard from '@/components/AgencyCard';
import { Checkbox } from '@/components/ui/checkbox';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import {
  FilterToolbar,
  type FilterChip,
} from "@/components/listing/FilterToolbar";
import { FilterPopover } from "@/components/listing/FilterPopover";

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [parentAgenciesOnly, setParentAgenciesOnly] = useState(false);

  useEffect(() => {
    const fetchAgencies = async () => {
      try {
        let data;
        if (parentAgenciesOnly) {
          // If parentAgenciesOnly is true, we need to get all agencies and filter
          data = await getAgencies();
          data = data.filter(agency => agency.parent_id === null);
        } else {
          data = await getTopLevelAgencies();
        }
        setAgencies(data);
      } catch (err) {
        setError('Failed to load agencies');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAgencies();
  }, [parentAgenciesOnly]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
  };

  const filteredAgencies = agencies.filter(agency =>
    agency.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (agency.short_name && agency.short_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const clearFilters = () => {
    setSearchTerm('');
    setParentAgenciesOnly(false);
  };

  // Individual clear handlers
  const clearSearchTermFilter = () => setSearchTerm('');
  const clearParentAgenciesOnlyFilter = () => setParentAgenciesOnly(false);

  const appliedFilterCount = parentAgenciesOnly ? 1 : 0;

  const activeFilters: FilterChip[] = [];

  if (searchTerm) {
    activeFilters.push({
      id: 'search',
      label: `Search: ${searchTerm}`,
      onRemove: clearSearchTermFilter,
    });
  }

  if (parentAgenciesOnly) {
    activeFilters.push({
      id: 'parent-only',
      label: 'Parent agencies only',
      onRemove: clearParentAgenciesOnlyFilter,
    });
  }

  const toolbarActions = (
    <FilterPopover count={appliedFilterCount}>
      <div className="rounded-lg border px-3 py-2">
        <label
          htmlFor="parentAgenciesOnly"
          className="flex cursor-pointer items-start gap-3 text-sm font-medium leading-5"
        >
          <Checkbox
            id="parentAgenciesOnly"
            checked={parentAgenciesOnly}
            onCheckedChange={(checked) => setParentAgenciesOnly(!!checked)}
          />
          Show only top-level (parent) agencies
        </label>
      </div>
    </FilterPopover>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingIndicator size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Federal Agencies</h1>

      <FilterToolbar
        searchValue={searchTerm}
        onSearchChange={handleSearchChange}
        searchLabel="Search federal agencies"
        searchPlaceholder="Search by name or acronym..."
        helperText="Use keywords and toggle filters to hone in on the agencies you need."
        actions={toolbarActions}
        activeFilters={activeFilters}
        clearAll={clearFilters}
        className="mb-8"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAgencies.map((agency) => (
          <AgencyCard
            key={agency.id}
            agency={agency}
          />
        ))}
      </div>
    </div>
  );
}
