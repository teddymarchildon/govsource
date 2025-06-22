"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AgencyRuleCard from "@/components/AgencyRuleCard";
import { Agency, AgencyDocument } from "@/types/types";
import { supabase } from "@/utils/supabase/client";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import LoadingIndicator from "@/components/ui/LoadingIndicator";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

interface AgencyRulesClientProps {
  initialRules: AgencyDocument[];
  agencies: Agency[];
}

export default function AgencyRulesClient({ initialRules, agencies }: AgencyRulesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentAgencyId = searchParams.get("agency_id") || "";
  const currentRuleType = searchParams.get("type") || "";
  const currentSearchQuery = searchParams.get("search") || "";
  const currentStartDate = searchParams.get("start_date") || "";
  const currentEndDate = searchParams.get("end_date") || "";
  const currentSortOrder = searchParams.get("sort_order") || "desc";

  const [rules, setRules] = useState<AgencyDocument[]>(initialRules);
  const [loading, setLoading] = useState(false);
  const [selectedAgencyId, setSelectedAgencyId] = useState(currentAgencyId);
  const [ruleType, setRuleType] = useState(currentRuleType);
  const [searchQuery, setSearchQuery] = useState(currentSearchQuery);
  const [startDate, setStartDate] = useState<Date | undefined>(
    currentStartDate ? new Date(currentStartDate) : undefined,
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    currentEndDate ? new Date(currentEndDate) : undefined,
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(currentSortOrder === 'asc' ? 'asc' : 'desc');
  const [initialLoadComplete, setInitialLoadComplete] = useState(true); // Already loaded from server

  const fetchRules = async (page: number) => {
    if (page === 1) {
      setRules([]);
    }
    setLoading(true);
    try {
      // Calculate range for pagination
      const from = (page - 1) * 50;
      const to = from + 49;
      let baseQuery = supabase
        .from("agency_document")
        .select(`*, agencies:agency_agencydocument!agency_document_id(agency:agency(*))`)
        .order("publication_date", { ascending: sortOrder === "asc" })
        .range(from, to);

      if (selectedAgencyId) {
        // Get documents linked to this agency
        const { data: agencyDocuments, error: agencyError } = await supabase
          .from("agency_agencydocument")
          .select("agency_document_id")
          .eq("agency_id", selectedAgencyId);
        if (agencyError) throw agencyError;
        if (!agencyDocuments || agencyDocuments.length === 0) {
          setLoading(false);
          if (page === 1) setRules([]);
          return false;
        }
        const documentIds = agencyDocuments.map((doc: any) => doc.agency_document_id);
        baseQuery = baseQuery.in("id", documentIds);
      }
      if (ruleType) {
        baseQuery = baseQuery.eq("type", ruleType);
      }
      if (searchQuery) {
        baseQuery = baseQuery.ilike("title", `%${searchQuery}%`);
      }
      if (startDate) {
        baseQuery = baseQuery.gte("publication_date", startDate.toISOString().split('T')[0]);
      }
      if (endDate) {
        baseQuery = baseQuery.lte("publication_date", endDate.toISOString().split('T')[0]);
      }
      // Always exclude Executive Orders
      baseQuery = baseQuery.neq("type", "Executive Order");
      // Execute the query
      const { data, error } = await baseQuery;
      if (error) throw error;
      const fetchedRules = data?.map((doc: any) => ({
        ...doc,
        agency: doc.agencies?.[0]?.agency || null
      })) || [];
      if (page === 1) {
        setRules(fetchedRules);
      } else {
        setRules(prev => [...prev, ...fetchedRules]);
      }
      return fetchedRules.length === 50;
    } catch (error) {
      console.error("Error fetching rules:", error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Set up infinite scrolling
  const { loading: loadingMore, sentinelRef, reset: resetScroll } = useInfiniteScroll(
    fetchRules,
    { enabled: initialLoadComplete }
  );

  // Update URL and fetch data when filters change
  useEffect(() => {
    if (initialLoadComplete) {
      const params = new URLSearchParams();
      if (selectedAgencyId) params.set("agency_id", selectedAgencyId);
      if (ruleType) params.set("type", ruleType);
      if (searchQuery) params.set("search", searchQuery);
      if (startDate) params.set("start_date", startDate.toISOString().split('T')[0]);
      if (endDate) params.set("end_date", endDate.toISOString().split('T')[0]);
      if (sortOrder !== "desc") params.set("sort_order", sortOrder);
      const queryString = params.toString();
      const url = queryString ? `/agency-rules?${queryString}` : "/agency-rules";
      router.push(url, { scroll: false });
      setLoading(true);
      resetScroll();
      fetchRules(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgencyId, ruleType, searchQuery, startDate, endDate, sortOrder, initialLoadComplete, router]);

  const handleAgencyChange = (value: string) => {
    setSelectedAgencyId(value);
  };
  const handleRuleTypeChange = (value: string) => {
    setRuleType(value);
  };
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };
  const handleStartDateChange = (date: Date | undefined) => {
    setStartDate(date);
  };
  const handleEndDateChange = (date: Date | undefined) => {
    setEndDate(date);
  };
  const handleSortOrderChange = (value: string) => {
    setSortOrder(value as 'asc' | 'desc');
  };
  const clearFilters = () => {
    setSelectedAgencyId("");
    setRuleType("");
    setSearchQuery("");
    setStartDate(undefined);
    setEndDate(undefined);
    setSortOrder("desc");
  };
  // Individual clear handlers
  const clearAgencyFilter = () => setSelectedAgencyId("");
  const clearRuleTypeFilter = () => setRuleType("");
  const clearSearchQueryFilter = () => setSearchQuery("");
  const clearStartDateFilter = () => setStartDate(undefined);
  const clearEndDateFilter = () => setEndDate(undefined);
  const clearSortOrderFilter = () => setSortOrder("desc");

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Agency Rules</h1>
      <p className="text-gray-600 text-sm mb-6">Review federal agency rules and regulations that implement and enforce laws passed by Congress.</p>
      
      <div className="mb-8 rounded-xl border bg-card p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-4">
          <div>
            <label htmlFor="agency-filter" className="block text-sm font-medium mb-1">
              Agency
            </label>
            <Select value={selectedAgencyId} onValueChange={handleAgencyChange}>
              <SelectTrigger id="agency-filter">
                <SelectValue placeholder="All Agencies" />
              </SelectTrigger>
              <SelectContent>
                {agencies.map((agency) => (
                  <SelectItem key={agency.id} value={agency.id.toString()}>{agency.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="rule-type-filter" className="block text-sm font-medium mb-1">
              Rule Type
            </label>
            <Select value={ruleType} onValueChange={handleRuleTypeChange}>
              <SelectTrigger id="rule-type-filter">
                <SelectValue placeholder="All Rule Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Presidential Document">Presidential Document</SelectItem>
                <SelectItem value="Proposed Rule">Proposed Rule</SelectItem>
                <SelectItem value="Rule">Rule</SelectItem>
                <SelectItem value="Notice">Notice</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="search-filter" className="block text-sm font-medium mb-1">
              Search Rules
            </label>
            <Input
              id="search-filter"
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search by title..."
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Publication Date Range
            </label>
            <div className="grid grid-cols-2 gap-4">
              <DatePicker
                date={startDate}
                setDate={handleStartDateChange}
                placeholder="Start date"
              />
              <DatePicker
                date={endDate}
                setDate={handleEndDateChange}
                placeholder="End date"
              />
            </div>
          </div>
          <div>
            <label htmlFor="sort-order" className="block text-sm font-medium mb-1">
              Sort By
            </label>
            <Select value={sortOrder} onValueChange={handleSortOrderChange}>
              <SelectTrigger id="sort-order">
                <SelectValue placeholder="Sort by date..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Newest First</SelectItem>
                <SelectItem value="asc">Oldest First</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-end">
           <Button variant="outline" onClick={clearFilters} size="sm">
              Clear All Filters
            </Button>
        </div>

        {(selectedAgencyId || ruleType || searchQuery || startDate || endDate || sortOrder !== "desc") && (
          <div className="mt-4 flex items-center flex-wrap gap-2">
            <span className="text-sm text-muted-foreground mr-2">Active filters:</span>
            {selectedAgencyId && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                Agency: {agencies.find(a => a.id.toString() === selectedAgencyId)?.name || 'Selected'}
                <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 p-0" onClick={clearAgencyFilter} aria-label="Clear agency filter">
                  <X className="h-3 w-3" />
                </Button>
              </span>
            )}
            {ruleType && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                Type: {ruleType}
                <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 p-0" onClick={clearRuleTypeFilter} aria-label="Clear rule type filter">
                  <X className="h-3 w-3" />
                </Button>
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                Search: {searchQuery}
                <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 p-0" onClick={clearSearchQueryFilter} aria-label="Clear search filter">
                  <X className="h-3 w-3" />
                </Button>
              </span>
            )}
            {startDate && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                From: {startDate.toLocaleDateString()}
                <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 p-0" onClick={clearStartDateFilter} aria-label="Clear start date filter">
                  <X className="h-3 w-3" />
                </Button>
              </span>
            )}
            {endDate && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                To: {endDate.toLocaleDateString()}
                <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 p-0" onClick={clearEndDateFilter} aria-label="Clear end date filter">
                  <X className="h-3 w-3" />
                </Button>
              </span>
            )}
            {sortOrder !== "desc" && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                Sort: {sortOrder === "asc" ? "Oldest First" : "Newest First"}
                <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 p-0" onClick={clearSortOrderFilter} aria-label="Clear sort order filter">
                  <X className="h-3 w-3" />
                </Button>
              </span>
            )}
          </div>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingIndicator size="large" />
        </div>
      ) : (
        <>
          <p className="mb-4">Showing {rules.length} rules</p>
          {rules.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {rules.map((rule) => (
                  <AgencyRuleCard key={rule.id} rule={rule} />
                ))}
              </div>
              {/* Sentinel element for infinite scrolling */}
              <div ref={sentinelRef} className="h-4 mt-4"></div>
              {/* Loading indicator for more items */}
              {loadingMore && <LoadingIndicator size="medium" />}
            </>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-yellow-700">
                No rules found. Try adjusting your filters or check back later.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
