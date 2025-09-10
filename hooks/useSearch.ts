'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { globalSearch } from '../services/api';

export default function useSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  
  const emptyResults = useMemo(() => ({
    bills: [],
    congressmen: [],
    agencies: [],
    cases: [],
    judges: [],
    agencyDocuments: []
  }), []);
  
  const [results, setResults] = useState(emptyResults);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300); // 300ms debounce time

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch search results when debounced query changes
  useEffect(() => {
    const fetchResults = async () => {
      if (debouncedQuery.trim() === '') {
        setResults(emptyResults);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const searchResults = await globalSearch(debouncedQuery);
        // @ts-ignore
        setResults(searchResults);
        setShowResults(true);
      } catch (error) {
        console.error('Error searching:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [debouncedQuery, emptyResults]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (value.trim() === '') {
      setShowResults(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    setResults(emptyResults);
    setShowResults(false);
  }, [emptyResults]);

  const closeResults = useCallback(() => {
    setShowResults(false);
  }, []);

  return {
    searchQuery,
    results,
    isLoading,
    showResults,
    handleSearchChange,
    clearSearch,
    closeResults
  };
}
