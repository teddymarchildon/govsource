"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AgencyRuleCard from "@/components/AgencyRuleCard";
import { Agency, AgencyDocument } from "@/types/types";
import { createClient } from "@/utils/supabase/client";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import LoadingIndicator from "@/components/ui/LoadingIndicator";

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
  const [startDate, setStartDate] = useState(currentStartDate);
  const [endDate, setEndDate] = useState(currentEndDate);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(currentSortOrder === 'asc' ? 'asc' : 'desc');
  const [initialLoadComplete, setInitialLoadComplete] = useState(true); // Already loaded from server
  const supabase = createClient();

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
        baseQuery = baseQuery.gte("publication_date", startDate);
      }
      if (endDate) {
        baseQuery = baseQuery.lte("publication_date", endDate);
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
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
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

  const handleAgencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedAgencyId(e.target.value);
  };
  const handleRuleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRuleType(e.target.value);
  };
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(e.target.value);
  };
  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value);
  };
  const handleSortOrderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortOrder(e.target.value as 'asc' | 'desc');
  };
  const clearFilters = () => {
    setSelectedAgencyId("");
    setRuleType("");
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setSortOrder("desc");
  };
  // Individual clear handlers
  const clearAgencyFilter = () => setSelectedAgencyId("");
  const clearRuleTypeFilter = () => setRuleType("");
  const clearSearchQueryFilter = () => setSearchQuery("");
  const clearStartDateFilter = () => setStartDate("");
  const clearEndDateFilter = () => setEndDate("");
  const clearSortOrderFilter = () => setSortOrder("desc");

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Agency Rules</h1>
      <p className="text-gray-600 text-sm mb-6">Review federal agency rules and regulations that implement and enforce laws passed by Congress.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div>
          <label htmlFor="agency-filter" className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Agency
          </label>
          <select
            id="agency-filter"
            value={selectedAgencyId}
            onChange={handleAgencyChange}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">All Agencies</option>
            {agencies.map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rule-type-filter" className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Rule Type
          </label>
          <select
            id="rule-type-filter"
            value={ruleType}
            onChange={handleRuleTypeChange}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">All Rule Types</option>
            <option value="Presidential Document">Presidential Document</option>
            <option value="Proposed Rule">Proposed Rule</option>
            <option value="Rule">Rule</option>
            <option value="Notice">Notice</option>
          </select>
        </div>
        <div>
          <label htmlFor="search-filter" className="block text-sm font-medium text-gray-700 mb-2">
            Search Rules
          </label>
          <input
            id="search-filter"
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Search by title..."
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Date Signed
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex-1">
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={handleStartDateChange}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Start date"
              />
            </div>
            <div className="flex-1">
              <input
                id="end-date"
                type="date"
                value={endDate}
                onChange={handleEndDateChange}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="End date"
              />
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="sort-order" className="block text-sm font-medium text-gray-700 mb-2">
            Sort by Publication Date
          </label>
          <div className="flex">
            <select
              id="sort-order"
              value={sortOrder}
              onChange={handleSortOrderChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
        </div>
      </div>
      {(selectedAgencyId || ruleType || searchQuery || startDate || endDate || sortOrder !== "desc") && (
        <div className="mb-4 flex items-center flex-wrap">
          <div className="text-sm text-gray-600 mr-2">Active filters:</div>
          {selectedAgencyId && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2 mb-2">
              Agency: {agencies.find(a => a.id === selectedAgencyId)?.name || 'Selected'}
              <button
                onClick={clearAgencyFilter}
                className="ml-2 text-blue-500 hover:text-blue-700 focus:outline-none"
                aria-label="Clear agency filter"
              >
                &times;
              </button>
            </span>
          )}
          {ruleType && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2 mb-2">
              Type: {ruleType}
              <button
                onClick={clearRuleTypeFilter}
                className="ml-2 text-green-500 hover:text-green-700 focus:outline-none"
                aria-label="Clear rule type filter"
              >
                &times;
              </button>
            </span>
          )}
          {searchQuery && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mr-2 mb-2">
              Search: {searchQuery}
              <button
                onClick={clearSearchQueryFilter}
                className="ml-2 text-purple-500 hover:text-purple-700 focus:outline-none"
                aria-label="Clear search filter"
              >
                &times;
              </button>
            </span>
          )}
          {startDate && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 mr-2 mb-2">
              From: {new Date(startDate).toLocaleDateString()}
              <button
                onClick={clearStartDateFilter}
                className="ml-2 text-amber-500 hover:text-amber-700 focus:outline-none"
                aria-label="Clear start date filter"
              >
                &times;
              </button>
            </span>
          )}
          {endDate && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 mr-2 mb-2">
              To: {new Date(endDate).toLocaleDateString()}
              <button
                onClick={clearEndDateFilter}
                className="ml-2 text-amber-500 hover:text-amber-700 focus:outline-none"
                aria-label="Clear end date filter"
              >
                &times;
              </button>
            </span>
          )}
          {sortOrder !== "desc" && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 mr-2 mb-2">
              Sort: {sortOrder === "asc" ? "Oldest First" : "Newest First"}
              <button
                onClick={clearSortOrderFilter}
                className="ml-2 text-indigo-500 hover:text-indigo-700 focus:outline-none"
                aria-label="Clear sort order filter"
              >
                &times;
              </button>
            </span>
          )}
          <button
            onClick={clearFilters}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear all
          </button>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-xl">Loading...</div>
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
