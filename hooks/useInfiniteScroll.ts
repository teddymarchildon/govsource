import { useEffect, useState, useCallback, useRef } from 'react';

interface UseInfiniteScrollOptions {
  threshold?: number; // Distance from bottom (in pixels) to trigger loading more
  initialPage?: number;
  enabled?: boolean;
}

/**
 * Custom hook for implementing infinite scrolling
 * @param loadMore Function to call when more items need to be loaded
 * @param options Configuration options
 * @returns Object containing loading state and reference to attach to a sentinel element
 */
export function useInfiniteScroll(
  loadMore: (page: number) => Promise<boolean>,
  options: UseInfiniteScrollOptions = {}
) {
  const { 
    threshold = 200, 
    initialPage = 1,
    enabled = true
  } = options;
  
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Use a ref to prevent race conditions between multiple load calls
  const isLoadingRef = useRef(false);

  // Function to handle loading more items
  const handleLoadMore = useCallback(async (targetPage?: number) => {
    const pageToFetch = targetPage ?? page;
    
    if (isLoadingRef.current || !hasMore || !enabled) {
      return;
    }
    
    isLoadingRef.current = true;
    setLoading(true);
    try {
      const hasMoreData = await loadMore(pageToFetch);
      setHasMore(hasMoreData);
      // Always set page to the next page after the one we just fetched
      setPage(pageToFetch + 1);
    } catch (error) {
      console.error('Error loading more items:', error);
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, loadMore, page, enabled]);

  // Set up the intersection observer
  useEffect(() => {
    if (!enabled) return;

    const options = {
      root: null, // Use the viewport as the root
      rootMargin: `0px 0px ${threshold}px 0px`, // Bottom margin to trigger earlier
      threshold: 0, // Trigger as soon as any part is visible
    };

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !isLoadingRef.current) {
        handleLoadMore();
      }
    }, options);

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.current.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel && observer.current) {
        observer.current.unobserve(currentSentinel);
      }
    };
  }, [handleLoadMore, hasMore, threshold, enabled]);

  // Reset pagination and optionally trigger an immediate load
  const reset = useCallback((triggerImmediateLoad = false) => {
    setPage(initialPage);
    setHasMore(true);
    isLoadingRef.current = false;
    
    if (triggerImmediateLoad) {
      // Use setTimeout to ensure state updates have been processed
      setTimeout(() => {
        handleLoadMore(initialPage);
      }, 0);
    }
  }, [initialPage, handleLoadMore]);

  return {
    loading,
    hasMore,
    sentinelRef,
    page,
    reset,
    // Expose triggerLoad for manual loading (useful for initial loads after filter changes)
    triggerLoad: handleLoadMore
  };
}
