'use client';

import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { useState, useRef, useEffect } from 'react';
import SearchResults from './SearchResults';
import useSearch from '../hooks/useSearch';
import { usePathname } from 'next/navigation';
import { getLoginUrl } from '@/utils/utils';

export default function Header() {
  const { user, signOut, loading } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Use our custom search hook
  const {
    searchQuery,
    results,
    isLoading,
    showResults,
    handleSearchChange,
    clearSearch,
    closeResults
  } = useSearch();

  const handleSignOut = async () => {
    try {
      await signOut();
      setDropdownOpen(false);
      setMobileMenuOpen(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle keyboard navigation for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Close search results on Escape key
      if (e.key === 'Escape' && showResults) {
        closeResults();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showResults, closeResults]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const mobileMenuButton = document.getElementById('mobile-menu-button');
      if (mobileMenuOpen && mobileMenuButton && !mobileMenuButton.contains(target)) {
        // Check if the click is outside the mobile menu
        const mobileMenu = document.getElementById('mobile-menu');
        if (mobileMenu && !mobileMenu.contains(target)) {
          setMobileMenuOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mobileMenuOpen]);

  return (
    <header className="bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-10">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold text-primary">
              GovSource
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              id="mobile-menu-button"
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              className="p-2 mr-2 text-gray-500 hover:text-gray-700 focus:outline-none"
              aria-label="Toggle search"
            >
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button
              id="mobile-menu-button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-gray-500 hover:text-gray-700 focus:outline-none"
              aria-label="Toggle menu"
            >
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* Desktop search and user menu */}
          <div className="hidden md:flex items-center ml-auto">
            <div className="relative mr-4" ref={searchContainerRef}>
              <input
                type="text"
                placeholder="Search the government..."
                className="w-64 bg-gray-100 border border-gray-300 rounded-md py-2 px-4 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                value={searchQuery}
                onChange={handleSearchChange}
                aria-label="Search"
                aria-expanded={showResults}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>

              {/* Clear search button */}
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  aria-label="Clear search"
                >
                  <svg className="h-4 w-4 text-gray-400 hover:text-gray-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </button>
              )}

              {/* Search Results Dropdown */}
              {showResults && (
                <SearchResults
                  results={results}
                  isLoading={isLoading}
                  onClose={closeResults}
                  searchQuery={searchQuery}
                />
              )}
            </div>

            {!loading && !user && (
              <div className="flex items-center space-x-4">
                <Link
                  href={getLoginUrl(pathname)}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Sign In
                </Link>
              </div>
            )}

            {!loading && user && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center focus:outline-none"
                  aria-expanded={dropdownOpen}
                  aria-haspopup="true"
                >
                  <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-medium cursor-pointer">
                    {user.email?.substring(0, 2).toUpperCase() || 'ME'}
                  </div>
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10 ring-1 ring-black ring-opacity-5">
                    <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
                      Signed in as<br />
                      <span className="font-medium text-gray-900 truncate block">{user.email}</span>
                    </div>
                    <Link
                      href="/profile"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setDropdownOpen(false)}
                    >
                      Your Profile
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile search bar */}
      {mobileSearchOpen && (
        <div className="md:hidden px-4 py-3 border-t border-gray-200" ref={searchContainerRef}>
          <div className="relative">
            <input
              type="text"
              placeholder="Search the government..."
              className="w-full bg-gray-100 border border-gray-300 rounded-md py-2 px-4 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              value={searchQuery}
              onChange={handleSearchChange}
              aria-label="Search"
              aria-expanded={showResults}
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>

            {/* Clear search button */}
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                aria-label="Clear search"
              >
                <svg className="h-4 w-4 text-gray-400 hover:text-gray-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </button>
            )}

            {/* Search Results Dropdown */}
            {showResults && (
              <SearchResults
                results={results}
                isLoading={isLoading}
                onClose={closeResults}
                searchQuery={searchQuery}
              />
            )}
          </div>
        </div>
      )}

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div id="mobile-menu" className="md:hidden bg-white border-t border-gray-200 px-4 py-3">
          {!loading && !user && (
            <div className="flex flex-col space-y-3">
              <Link
                href={getLoginUrl(pathname)}
                className="text-sm font-medium text-gray-700 hover:text-gray-900 py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </Link>
            </div>
          )}

          {!loading && user && (
            <div className="flex flex-col space-y-3">
              <div className="flex items-center space-x-3 py-2">
                <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-medium">
                  {user.email?.substring(0, 2).toUpperCase() || 'ME'}
                </div>
                <span className="text-sm font-medium text-gray-900 truncate">{user.email}</span>
              </div>
              <Link
                href="/profile"
                className="text-sm font-medium text-gray-700 hover:text-gray-900 py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Your Profile
              </Link>
              <button
                onClick={handleSignOut}
                className="text-sm font-medium text-gray-700 hover:text-gray-900 py-2 text-left"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
