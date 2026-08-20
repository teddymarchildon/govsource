'use client';

import { useMemo, useState } from 'react';
import CongressmanCard from '../../components/CongressmanCard';
import { Congressman } from '../../types/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FilterToolbar,
  type FilterChip,
} from "@/components/listing/FilterToolbar";
import { FilterPopover } from "@/components/listing/FilterPopover";

type CongressMembersClientProps = {
  members: Congressman[];
  currentMemberIds: string[];
};

export default function CongressMembersClient({ members, currentMemberIds }: CongressMembersClientProps) {
  const [party, setParty] = useState('');
  const [state, setState] = useState('');
  const [chamber, setChamber] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentOnly, setCurrentOnly] = useState(true); // Default to true for showing only current Congress members

  // Define party options
  const parties = ['Democrat', 'Republican', 'Independent'];

  // Define chamber options
  const chambers = ['House', 'Senate'];

  const currentIdSet = useMemo(() => new Set(currentMemberIds), [currentMemberIds]);
  const states = useMemo(
    () => [...new Set(members.map((member) => member.state).filter(Boolean))].sort(),
    [members],
  );
  const congressmen = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return members.filter((member) =>
      (!currentOnly || currentIdSet.has(String(member.id))) &&
      (!party || member.party === party) &&
      (!state || member.state === state) &&
      (!chamber || member.chamber?.toLowerCase() === chamber.toLowerCase()) &&
      (!normalizedSearch || member.full_name.toLowerCase().includes(normalizedSearch))
    );
  }, [members, currentOnly, currentIdSet, party, state, chamber, searchTerm]);

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
      <h1 className="text-3xl font-bold mb-2">Congress members</h1>
      <p className="text-gray-600 text-sm mb-6">
        Browse lawmakers, then filter by chamber, party, state, or status to zero in on the people you need.
      </p>

      <FilterToolbar
        searchValue={searchTerm}
        onSearchChange={handleSearchChange}
        searchLabel="Search Congress members"
        searchPlaceholder="Type a name or keyword..."
        helperText="Open filters to narrow by party, state, chamber, or show former members."
        actions={toolbarActions}
        activeFilters={activeFilters}
        clearAll={clearFilters}
        className="mb-8"
      />

      <>
          <p className="mb-4">Showing {congressmen.length} Congress members</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {congressmen.map((congressman) => (
              <CongressmanCard key={congressman.id} congressman={congressman} />
            ))}
          </div>
      </>
    </div>
  );
}
