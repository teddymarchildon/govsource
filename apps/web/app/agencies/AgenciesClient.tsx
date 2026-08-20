'use client';

import { useState } from 'react';
import { Agency } from '@/types/types';
import AgencyCard from '@/components/AgencyCard';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FilterToolbar,
  type FilterChip,
} from "@/components/listing/FilterToolbar";
import { FilterPopover } from "@/components/listing/FilterPopover";

export default function AgenciesClient({ initialAgencies }: { initialAgencies: Agency[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [parentAgenciesOnly, setParentAgenciesOnly] = useState(false);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
  };

  const filteredAgencies = initialAgencies.filter(agency =>
    (!parentAgenciesOnly || agency.parent_id === null) &&
    (agency.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (agency.short_name && agency.short_name.toLowerCase().includes(searchTerm.toLowerCase())))
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

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Federal Agencies</h1>
      <p className="text-gray-600 text-sm mb-6">
        Explore cabinet departments, independent agencies, and offices that carry out federal policy.
      </p>

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
