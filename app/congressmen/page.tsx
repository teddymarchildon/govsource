'use client';

import { useState, useEffect } from 'react';
import { getCongressmen } from '../../services/api';
import CongressmanCard from '../../components/CongressmanCard';
import { Congressman } from '../../types/types';
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

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
    const fetchCongressmen = async () => {
      setLoading(true);
      try {
        const params: any = { limit: 100 };
        if (party) {
          params.party = party;
        }
        if (state) {
          params.state = state;
        }
        if (chamber) {
          params.chamber = chamber;
        }
        if (searchTerm) {
          params.search = searchTerm;
        }
        // Add current filter parameter
        params.current = currentOnly;

        const data = await getCongressmen(params);
        setCongressmen(data);

        // Extract unique states
        const uniqueStates = data.reduce((acc: string[], congressman: Congressman) => {
          if (congressman.state && !acc.includes(congressman.state)) {
            acc.push(congressman.state);
          }
          return acc;
        }, []);
        setStates(uniqueStates.sort());
      } catch (error) {
        console.error('Error fetching congressmen:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCongressmen();
  }, [party, state, chamber, searchTerm, currentOnly]); // Added currentOnly to dependency array

  const clearFilters = () => {
    setParty('');
    setState('');
    setChamber('');
    setSearchTerm('');
    setCurrentOnly(true); // Reset to default (true)
  };

  // Individual clear handlers
  const clearPartyFilter = () => setParty('');
  const clearStateFilter = () => setState('');
  const clearChamberFilter = () => setChamber('');
  const clearCurrentOnlyFilter = () => setCurrentOnly(true);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Members of Congress</h1>

      {/* Redesigned Search & Filters */}
      <div className="mb-8 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-end md:space-x-4 gap-4 mb-4">
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium mb-1">
              Search Congressmembers
            </label>
            <Input
              id="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type to search by name..."
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="party-filter" className="block text-sm font-medium mb-1">
              Party
            </label>
            <Select value={party} onValueChange={setParty}>
              <SelectTrigger id="party-filter" className="w-full">
                <SelectValue placeholder="All Parties" />
              </SelectTrigger>
              <SelectContent>
                {parties.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label htmlFor="state-filter" className="block text-sm font-medium mb-1">
              State
            </label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger id="state-filter" className="w-full">
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                {states.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label htmlFor="chamber-filter" className="block text-sm font-medium mb-1">
              Chamber
            </label>
            <Select value={chamber} onValueChange={setChamber}>
              <SelectTrigger id="chamber-filter" className="w-full">
                <SelectValue placeholder="All Chambers" />
              </SelectTrigger>
              <SelectContent>
                {chambers.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <Checkbox id="currentOnly" checked={currentOnly} onCheckedChange={(checked) => setCurrentOnly(!!checked)} />
          <label htmlFor="currentOnly" className="text-sm select-none">
            Show current members only
          </label>
          <div className="ml-auto">
            <Button variant="outline" onClick={clearFilters} size="sm">
              Clear All Filters
            </Button>
          </div>
        </div>
        {(party || state || chamber || !currentOnly) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-2">Active filters:</span>
            {party && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                Party: {party}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-4 w-4 p-0"
                  onClick={clearPartyFilter}
                  aria-label="Clear party filter"
                >
                  <X className="h-3 w-3" />
                </Button>
              </span>
            )}
            {state && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                State: {state}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-4 w-4 p-0"
                  onClick={clearStateFilter}
                  aria-label="Clear state filter"
                >
                  <X className="h-3 w-3" />
                </Button>
              </span>
            )}
            {chamber && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                Chamber: {chamber}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-4 w-4 p-0"
                  onClick={clearChamberFilter}
                  aria-label="Clear chamber filter"
                >
                  <X className="h-3 w-3" />
                </Button>
              </span>
            )}
            {!currentOnly && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                Former Members
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-4 w-4 p-0"
                  onClick={clearCurrentOnlyFilter}
                  aria-label="Clear current only filter"
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
