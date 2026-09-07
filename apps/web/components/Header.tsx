'use client';

import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { useState, useRef, useEffect } from 'react';
import SearchResults from './SearchResults';
import useSearch from '../hooks/useSearch';
import { usePathname } from 'next/navigation';
import { getLoginUrl } from '@/utils/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useNavigationMenu } from '../contexts/NavigationContext';
import { Landmark, Menu, Search, X } from 'lucide-react';
import AccountMenu from './AccountMenu';

export default function Header() {
  const { user, loading } = useAuth();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { isMobileNavOpen, setIsMobileNavOpen } = useNavigationMenu();

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

  // Handle keyboard navigation for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Close search results on Escape key
      if (e.key === 'Escape') {
        closeResults();
        if (mobileSearchOpen) {
          setMobileSearchOpen(false);
          searchToggleRef.current?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileSearchOpen, closeResults]);

  useEffect(() => {
    if (mobileSearchOpen) mobileSearchInputRef.current?.focus();
  }, [mobileSearchOpen]);

  return (
    <header className="fixed top-0 left-0 right-0 z-10 border-b border-border bg-background">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-14 md:h-12">
          <div className="flex items-center">
            {/* Hamburger navigation toggle on mobile */}
            <Button
              id="nav-toggle"
              variant="ghost"
              size="icon"
              onClick={() => { setIsMobileNavOpen(!isMobileNavOpen); setMobileSearchOpen(false); }}
              className="md:hidden mr-2"
              aria-label="Toggle navigation menu"
              aria-expanded={isMobileNavOpen}
              aria-controls="mobile-nav"
            >
              <Menu className="h-6 w-6 text-primary" />
            </Button>
            <Link
              href="/"
              className="group inline-flex items-center gap-2 rounded-md py-1 text-foreground transition-colors hover:text-primary"
              aria-label="Go to GovSource home"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center">
                <Landmark className="h-6 w-6 text-foreground" />
              </span>
              <span className="font-serif text-2xl font-semibold tracking-tight">
                GovSource
              </span>
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <Button ref={searchToggleRef} variant="ghost" size="icon" aria-label={mobileSearchOpen ? 'Close search' : 'Open search'} aria-expanded={mobileSearchOpen} aria-controls="mobile-search" onClick={() => { setMobileSearchOpen(!mobileSearchOpen); setIsMobileNavOpen(false); }}>
              {mobileSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </Button>
            {/* Show Sign In or Profile icon on mobile, no hamburger */}
            {!loading && !user && (
              <Link
                href={getLoginUrl(pathname)}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                style={{ minWidth: 64 }}
              >
                Sign In
              </Link>
            )}
            {user && <AccountMenu />}
          </div>

          {/* Desktop search and user menu */}
          <div className="hidden md:flex items-center ml-auto">
            <div className="relative mr-4">
              <Input
                type="text"
                placeholder="Search public records..."
                className="w-72 lg:w-96 rounded-md border-border bg-card py-2 pl-9 pr-10 text-sm shadow-none"
                value={searchQuery}
                onChange={handleSearchChange}
                aria-label="Search"
                aria-expanded={showResults}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>

              {/* Clear search button */}
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearSearch}
                  className="absolute inset-y-0 right-0 flex items-center pr-3"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </Button>
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
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Sign In
                </Link>
              </div>
            )}

            {user && <AccountMenu />}
          </div>
        </div>

        {/* Mobile search */}
        <div id="mobile-search" className={mobileSearchOpen ? "md:hidden pb-3" : "hidden"}>
          <div className="relative">
            <Input
              ref={mobileSearchInputRef}
              type="text"
              placeholder="Search public records..."
              className="w-full rounded-md border-border bg-card py-2 pl-9 pr-10 text-sm shadow-none"
              value={searchQuery}
              onChange={handleSearchChange}
              aria-label="Search"
              aria-expanded={showResults}
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                onClick={clearSearch}
                className="absolute inset-y-0 right-0 flex items-center pr-3"
                aria-label="Clear search"
              >
                <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </Button>
            )}
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
      </div>
    </header>
  );
}
