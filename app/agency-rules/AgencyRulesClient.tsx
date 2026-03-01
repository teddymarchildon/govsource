"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AgencyRuleCard from "@/components/AgencyRuleCard";
import { Agency, AgencyDocument } from "@/types/types";
import { supabase } from "@/utils/supabase/client";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import LoadingIndicator from "@/components/ui/LoadingIndicator";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import {
  FilterToolbar,
  type FilterChip,
} from "@/components/listing/FilterToolbar";
import { FilterPopover } from "@/components/listing/FilterPopover";

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
  const [initialLoadComplete, _setInitialLoadComplete] = useState(true); // Already loaded from server
  const [hasHydrated, setHasHydrated] = useState(false);

  const fetchRules = async (page: number) => {
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
      // Always exclude Executive Orders (they belong on the dedicated EO page)
      baseQuery = baseQuery.neq("subtype", "Executive Order");
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
    if (!initialLoadComplete || !hasHydrated) return;

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
    // Reset and trigger a new fetch - the hook will handle loading state
    setLoading(true);
    resetScroll(true); // Pass true to trigger immediate load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgencyId, ruleType, searchQuery, startDate, endDate, sortOrder, initialLoadComplete, hasHydrated, router]);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const handleAgencyChange = (value: string) => {
    setSelectedAgencyId(value);
  };
  const handleRuleTypeChange = (value: string) => {
    setRuleType(value);
  };
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
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

  const appliedFilterCount =
    (selectedAgencyId ? 1 : 0) +
    (ruleType ? 1 : 0) +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0);

  const activeFilters: FilterChip[] = [];

  if (searchQuery) {
    activeFilters.push({
      id: "search",
      label: `Search: ${searchQuery}`,
      onRemove: clearSearchQueryFilter,
    });
  }

  if (selectedAgencyId) {
    activeFilters.push({
      id: "agency",
      label: `Agency: ${
        agencies.find((agency) => agency.id.toString() === selectedAgencyId)
          ?.name || "Selected agency"
      }`,
      onRemove: clearAgencyFilter,
    });
  }

  if (ruleType) {
    activeFilters.push({
      id: "type",
      label: `Type: ${ruleType}`,
      onRemove: clearRuleTypeFilter,
    });
  }

  if (startDate) {
    activeFilters.push({
      id: "start",
      label: `From: ${startDate.toLocaleDateString()}`,
      onRemove: clearStartDateFilter,
    });
  }

  if (endDate) {
    activeFilters.push({
      id: "end",
      label: `To: ${endDate.toLocaleDateString()}`,
      onRemove: clearEndDateFilter,
    });
  }

  if (sortOrder !== "desc") {
    activeFilters.push({
      id: "sort",
      label: `Sort: ${sortOrder === "asc" ? "Oldest first" : "Newest first"}`,
      onRemove: clearSortOrderFilter,
    });
  }

  const toolbarActions = (
    <>
      <FilterPopover count={appliedFilterCount}>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Agency
            </p>
            <Select value={selectedAgencyId} onValueChange={handleAgencyChange}>
              <SelectTrigger>
                <SelectValue placeholder="All agencies" />
              </SelectTrigger>
              <SelectContent>
                {agencies.map((agency) => (
                  <SelectItem key={agency.id} value={agency.id.toString()}>
                    {agency.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Document type
            </p>
            <Select value={ruleType} onValueChange={handleRuleTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="All document types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Presidential Document">
                  Presidential Document
                </SelectItem>
                <SelectItem value="Proposed Rule">Proposed Rule</SelectItem>
                <SelectItem value="Rule">Rule</SelectItem>
                <SelectItem value="Notice">Notice</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Publication date
            </p>
            <div className="grid grid-cols-2 gap-2">
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
        </div>
      </FilterPopover>
      <Select value={sortOrder} onValueChange={handleSortOrderChange}>
        <SelectTrigger className="h-10 w-[240px] text-sm">
          <SelectValue placeholder="Sort by date..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="desc">Newest first</SelectItem>
          <SelectItem value="asc">Oldest first</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Agency Documents</h1>
      <p className="text-gray-600 text-sm mb-6">Review federal agency documents, rules, and regulations that implement and enforce laws passed by Congress.</p>
      
      <FilterToolbar
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        searchLabel="Search agency documents"
        searchPlaceholder="Search by title or keyword..."
        helperText="Use the quick search, then pop open filters for agency, document type, or timeframe."
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
