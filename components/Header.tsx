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
import { useSidebar } from '../contexts/SidebarContext';
import { Landmark, Menu } from 'lucide-react';

export default function Header() {
  const { user, signOut, loading } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { isMobileOpen, setIsMobileOpen } = useSidebar();

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
      setMobileDropdownOpen(false);
      setMobileMenuOpen(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Close desktop dropdown
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
      }
      
      // Close mobile dropdown
      if (mobileDropdownRef.current && !mobileDropdownRef.current.contains(target)) {
        setMobileDropdownOpen(false);
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
    <header className="fixed top-0 left-0 right-0 z-10 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="w-full pl-6 pr-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            {/* Hamburger sidebar toggle on mobile using shadcn Button */}
            <Button
              id="sidebar-toggle"
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="md:hidden mr-2"
              aria-label="Toggle sidebar"
            >
              <Menu className="h-6 w-6 text-primary" />
            </Button>
            <Link
              href="/"
              className="group inline-flex items-center gap-2 rounded-md py-1 text-primary transition-colors hover:text-primary/90"
              aria-label="Go to GovSource home"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/20">
                <Landmark className="h-4 w-4 text-primary" />
              </span>
              <span className="text-xl font-semibold tracking-tight">
                Gov<span className="font-bold">Source</span>
              </span>
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
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
            {!loading && user && (
              <div className="relative" ref={mobileDropdownRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileDropdownOpen(!mobileDropdownOpen)}
                  className="flex items-center focus:outline-none"
                  aria-expanded={mobileDropdownOpen}
                  aria-haspopup="true"
                >
                  <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-primary text-sm font-medium text-white shadow-sm">
                    {user.email?.substring(0, 2).toUpperCase() || 'ME'}
                  </div>
                </Button>
                {mobileDropdownOpen && (
                  <div className="absolute right-0 z-10 mt-2 w-48 rounded-lg border border-border/80 bg-card/95 py-1 shadow-lg backdrop-blur-sm">
                    <div className="border-b border-border/70 px-4 py-2 text-xs text-muted-foreground">
                      Signed in as<br />
                      <span className="block truncate font-medium text-foreground">{user.email}</span>
                    </div>
                    <Link
                      href="/profile"
                      className="block px-4 py-2 text-sm text-foreground/90 hover:bg-accent"
                      onClick={() => setMobileDropdownOpen(false)}
                    >
                      Your Profile
                    </Link>
                    <Button
                      variant="ghost"
                      className="block w-full px-4 py-2 text-left text-sm font-normal text-foreground/90 hover:bg-accent"
                      onClick={handleSignOut}
                    >
                      Sign Out
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Desktop search and user menu */}
          <div className="hidden md:flex items-center ml-auto">
            <div className="relative mr-4" ref={searchContainerRef}>
              <Input
                type="text"
                placeholder="Search the government..."
                className="w-64 rounded-full border-border/80 bg-background/90 py-2 pl-10 pr-4 text-sm shadow-sm"
                value={searchQuery}
                onChange={handleSearchChange}
                aria-label="Search"
                aria-expanded={showResults}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
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
                  <svg className="h-4 w-4 text-muted-foreground transition-colors hover:text-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
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

            {!loading && user && (
              <div className="relative" ref={dropdownRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center focus:outline-none"
                  aria-expanded={dropdownOpen}
                  aria-haspopup="true"
                >
                  <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-primary text-sm font-medium text-white shadow-sm">
                    {user.email?.substring(0, 2).toUpperCase() || 'ME'}
                  </div>
                </Button>

                {dropdownOpen && (
                  <div className="absolute right-0 z-10 mt-2 w-48 rounded-lg border border-border/80 bg-card/95 py-1 shadow-lg backdrop-blur-sm">
                    <div className="border-b border-border/70 px-4 py-2 text-xs text-muted-foreground">
                      Signed in as<br />
                      <span className="block truncate font-medium text-foreground">{user.email}</span>
                    </div>
                    <Link
                      href="/profile"
                      className="block px-4 py-2 text-sm text-foreground/90 hover:bg-accent"
                      onClick={() => setDropdownOpen(false)}
                    >
                      Your Profile
                    </Link>
                    <Button
                      variant="ghost"
                      className="block w-full px-4 py-2 text-left text-sm font-normal text-foreground/90 hover:bg-accent"
                      onClick={handleSignOut}
                    >
                      Sign Out
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile search */}
        <div className="md:hidden pb-3">
          <div className="relative" ref={searchContainerRef}>
            <Input
              type="text"
              placeholder="Search the government..."
              className="w-full rounded-full border-border/80 bg-background/90 py-2 pl-10 pr-4 text-sm shadow-sm"
              value={searchQuery}
              onChange={handleSearchChange}
              aria-label="Search"
              aria-expanded={showResults}
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                onClick={clearSearch}
                className="absolute inset-y-0 right-0 flex items-center pr-3"
                aria-label="Clear search"
              >
                <svg className="h-4 w-4 text-muted-foreground transition-colors hover:text-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
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
