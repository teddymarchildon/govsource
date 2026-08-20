'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpenText,
  Building2,
  ChevronDown,
  FileText,
  Gavel,
  Landmark,
  PenLine,
  Scale,
  Users,
} from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { useNavigationMenu } from '../contexts/NavigationContext';
import {
  getSavedAgencies,
  getSavedAgencyDocuments,
  getSavedBills,
  getSavedClusters,
  getSavedCongressmen,
  getSavedJudges,
} from '../services/api';
import LoadingIndicator from './ui/LoadingIndicator';

const sectionItems = [
  { href: '/', label: 'Today', paths: ['/', '/briefs'] },
  { href: '/bills', label: 'Congress', paths: ['/bills', '/laws', '/congress-members'] },
  { href: '/executive-orders', label: 'White House', paths: ['/executive-orders'] },
  { href: '/agency-rules', label: 'Agencies', paths: ['/agency-rules', '/agencies'] },
  { href: '/supreme-court-cases', label: 'Courts', paths: ['/supreme-court-cases', '/judges'] },
] as const;

const archiveGroups = [
  {
    label: 'Editorial',
    items: [{ href: '/briefs', icon: BookOpenText, label: 'Briefs' }],
  },
  {
    label: 'Official records',
    items: [
      { href: '/bills', icon: FileText, label: 'Bills' },
      { href: '/laws', icon: Gavel, label: 'Laws' },
      { href: '/executive-orders', icon: PenLine, label: 'Executive Orders' },
      { href: '/agency-rules', icon: Building2, label: 'Agency Documents' },
      { href: '/supreme-court-cases', icon: Scale, label: 'Supreme Court Cases' },
    ],
  },
  {
    label: 'People & institutions',
    items: [
      { href: '/congress-members', icon: Users, label: 'Congress Members' },
      { href: '/agencies', icon: Landmark, label: 'Federal Agencies' },
      { href: '/judges', icon: Scale, label: 'Supreme Court Justices' },
    ],
  },
] as const;

type WatchedItem = {
  id: string;
  type: 'bill' | 'congressman' | 'agency' | 'judge' | 'cluster' | 'agencyDocument';
  title: string | undefined;
  itemId: string | undefined;
  timestamp?: string;
};

