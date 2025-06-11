"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import BillCard from "@/components/BillCard";
import CongressmanSearchSelect, { CongressmanSearchSelectRef } from "@/components/CongressmanSearchSelect";
import { Bill, Congressman, PolicyArea } from "@/types/types";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import LoadingIndicator from "@/components/ui/LoadingIndicator";

interface BillsClientProps {
  initialBills: Bill[];
  policyAreas: PolicyArea[];
}

export default function BillsClient({ initialBills, policyAreas }: BillsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPolicyArea = searchParams.get("policy_area") || "";
  const currentSearchQuery = searchParams.get("search") || "";
  const currentSponsorId = searchParams.get("sponsor_id");
  const currentStartDate = searchParams.get("start_date") || "";
  const currentEndDate = searchParams.get("end_date") || "";
  const currentSortOrder = searchParams.get("sort_order") || "desc";

  const [bills, setBills] = useState<Bill[]>(initialBills);
  const [loading, setLoading] = useState(false);
  const [selectedPolicyArea, setSelectedPolicyArea] = useState<PolicyArea | "">(currentPolicyArea as PolicyArea | "");
  const [searchQuery, setSearchQuery] = useState(currentSearchQuery);
  const [selectedSponsor, setSelectedSponsor] = useState<Congressman | null>(null);
  const [startDate, setStartDate] = useState(currentStartDate);
  const [endDate, setEndDate] = useState(currentEndDate);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(currentSortOrder === "asc" ? "asc" : "desc");
  const congressmanSearchRef = useRef<CongressmanSearchSelectRef>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(true); // Already loaded from server

  // Fetch sponsor details if sponsor_id is in URL
  useEffect(() => {
    const fetchSponsor = async () => {
      const supabase = createClient();
      if (currentSponsorId && !selectedSponsor) {
        try {
          const { data, error } = await supabase
            .from("congressman")
            .select("*")
            .eq("id", currentSponsorId)
            .single();

          if (error) throw error;
          if (data) {
            setSelectedSponsor(data);
          }
        } catch (error) {
          console.error("Error fetching sponsor:", error);
        }
      }
    };

    fetchSponsor();
  }, [currentSponsorId, selectedSponsor]);

  const fetchBills = async (page: number) => {
    if (page === 1) {
      setBills([]);
    }

    try {
      const supabase = createClient();
      // Calculate range for pagination
      const from = (page - 1) * 50;
      const to = from + 49;

      // Base query for bills
      let baseQuery = supabase
        .from("bill")
        .select(`*, sponsor:sponsored_bills(congressman:congressman(*))`)
        .order("introduced_date", { ascending: sortOrder === "asc" })
        .range(from, to);

      // Apply policy area filter if selected
      if (selectedPolicyArea) {
        baseQuery = baseQuery.eq("policy_area", selectedPolicyArea);
      }

      // Apply search filter if provided
      if (searchQuery) {
        baseQuery = baseQuery.ilike("title", `%${searchQuery}%`);
      }

      // Apply sponsor filter if we have a selected sponsor
      if (selectedSponsor) {
        baseQuery = baseQuery.eq("sponsor.congressman_id", selectedSponsor.id);
      }

      // Apply date range filter if provided
      if (startDate) {
        baseQuery = baseQuery.gte("introduced_date", startDate);
      }

      if (endDate) {
        baseQuery = baseQuery.lte("introduced_date", endDate);
      }

      // Execute the query
      const { data, error } = await baseQuery;
      if (error) throw error;

      // Transform the data to match our Bill interface
      const fetchedBills = data?.map((bill: any) => ({
        ...bill,
        sponsor: bill.sponsor?.[0]?.congressman || null,
      })) || [];

      // Update bills state
      if (page === 1) {
        setBills(fetchedBills as Bill[]);
      } else {
        setBills((prevBills) => [...prevBills, ...(fetchedBills as Bill[])]);
      }

      // Return whether there are more items to load
      return fetchedBills.length === 50;
    } catch (error) {
      console.error("Error fetching bills:", error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Set up infinite scrolling
  const { loading: loadingMore, sentinelRef, reset: resetScroll } = useInfiniteScroll(
    fetchBills,
    { enabled: initialLoadComplete }
  );

  // Update URL and fetch data when filters change
  useEffect(() => {
    if (initialLoadComplete) {
      const params = new URLSearchParams();

      if (selectedPolicyArea) params.set("policy_area", selectedPolicyArea);
      if (searchQuery) params.set("search", searchQuery);
      if (selectedSponsor) params.set("sponsor_id", selectedSponsor.id);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      if (sortOrder !== "desc") params.set("sort_order", sortOrder);

      const queryString = params.toString();
      const url = queryString ? `/bills?${queryString}` : "/bills";
      router.push(url, { scroll: false });

      // Always fetch, even if no filters are applied
      setLoading(true);
      resetScroll();
      fetchBills(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPolicyArea, searchQuery, selectedSponsor, startDate, endDate, sortOrder, initialLoadComplete, router]);

  const handlePolicyAreaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as PolicyArea | "";
    setSelectedPolicyArea(value || "");
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
    setSortOrder(e.target.value as "asc" | "desc");
  };

  const handleSponsorSelect = (congressman: Congressman | null) => {
    setSelectedSponsor(congressman);
  };

  const clearFilters = () => {
    setSelectedPolicyArea("");
    setSearchQuery("");
    setSelectedSponsor(null);
    setStartDate("");
    setEndDate("");
    setSortOrder("desc");

    // Clear the congressman search component
    if (congressmanSearchRef.current) {
      congressmanSearchRef.current.clear();
    }
  };

  // Individual clear handlers
  const clearPolicyAreaFilter = () => setSelectedPolicyArea("");
  const clearSearchQueryFilter = () => setSearchQuery("");
  const clearSponsorFilter = () => {
    setSelectedSponsor(null);
    if (congressmanSearchRef.current) {
      congressmanSearchRef.current.clear();
    }
  };
  const clearStartDateFilter = () => setStartDate("");
  const clearEndDateFilter = () => setEndDate("");
  const clearSortOrderFilter = () => setSortOrder("desc");

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Bills</h1>
      <p className="text-gray-600 text-sm mb-6">Browse and explore congressional bills, their sponsors, and policy areas they address.</p>

      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div>
            <label htmlFor="policy-area" className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Policy Area
            </label>
            <select
              id="policy-area"
              value={selectedPolicyArea || ""}
              onChange={handlePolicyAreaChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">All Policy Areas</option>
              {policyAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="search-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Search Bills
            </label>
            <input
              id="search-filter"
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search by title..."
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Sponsor
            </label>
            <CongressmanSearchSelect
              ref={congressmanSearchRef}
              onSelect={handleSponsorSelect}
              selectedId={selectedSponsor?.id?.toString()}
              placeholder="Search for a congressman..."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Date Introduced
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
              Sort by Introduced Date
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
      </div>

      {(selectedPolicyArea || searchQuery || selectedSponsor || startDate || endDate || sortOrder !== "desc") && (
        <div className="mb-4 flex items-center flex-wrap">
          <div className="text-sm text-gray-600 mr-2">Active filters:</div>
          {selectedPolicyArea && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2 mb-2">
              Policy: {selectedPolicyArea}
              <button
                onClick={clearPolicyAreaFilter}
                className="ml-2 text-blue-500 hover:text-blue-700 focus:outline-none"
                aria-label="Clear policy area filter"
              >
                &times;
              </button>
            </span>
          )}
          {searchQuery && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2 mb-2">
              Search: {searchQuery}
              <button
                onClick={clearSearchQueryFilter}
                className="ml-2 text-green-500 hover:text-green-700 focus:outline-none"
                aria-label="Clear search filter"
              >
                &times;
              </button>
            </span>
          )}
          {selectedSponsor && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mr-2 mb-2">
              Sponsor: {selectedSponsor.full_name}
              <button
                onClick={clearSponsorFilter}
                className="ml-2 text-purple-500 hover:text-purple-700 focus:outline-none"
                aria-label="Clear sponsor filter"
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
          <p className="mb-4">Showing {bills.length} bills</p>
          {bills.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {bills.map((bill) => (
                  <BillCard key={bill.id} bill={bill} />
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
                No bills found matching your filters. Try adjusting your search criteria.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
