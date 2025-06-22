'use client';

import { useEffect, useState } from 'react';
import { Agency } from '@/types/types';
import { getTopLevelAgencies, getAgencies } from '@/services/api';
import AgencyCard from '@/components/AgencyCard';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

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

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
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

      <div className="mb-8 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-end md:space-x-4 gap-4 mb-4">
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium mb-1">
              Search Agencies
            </label>
            <Input
              id="search"
              placeholder="Search agencies by name or acronym..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="ml-auto">
            <Button variant="outline" onClick={clearFilters} size="sm">
              Clear All Filters
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <Checkbox 
            id="parentAgenciesOnly" 
            checked={parentAgenciesOnly} 
            onCheckedChange={(checked) => setParentAgenciesOnly(!!checked)} 
          />
          <label htmlFor="parentAgenciesOnly" className="text-sm select-none">
            Show parent agencies only
          </label>
        </div>
        {(searchTerm || parentAgenciesOnly) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-2">Active filters:</span>
            {searchTerm && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                Search: {searchTerm}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-4 w-4 p-0"
                  onClick={clearSearchTermFilter}
                  aria-label="Clear search filter"
                >
                  <X className="h-3 w-3" />
                </Button>
              </span>
            )}
            {parentAgenciesOnly && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Parent agencies only
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-4 w-4 p-0"
                  onClick={clearParentAgenciesOnlyFilter}
                  aria-label="Clear parent agencies only filter"
                >
                  <X className="h-3 w-3" />
                </Button>
              </span>
            )}
          </div>
        )}
      </div>

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
