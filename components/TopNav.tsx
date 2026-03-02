'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigationMenu } from '../contexts/NavigationContext';
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
  ChevronDown,
} from 'lucide-react';
import LoadingIndicator from './ui/LoadingIndicator';

export default function TopNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { isMobileNavOpen, setIsMobileNavOpen } = useNavigationMenu();
  const [watchedItems, setWatchedItems] = useState<Array<{
    id: string;
    type: 'bill' | 'congressman' | 'agency' | 'judge' | 'cluster' | 'agencyDocument';
    title: string | undefined;
    itemId: string | undefined;
    timestamp?: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [desktopWatchingOpen, setDesktopWatchingOpen] = useState(false);
  const desktopWatchingRef = useRef<HTMLDivElement>(null);
  const navItems = [
    { label: 'Home', href: '/', icon: Home, group: 'home' },
    { label: 'Laws', href: '/laws', icon: Gavel, group: 'legislation' },
    { label: 'Bills', href: '/bills', icon: FileText, group: 'legislation' },
    { label: 'Executive Orders', href: '/executive-orders', icon: PenSquare, group: 'legislation' },
    { label: 'Supreme Court Cases', href: '/supreme-court-cases', icon: Scale, group: 'legislation' },
    { label: 'Agency Documents', href: '/agency-rules', icon: ClipboardList, group: 'legislation' },
    { label: 'Congress Members', href: '/congress-members', icon: Users, group: 'bodies' },
    { label: 'Agencies', href: '/agencies', icon: Building, group: 'bodies' },
    { label: 'Supreme Court', href: '/judges', icon: Briefcase, group: 'bodies' },
  ] as const;

  useEffect(() => {
    const fetchWatchedItems = async () => {
      if (!user) {
        setWatchedItems([]);
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

        const formattedBills = bills.map(item => ({
          id: item.id,
          type: 'bill' as const,
          title: `${item.bill?.type.toUpperCase()}. ${item.bill?.number}`,
          itemId: item.bill?.id,
          timestamp: item.created_at
        }));

        const formattedCongressmen = congressmen.map(item => ({
          id: item.id,
          type: 'congressman' as const,
          title: item.congressman?.full_name,
          itemId: item.congressman?.id,
          timestamp: item.created_at
        }));

        const formattedAgencies = agencies.map(item => ({
          id: item.id,
          type: 'agency' as const,
          title: item.agency.name,
          itemId: item.agency.id,
          timestamp: item.created_at
        }));

        const formattedJudges = judges.map(item => ({
          id: item.id,
          type: 'judge' as const,
          title: item.judge.full_name,
          itemId: item.judge.id,
          timestamp: item.created_at
        }));

        const formattedClusters = clusters.map(item => ({
          id: item.id,
          type: 'cluster' as const,
          title: item.cluster.case_name_short || item.cluster.case_name,
          itemId: item.cluster.id,
          timestamp: item.created_at
        }));

        const formattedAgencyDocuments = agencyDocuments.map(item => ({
          id: item.id,
          type: 'agencyDocument' as const,
          title: item.agency_document.title,
          itemId: item.agency_document.id,
          timestamp: item.created_at
        }));

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
        setWatchedItems(combinedItems);
      } catch (error) {
        console.error('Error fetching watched items for top nav:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWatchedItems();
  }, [user]);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname, setIsMobileNavOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const mobileNav = document.getElementById('mobile-nav');
      const toggleButton = document.getElementById('nav-toggle');

      if (
        isMobileNavOpen &&
        mobileNav &&
        !mobileNav.contains(event.target as Node) &&
        toggleButton &&
        !toggleButton.contains(event.target as Node)
      ) {
        setIsMobileNavOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileNavOpen, setIsMobileNavOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (desktopWatchingRef.current && !desktopWatchingRef.current.contains(event.target as Node)) {
        setDesktopWatchingOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const isActive = (path: string) => {
    const isCurrent = path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
    return isCurrent
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground';
  };

  const getWatchedItemHref = (type: string, itemId?: string) => {
    const basePath =
      type === 'bill'
        ? 'bills'
        : type === 'congressman'
          ? 'congress-members'
          : type === 'agency'
            ? 'agencies'
            : type === 'judge'
              ? 'judges'
              : type === 'cluster'
                ? 'supreme-court-cases'
                : 'agency-rules';
    return `/${basePath}/${itemId}`;
  };

  return (
    <>
      <nav className="fixed left-0 right-0 top-16 z-[9] hidden border-b border-border/70 bg-background/95 backdrop-blur md:block">
        <div className="mx-auto grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 py-1 lg:px-6">
          <div className="invisible pointer-events-none">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/80 px-3 py-1.5 text-sm font-medium"
              tabIndex={-1}
              aria-hidden="true"
            >
              Watching
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <div className="min-w-0 overflow-x-auto">
            <div className="mx-auto flex w-max items-center justify-center gap-1 px-1">
              {navItems.map((item, index) => {
                const Icon = item.icon;
                const prevItem = navItems[index - 1];
                const shouldShowDivider = prevItem && prevItem.group !== item.group;
                return (
                  <div key={item.href} className="flex shrink-0 items-center gap-1.5">
                    {shouldShowDivider && <div className="mx-0.5 h-5 w-px bg-border/80" aria-hidden="true" />}
                    <Link
                      href={item.href}
                      className={`inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1.5 text-sm font-medium transition-colors ${isActive(item.href)}`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="whitespace-nowrap">{item.label}</span>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative shrink-0 justify-self-end" ref={desktopWatchingRef}>
            <button
              type="button"
              onClick={() => setDesktopWatchingOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/80 px-3 py-1.5 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent hover:text-foreground"
              aria-expanded={desktopWatchingOpen}
              aria-haspopup="menu"
            >
              Watching
              <ChevronDown className="h-4 w-4" />
            </button>

            {desktopWatchingOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border/80 bg-card/95 p-2 shadow-lg backdrop-blur-sm">
                <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Watched Items
                </div>
                {loading ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">
                    <LoadingIndicator size="small" />
                  </div>
                ) : !user ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">Sign in to see watched items</div>
                ) : watchedItems.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">No watched items yet</div>
                ) : (
                  <ul className="max-h-80 space-y-1 overflow-y-auto">
                    {watchedItems.map((item) => (
                      <li key={`${item.type}-${item.itemId}`}>
                        <Link
                          href={getWatchedItemHref(item.type, item.itemId)}
                          className="block truncate rounded-md px-3 py-2 text-sm text-foreground/90 transition-colors hover:bg-muted"
                        >
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>

      {isMobileNavOpen && (
        <div className="fixed inset-0 top-16 z-20 bg-black/35 md:hidden">
          <aside
            id="mobile-nav"
            className="h-full w-[85%] max-w-xs overflow-y-auto border-r border-border/70 bg-background shadow-xl"
          >
            <div className="p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Navigation</h3>
              <ul className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive(item.href)}`}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="px-4 pb-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Watching</h3>
              {loading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  <LoadingIndicator size="small" />
                </div>
              ) : !user ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Sign in to see watched items</div>
              ) : watchedItems.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">No watched items yet</div>
              ) : (
                <ul className="space-y-1">
                  {watchedItems.map((item) => (
                    <li key={`${item.type}-${item.itemId}`}>
                      <Link
                        href={getWatchedItemHref(item.type, item.itemId)}
                        className="block truncate rounded-md px-3 py-2 text-sm text-foreground/90 transition-colors hover:bg-muted"
                      >
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
