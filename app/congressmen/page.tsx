'use client';

import { useState, useEffect } from 'react';
import { getCongressmen } from '../../services/api';
import CongressmanCard from '../../components/CongressmanCard';
import { Congressman } from '../../types/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import {
  FilterToolbar,
  type FilterChip,
} from "@/components/listing/FilterToolbar";
import { FilterPopover } from "@/components/listing/FilterPopover";

export default function CongressmenPage() {
  const [congressmen, setCongressmen] = useState<Congressman[]>([]);
  const [loading, setLoading] = useState(true);
  const [party, setParty] = useState('');
  const [state, setState] = useState('');
  const [chamber, setChamber] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [states, setStates] = useState<string[]>([]);
  const [currentOnly, setCurrentOnly] = useState(true); // Default to true for showing only current congressmen

  // Define party options
  const parties = ['Democrat', 'Republican', 'Independent'];

  // Define chamber options
  const chambers = ['House', 'Senate'];

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        // Fetch all congressmen initially to populate states dropdown
        const allCongressmen = await getCongressmen({ limit: 1000, current: true });
        const uniqueStates = allCongressmen.reduce((acc: string[], congressman: Congressman) => {
          if (congressman.state && !acc.includes(congressman.state)) {
            acc.push(congressman.state);
          }
          return acc;
        }, []);
        setStates(uniqueStates.sort());

        // Then fetch the filtered list for display
        const params: any = { limit: 100, current: currentOnly };
        if (party) params.party = party;
        if (state) params.state = state;
        if (chamber) params.chamber = chamber.toLowerCase();
        if (searchTerm) params.search = searchTerm;
        
        const filteredData = await getCongressmen(params);
        setCongressmen(filteredData);
      } catch (error) {
        console.error('Error fetching congressmen:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInitialData();
  }, [party, state, chamber, searchTerm, currentOnly]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
  };

  const clearFilters = () => {
    setParty('');
    setState('');
    setChamber('');
    setSearchTerm('');
    setCurrentOnly(true); // Reset to default (true)
  };

  // Individual clear handlers
  const clearSearchTermFilter = () => setSearchTerm('');
  const clearPartyFilter = () => setParty('');
  const clearStateFilter = () => setState('');
  const clearChamberFilter = () => setChamber('');
  const clearCurrentOnlyFilter = () => setCurrentOnly(true);

  const appliedFilterCount =
    (party ? 1 : 0) +
    (state ? 1 : 0) +
    (chamber ? 1 : 0) +
    (!currentOnly ? 1 : 0);

  const activeFilters: FilterChip[] = [];

  if (searchTerm) {
    activeFilters.push({
      id: 'search',
      label: `Search: ${searchTerm}`,
      onRemove: clearSearchTermFilter,
    });
  }

  if (party) {
    activeFilters.push({
      id: 'party',
      label: `Party: ${party}`,
      onRemove: clearPartyFilter,
    });
  }

  if (state) {
    activeFilters.push({
      id: 'state',
      label: `State: ${state}`,
      onRemove: clearStateFilter,
    });
  }

  if (chamber) {
    activeFilters.push({
      id: 'chamber',
      label: `Chamber: ${chamber}`,
      onRemove: clearChamberFilter,
    });
  }

  if (!currentOnly) {
    activeFilters.push({
      id: 'status',
      label: 'Including former members',
      onRemove: clearCurrentOnlyFilter,
    });
  }

  const toolbarActions = (
    <FilterPopover count={appliedFilterCount}>
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Party
          </p>
          <Select value={party} onValueChange={setParty}>
            <SelectTrigger>
              <SelectValue placeholder="All parties" />
            </SelectTrigger>
            <SelectContent>
              {parties.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            State
          </p>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger>
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent>
              {states.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chamber
          </p>
          <Select value={chamber} onValueChange={setChamber}>
            <SelectTrigger>
              <SelectValue placeholder="All chambers" />
            </SelectTrigger>
            <SelectContent>
              {chambers.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border px-3 py-2">
          <label
            htmlFor="currentOnly"
            className="flex cursor-pointer items-center gap-3 text-sm font-medium"
          >
            <Checkbox
              id="currentOnly"
              checked={currentOnly}
              onCheckedChange={(checked) => setCurrentOnly(!!checked)}
            />
            Show current members only
          </label>
        </div>
      </div>
    </FilterPopover>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">Members of Congress</h1>
      <p className="text-gray-600 mb-8">
        Discover and track congress members. Search by name, party, state, or chamber to find specific members of congress and their legislative activities.
      </p>

      <FilterToolbar
        searchValue={searchTerm}
        onSearchChange={handleSearchChange}
        searchLabel="Search members of Congress"
        searchPlaceholder="Type a name or keyword..."
        helperText="Open filters to narrow by party, state, chamber, or show former members."
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
          <p className="mb-4">Showing {congressmen.length} members of Congress</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {congressmen.map((congressman) => (
              <CongressmanCard key={congressman.id} congressman={congressman} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
