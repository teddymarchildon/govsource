"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/utils/supabase/client";
import BillCard from "@/components/BillCard";
import { Bill, PolicyArea } from "@/types/types";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import LoadingIndicator from "@/components/ui/LoadingIndicator";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import {
  FilterToolbar,
  type FilterChip,
} from "@/components/listing/FilterToolbar";
import { FilterPopover } from "@/components/listing/FilterPopover";

interface BillsClientProps {
  initialBills: Bill[];
  policyAreas: PolicyArea[];
}

export default function BillsClient({
  initialBills,
  policyAreas,
}: BillsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPolicyArea = searchParams.get("policy_area") || "";
  const currentSearchQuery = searchParams.get("search") || "";
  const currentStartDate = searchParams.get("start_date") || "";
  const currentEndDate = searchParams.get("end_date") || "";
  const currentSortOrder = searchParams.get("sort_order") || "desc";

  const [bills, setBills] = useState<Bill[]>(initialBills);
  const [loading, setLoading] = useState(false);
  const [selectedPolicyArea, setSelectedPolicyArea] = useState<
    PolicyArea | ""
  >(currentPolicyArea as PolicyArea | "");
  const [searchQuery, setSearchQuery] = useState(currentSearchQuery);
  const [startDate, setStartDate] = useState<Date | undefined>(
    currentStartDate ? new Date(currentStartDate) : undefined,
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    currentEndDate ? new Date(currentEndDate) : undefined,
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(
    currentSortOrder === "asc" ? "asc" : "desc",
  );
  const [initialLoadComplete, _setInitialLoadComplete] = useState(true); // Already loaded from server

  const fetchBills = async (page: number) => {
    if (page === 1) {
      setBills([]);
    }

    try {
      // Calculate range for pagination
      const from = (page - 1) * 50;
      const to = from + 49;

      // Base query for bills
      let baseQuery = supabase
        .from("bill")
        .select(`*, sponsor:sponsored_bills(congressman:congressman(*))`)
        .is('law_enacted_date', null)
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

      // Apply date range filter if provided
      if (startDate) {
        baseQuery = baseQuery.gte(
          "introduced_date",
          startDate.toISOString().split("T")[0],
        );
      }

      if (endDate) {
        baseQuery = baseQuery.lte(
          "introduced_date",
          endDate.toISOString().split("T")[0],
        );
      }

      // Execute the query
      const { data, error } = await baseQuery;
      if (error) throw error;

      // Transform the data to match our Bill interface
      const fetchedBills =
        data?.map((bill: any) => ({
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
  const {
    loading: loadingMore,
    sentinelRef,
    reset: resetScroll,
  } = useInfiniteScroll(fetchBills, { enabled: initialLoadComplete });

  // Update URL and fetch data when filters change
  useEffect(() => {
    if (initialLoadComplete) {
      const params = new URLSearchParams();

      if (selectedPolicyArea) params.set("policy_area", selectedPolicyArea);
      if (searchQuery) params.set("search", searchQuery);
      if (startDate)
        params.set("start_date", startDate.toISOString().split("T")[0]);
      if (endDate) params.set("end_date", endDate.toISOString().split("T")[0]);
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
  }, [
    selectedPolicyArea,
    searchQuery,
    startDate,
    endDate,
    sortOrder,
    initialLoadComplete,
    router,
  ]);

  const handlePolicyAreaChange = (value: string) => {
    setSelectedPolicyArea(value as PolicyArea | "");
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
    setSortOrder(value as "asc" | "desc");
  };

  const clearFilters = () => {
    setSelectedPolicyArea("");
    setSearchQuery("");
    setStartDate(undefined);
    setEndDate(undefined);
    setSortOrder("desc");
  };

  // Individual clear handlers
  const clearPolicyAreaFilter = () => setSelectedPolicyArea("");
  const clearSearchQueryFilter = () => setSearchQuery("");
  const clearStartDateFilter = () => setStartDate(undefined);
  const clearEndDateFilter = () => setEndDate(undefined);
  const clearSortOrderFilter = () => setSortOrder("desc");

  const appliedFilterCount =
    (selectedPolicyArea ? 1 : 0) +
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

  if (selectedPolicyArea) {
    activeFilters.push({
      id: "policy",
      label: `Policy: ${selectedPolicyArea}`,
      onRemove: clearPolicyAreaFilter,
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
              Policy area
            </p>
            <Select
              value={selectedPolicyArea}
              onValueChange={handlePolicyAreaChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="All policy areas" />
              </SelectTrigger>
              <SelectContent>
                {policyAreas.map((area) => (
                  <SelectItem key={area} value={area}>
                    {area}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Introduced between
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
      <h1 className="text-3xl font-bold mb-2">Bills</h1>
      <p className="text-gray-600 text-sm mb-6">
        Browse and explore congressional bills, their sponsors, and policy areas
        they address
      </p>

      <FilterToolbar
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        searchLabel="Search bills"
        searchPlaceholder="Search by title, sponsor, or topic..."
        helperText="Use keywords, then fine-tune by policy area or date."
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
                No bills found matching your filters. Try adjusting your search
                criteria.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
