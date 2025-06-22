'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSavedBills, getSavedCongressmen, getSavedAgencies, getSavedJudges, getSavedClusters, getSavedAgencyDocuments } from '../services/api';

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [savedItems, setSavedItems] = useState<Array<{
    id: string;
    type: 'bill' | 'congressman' | 'agency' | 'judge' | 'cluster' | 'agencyDocument';
    title: string | undefined;
    itemId: string | undefined;
    timestamp?: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const fetchSavedItems = async () => {
      if (!user) {
        setSavedItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [bills, congressmen, agencies, judges, clusters, agencyDocuments] = await Promise.all([
          getSavedBills(user.id),
          getSavedCongressmen(user.id),
          getSavedAgencies(user.id),
          getSavedJudges(user.id),
          getSavedClusters(user.id),
          getSavedAgencyDocuments(user.id),
        ]);

        // Format bills
        const formattedBills = bills.map(item => ({
          id: item.id,
          type: 'bill' as const,
          title: `${item.bill?.type.toUpperCase()}. ${item.bill?.number}`,
          itemId: item.bill?.id,
          timestamp: item.created_at
        }));

        // Format congressmen
        const formattedCongressmen = congressmen.map(item => ({
          id: item.id,
          type: 'congressman' as const,
          title: item.congressman?.full_name,
          itemId: item.congressman?.id,
          timestamp: item.created_at
        }));

        // Format agencies
        const formattedAgencies = agencies.map(item => ({
          id: item.id,
          type: 'agency' as const,
          title: item.agency.name,
          itemId: item.agency.id,
          timestamp: item.created_at
        }));

        // Format judges
        const formattedJudges = judges.map(item => ({
          id: item.id,
          type: 'judge' as const,
          title: item.judge.full_name,
          itemId: item.judge.id,
          timestamp: item.created_at
        }));

        // Format court cases (clusters)
        const formattedClusters = clusters.map(item => ({
          id: item.id,
          type: 'cluster' as const,
          title: item.cluster.case_name_short || item.cluster.case_name,
          itemId: item.cluster.id,
          timestamp: item.created_at
        }));

        // Format agency documents
        const formattedAgencyDocuments = agencyDocuments.map(item => ({
          id: item.id,
          type: 'agencyDocument' as const,
          title: item.agency_document.title,
          itemId: item.agency_document.id,
          timestamp: item.created_at
        }));

        // Combine, sort by timestamp (newest first), and limit to 10 items
        const combinedItems = [
          ...formattedBills,
          ...formattedCongressmen,
          ...formattedAgencies,
          ...formattedJudges,
          ...formattedClusters,
          ...formattedAgencyDocuments
        ]
          .sort((a, b) => {
            if (!a.timestamp || !b.timestamp) return 0;
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          })
          .slice(0, 10);
        setSavedItems(combinedItems);
      } catch (error) {
        console.error('Error fetching saved items for sidebar:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSavedItems();
  }, [user]);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Handle clicks outside the sidebar on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const sidebar = document.getElementById('sidebar');
      const toggleButton = document.getElementById('sidebar-toggle');

      if (
        isMobileOpen &&
        sidebar &&
        !sidebar.contains(event.target as Node) &&
        toggleButton &&
        !toggleButton.contains(event.target as Node)
      ) {
        setIsMobileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileOpen]);

  const isActive = (path: string) => {
    return pathname === path ? 'bg-gray-100 text-primary font-medium' : '';
  };

  // Fixed button to toggle sidebar on mobile
  const toggleButton = (
    <button
      id="sidebar-toggle"
      onClick={() => setIsMobileOpen(!isMobileOpen)}
      className="md:hidden fixed bottom-4 right-4 bg-primary text-white rounded-full p-3 shadow-lg z-20"
      aria-label="Toggle sidebar"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );

  return (
    <>
      <aside
        id="sidebar"
        className={`w-64 h-screen bg-white border-r border-gray-200 fixed left-0 top-16 overflow-y-auto transition-transform duration-300 ease-in-out z-10 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-4">
          <div className="mb-6">
            <h3 className="text-xs uppercase font-semibold text-gray-500 mb-3">HOME</h3>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/')}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7m-7-7v14" />
                  </svg>
                  Home
                </Link>
              </li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xs uppercase font-semibold text-gray-500 mb-3">FEDERAL LAWS</h3>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/laws"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/laws')}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                  Laws
                </Link>
              </li>
              <li>
                <Link
                  href="/bills"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/bills')}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Proposed Bills
                </Link>
              </li>
              <li>
                <Link
                  href="/agency-rules"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/agency-rules')}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Agency Rules
                </Link>
              </li>
              <li>
                <Link
                  href="/executive-orders"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/executive-orders')}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Executive Orders
                </Link>
              </li>
              <li>
                <Link
                  href="/supreme-court-cases"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/supreme-court-cases')}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Supreme Court Cases
                </Link>
              </li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xs uppercase font-semibold text-gray-500 mb-3">FEDERAL BODIES</h3>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/congressmen"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/congressmen')}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Congress Members
                </Link>
              </li>
              <li>
                <Link
                  href="/agencies"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/agencies')}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Federal Agencies
                </Link>
              </li>
              <li>
                <Link
                  href="/judges"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/judges')}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  Supreme Court Judges
                </Link>
              </li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xs uppercase font-semibold text-gray-500 mb-3">WATCHING</h3>
            {loading ? (
              <div className="text-sm text-gray-500 px-3 py-2">Loading...</div>
            ) : !user ? (
              <div className="text-sm text-gray-500 px-3 py-2">Sign in to see saved items</div>
            ) : savedItems.length === 0 ? (
              <div className="text-sm text-gray-500 px-3 py-2">No saved items yet</div>
            ) : (
              <ul className="space-y-1">
                {savedItems.map((item) => (
                  <li key={`${item.type}-${item.itemId}`}>
                    <Link
                      href={`/${
                        item.type === 'bill'
                          ? 'bills'
                          : item.type === 'congressman'
                            ? 'congressmen'
                            : item.type === 'agency'
                              ? 'agencies'
                              : item.type === 'judge'
                                ? 'judges'
                                : item.type === 'cluster'
                                  ? 'supreme-court-cases'
                                  : 'agency-rules'
                      }/${item.itemId}`}
                      className="flex items-center px-3 py-2 text-sm hover:bg-gray-100 rounded-md"
                    >
                      {item.type === 'bill' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      ) : item.type === 'congressman' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      ) : item.type === 'agency' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      ) : item.type === 'judge' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      ) : item.type === 'cluster' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
      {toggleButton}
    </>
  );
}
