'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { getSavedBills, getSavedCongressmen, getSavedAgencies, getSavedJudges, getSavedClusters, getSavedAgencyDocuments } from '../services/api';
import {
  Home,
  Gavel,
  FileText,
  ClipboardList,
  PenSquare,
  Scale,
  Users,
  Building,
  Briefcase,
  Menu,
} from 'lucide-react';
import LoadingIndicator from './ui/LoadingIndicator';

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { isMobileOpen, setIsMobileOpen } = useSidebar();
  const [savedItems, setSavedItems] = useState<Array<{
    id: string;
    type: 'bill' | 'congressman' | 'agency' | 'judge' | 'cluster' | 'agencyDocument';
    title: string | undefined;
    itemId: string | undefined;
    timestamp?: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

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
                  <Home className="h-5 w-5 mr-2" />
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
                  <Gavel className="h-5 w-5 mr-2" />
                  Laws
                </Link>
              </li>
              <li>
                <Link
                  href="/bills"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/bills')}`}
                >
                  <FileText className="h-5 w-5 mr-2" />
                  Proposed Bills
                </Link>
              </li>
              <li>
                <Link
                  href="/agency-rules"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/agency-rules')}`}
                >
                  <ClipboardList className="h-5 w-5 mr-2" />
                  Agency Rules
                </Link>
              </li>
              <li>
                <Link
                  href="/executive-orders"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/executive-orders')}`}
                >
                  <PenSquare className="h-5 w-5 mr-2" />
                  Executive Orders
                </Link>
              </li>
              <li>
                <Link
                  href="/supreme-court-cases"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/supreme-court-cases')}`}
                >
                  <Scale className="h-5 w-5 mr-2" />
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
                  <Users className="h-5 w-5 mr-2" />
                  Congress Members
                </Link>
              </li>
              <li>
                <Link
                  href="/agencies"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/agencies')}`}
                >
                  <Building className="h-5 w-5 mr-2" />
                  Federal Agencies
                </Link>
              </li>
              <li>
                <Link
                  href="/judges"
                  className={`flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${isActive('/judges')}`}
                >
                  <Briefcase className="h-5 w-5 mr-2" />
                  Supreme Court Judges
                </Link>
              </li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xs uppercase font-semibold text-gray-500 mb-3">WATCHING</h3>
            {loading ? (
              <div className="text-sm text-gray-500 px-3 py-2">
                <LoadingIndicator size="small" />
              </div>
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
                        <FileText className="h-4 w-4 mr-2 text-primary" />
                      ) : item.type === 'congressman' ? (
                        <Users className="h-4 w-4 mr-2 text-red-500" />
                      ) : item.type === 'agency' ? (
                        <Building className="h-4 w-4 mr-2 text-green-500" />
                      ) : item.type === 'judge' ? (
                        <Briefcase className="h-4 w-4 mr-2 text-purple-500" />
                      ) : item.type === 'cluster' ? (
                        <Scale className="h-4 w-4 mr-2 text-yellow-500" />
                      ) : item.type === 'agencyDocument' ? (
                        <ClipboardList className="h-4 w-4 mr-2 text-orange-500" />
                      ) : null}
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