export default function TopNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { isMobileNavOpen, setIsMobileNavOpen } = useNavigationMenu();
  const [watchedItems, setWatchedItems] = useState<WatchedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [watchingOpen, setWatchingOpen] = useState(false);
  const desktopMenusRef = useRef<HTMLDivElement>(null);

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

        const combinedItems: WatchedItem[] = [
          ...bills.map((item) => ({ id: item.id, itemId: item.bill?.id, timestamp: item.created_at, title: `${item.bill?.type.toUpperCase()}. ${item.bill?.number}`, type: 'bill' as const })),
          ...congressmen.map((item) => ({ id: item.id, itemId: item.congressman?.id, timestamp: item.created_at, title: item.congressman?.full_name, type: 'congressman' as const })),
          ...agencies.map((item) => ({ id: item.id, itemId: item.agency.id, timestamp: item.created_at, title: item.agency.name, type: 'agency' as const })),
          ...judges.map((item) => ({ id: item.id, itemId: item.judge.id, timestamp: item.created_at, title: item.judge.full_name, type: 'judge' as const })),
          ...clusters.map((item) => ({ id: item.id, itemId: item.cluster.id, timestamp: item.created_at, title: item.cluster.case_name_short || item.cluster.case_name, type: 'cluster' as const })),
          ...agencyDocuments.map((item) => ({ id: item.id, itemId: item.agency_document.id, timestamp: item.created_at, title: item.agency_document.title, type: 'agencyDocument' as const })),
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
    setSourcesOpen(false);
    setWatchingOpen(false);
  }, [pathname, setIsMobileNavOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const mobileNav = document.getElementById('mobile-nav');
      const toggleButton = document.getElementById('nav-toggle');

      if (desktopMenusRef.current && !desktopMenusRef.current.contains(target)) {
        setSourcesOpen(false);
        setWatchingOpen(false);
      }

      if (isMobileNavOpen && mobileNav && !mobileNav.contains(target) && toggleButton && !toggleButton.contains(target)) {
        setIsMobileNavOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileNavOpen, setIsMobileNavOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSourcesOpen(false);
        setWatchingOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const isSectionActive = (paths: readonly string[]) =>
    paths.some((path) => (path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)));

  const getWatchedItemHref = (type: WatchedItem['type'], itemId?: string) => {
    const basePath = type === 'bill' ? 'bills' : type === 'congressman' ? 'congress-members' : type === 'agency' ? 'agencies' : type === 'judge' ? 'judges' : type === 'cluster' ? 'supreme-court-cases' : 'agency-rules';
    return `/${basePath}/${itemId}`;
  };

  const watchingContent = loading ? (
    <div className="px-3 py-3 text-sm text-muted-foreground"><LoadingIndicator size="small" /></div>
  ) : !user ? (
    <div className="px-3 py-3 text-sm text-muted-foreground">Sign in to see watched items</div>
  ) : watchedItems.length === 0 ? (
    <div className="px-3 py-3 text-sm text-muted-foreground">No watched items yet</div>
  ) : (
    <ul className="max-h-80 space-y-1 overflow-y-auto">
      {watchedItems.map((item) => (
        <li key={`${item.type}-${item.itemId}`}>
          <Link href={getWatchedItemHref(item.type, item.itemId)} className="block truncate rounded-md px-3 py-2 text-sm text-foreground/90 transition-colors hover:bg-muted">
            {item.title}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <nav className="fixed left-0 right-0 top-16 z-[9] hidden h-14 border-b border-border/70 bg-card/95 backdrop-blur md:block" aria-label="Primary navigation">
        <div ref={desktopMenusRef} className="container mx-auto grid h-full grid-cols-[1fr_auto_1fr] items-center px-4">
          <div aria-hidden="true" />

          <div className="flex items-center justify-center gap-7 lg:gap-9">
            {sectionItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isSectionActive(item.paths) ? 'page' : undefined}
                className={`relative inline-flex h-14 items-center whitespace-nowrap text-sm font-semibold transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary after:transition-opacity ${isSectionActive(item.paths) ? 'text-primary after:opacity-100' : 'text-muted-foreground after:opacity-0 hover:text-foreground'}`}
              >
                {item.label}
              </Link>
            ))}

            <div className="relative">
              <button
                type="button"
                onClick={() => { setSourcesOpen((open) => !open); setWatchingOpen(false); }}
                className={`inline-flex h-14 items-center gap-1 text-sm font-semibold transition-colors ${sourcesOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                aria-expanded={sourcesOpen}
                aria-haspopup="menu"
              >
                Sources
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${sourcesOpen ? 'rotate-180' : ''}`} />
              </button>

              {sourcesOpen && (
                <div className="absolute left-1/2 mt-2 w-[36rem] -translate-x-1/2 rounded-xl border border-border/80 bg-card/95 p-4 shadow-xl backdrop-blur-sm" role="menu">
                  <div className="grid grid-cols-3 gap-5">
                    {archiveGroups.map((group) => (
                      <div key={group.label}>
                        <p className="mb-2 px-2 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{group.label}</p>
                        <ul className="space-y-1">
                          {group.items.map((item) => {
                            const Icon = item.icon;
                            return (
                              <li key={item.href}>
                                <Link href={item.href} role="menuitem" className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground/90 transition-colors hover:bg-muted hover:text-primary">
                                  <Icon className="h-4 w-4 text-muted-foreground" />
                                  {item.label}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative justify-self-end">
            <button
              type="button"
              onClick={() => { setWatchingOpen((open) => !open); setSourcesOpen(false); }}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-expanded={watchingOpen}
              aria-haspopup="menu"
            >
              Watching
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${watchingOpen ? 'rotate-180' : ''}`} />
            </button>

            {watchingOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border/80 bg-card/95 p-2 shadow-xl backdrop-blur-sm">
                <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Watched Items</div>
                {watchingContent}
              </div>
            )}
          </div>
        </div>
      </nav>

      {isMobileNavOpen && (
        <div className="fixed inset-0 top-16 z-20 bg-black/35 md:hidden">
          <aside id="mobile-nav" className="h-full w-[85%] max-w-xs overflow-y-auto border-r border-border/70 bg-background shadow-xl">
            <div className="p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sections</h2>
              <ul className="space-y-1">
                {sectionItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isSectionActive(item.paths) ? 'page' : undefined}
                      className={`flex rounded-md px-3 py-2 text-sm font-medium transition-colors ${isSectionActive(item.paths) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-border px-4 py-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Browse all sources</h2>
              {archiveGroups.map((group) => (
                <div key={group.label} className="mb-4 last:mb-0">
                  <p className="mb-1 px-3 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground/80">{group.label}</p>
                  <ul className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <li key={item.href}>
                          <Link href={item.href} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground/90 transition-colors hover:bg-muted">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <div className="border-t border-border px-4 py-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Watching</h2>
              {watchingContent}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
