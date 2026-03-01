'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

type SearchResultItem = {
  bill_unique_id?: string;
  chamber?: string;
  id: string | number;
  displayText: string;
  url: string;
  type: string;
};

type SearchResultsProps = {
  results: {
    bills: SearchResultItem[];
    congressmen: SearchResultItem[];
    agencies: SearchResultItem[];
    cases: SearchResultItem[];
    judges: SearchResultItem[];
    agencyDocuments: SearchResultItem[];
  };
  isLoading: boolean;
  onClose: () => void;
  searchQuery: string;
};

export default function SearchResults({ results, isLoading, onClose, searchQuery }: SearchResultsProps) {
  const resultsRef = useRef<HTMLDivElement>(null);

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Get total count of results
  const totalResults =
    results.bills.length +
    results.congressmen.length +
    results.agencies.length +
    results.cases.length +
    results.judges.length +
    results.agencyDocuments.length;

  if (searchQuery.trim() === '') {
    return null;
  }

  return (
    <div
      ref={resultsRef}
      className="absolute top-full left-0 right-0 mt-1 bg-white rounded-md shadow-lg z-20 max-h-[80vh] overflow-y-auto w-full md:w-[350px]"
    >
      {isLoading ? (
        <div className="p-4 text-center">
          <div className="animate-pulse flex justify-center">
            <div className="h-4 w-4 bg-blue-400 rounded-full mr-1"></div>
            <div className="h-4 w-4 bg-blue-500 rounded-full mr-1 animate-pulse-delay-200"></div>
            <div className="h-4 w-4 bg-blue-600 rounded-full animate-pulse-delay-400"></div>
          </div>
          <p className="text-sm text-gray-500 mt-2">Searching...</p>
        </div>
      ) : totalResults === 0 ? (
        <div className="p-4 text-center">
          <p className="text-sm text-gray-500">No results found for &quot;{searchQuery}&quot;</p>
        </div>
      ) : (
        <div>
          {/* Results header */}
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-xs text-gray-500">
              {totalResults} result{totalResults !== 1 ? 's' : ''} for &quot;{searchQuery}&quot;
            </p>
          </div>

          {/* Bills section */}
          {results.bills.length > 0 && (
            <div className="border-b border-gray-100">
              <div className="px-4 py-2 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-700">Bills</h3>
              </div>
              <ul>
                {results.bills.map((bill) => (
                  <li key={`bill-${bill.id}`}>
                    <Link
                      href={bill.url}
                      className="block px-4 py-2 hover:bg-gray-50 text-sm"
                      onClick={onClose}
                    >
                      <div className="flex items-center">
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded mr-2">
                          {bill.bill_unique_id || `Bill ${bill.id}`}
                        </span>
                        <span className="truncate">{bill.displayText}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Congress members section */}
          {results.congressmen.length > 0 && (
            <div className="border-b border-gray-100">
              <div className="px-4 py-2 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-700">Congress Members</h3>
              </div>
              <ul>
                {results.congressmen.map((congressman) => (
                  <li key={`congressman-${congressman.id}`}>
                    <Link
                      href={congressman.url}
                      className="block px-4 py-2 hover:bg-gray-50 text-sm"
                      onClick={onClose}
                    >
                      <div className="flex items-center">
                        <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded mr-2">
                          {congressman.chamber}
                        </span>
                        <span className="truncate">{congressman.displayText}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Agencies section */}
          {results.agencies.length > 0 && (
            <div className="border-b border-gray-100">
              <div className="px-4 py-2 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-700">Agencies</h3>
              </div>
              <ul>
                {results.agencies.map((agency) => (
                  <li key={`agency-${agency.id}`}>
                    <Link
                      href={agency.url}
                      className="block px-4 py-2 hover:bg-gray-50 text-sm"
                      onClick={onClose}
                    >
                      <div className="flex items-center">
                        <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-800 rounded mr-2">
                          Agency
                        </span>
                        <span className="truncate">{agency.displayText}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Court Cases section */}
          {results.cases.length > 0 && (
            <div className="border-b border-gray-100">
              <div className="px-4 py-2 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-700">Court Cases</h3>
              </div>
              <ul>
                {results.cases.map((courtCase) => (
                  <li key={`case-${courtCase.id}`}>
                    <Link
                      href={courtCase.url}
                      className="block px-4 py-2 hover:bg-gray-50 text-sm"
                      onClick={onClose}
                    >
                      <div className="flex items-center">
                        <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-800 rounded mr-2">
                          Case
                        </span>
                        <span className="truncate">{courtCase.displayText}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Judges section */}
          {results.judges.length > 0 && (
            <div className="border-b border-gray-100">
              <div className="px-4 py-2 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-700">Judges</h3>
              </div>
              <ul>
                {results.judges.map((judge) => (
                  <li key={`judge-${judge.id}`}>
                    <Link
                      href={judge.url}
                      className="block px-4 py-2 hover:bg-gray-50 text-sm"
                      onClick={onClose}
                    >
                      <div className="flex items-center">
                        <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded mr-2">
                          Judge
                        </span>
                        <span className="truncate">{judge.displayText}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Agency Documents section */}
          {results.agencyDocuments.length > 0 && (
            <div className="border-b border-gray-100">
              <div className="px-4 py-2 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-700">Agency Rules</h3>
              </div>
              <ul>
                {results.agencyDocuments.map((doc) => (
                  <li key={`doc-${doc.id}`}>
                    <Link
                      href={doc.url}
                      className="block px-4 py-2 hover:bg-gray-50 text-sm"
                      onClick={onClose}
                    >
                      <div className="flex items-center">
                        <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded mr-2">
                          {doc.type || 'Rule'}
                        </span>
                        <span className="truncate">{doc.displayText}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
