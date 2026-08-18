'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookOpenText,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  Landmark,
  PenLine,
  Scale,
  Search,
} from 'lucide-react';

import SearchResults from '@/components/SearchResults';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import useSearch from '@/hooks/useSearch';
import { cn } from '@/lib/utils';
import type { AgencyDocument, Bill, Cluster, Law } from '@/types/types';

type PopularItemType = 'bill' | 'law' | 'agency_document' | 'executive_order' | 'cluster';

interface PopularItemDisplayData {
  id: string;
  title?: string;
  law_title?: string;
  type?: string;
  number?: string;
  policy_area?: string;
  introduced_date?: string;
  law_enacted_date?: string;
  signing_date?: string;
  publication_date?: string;
  president?: string;
  abstract?: string;
  case_name?: string;
  case_name_short?: string;
  date_filed?: string;
  most_recent_action?: {
    date?: string;
    text?: string;
  } | null;
}

export type PopularHomepageItem =
  | { id?: string; item_type: 'bill'; data: Bill }
  | { id?: string; item_type: 'law'; data: Law }
  | { id?: string; item_type: 'agency_document' | 'executive_order'; data: AgencyDocument }
  | { id?: string; item_type: 'cluster'; data: Cluster };

interface PublicHomeProps {
  bills: Bill[];
  billsLoading: boolean;
  loginUrl: string;
  popularItems: PopularHomepageItem[];
  popularLoading: boolean;
  recentExecutiveOrders: AgencyDocument[];
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const sourceLinks = [
  {
    description: 'Bills, laws, sponsors, and legislative actions.',
    href: '/bills',
    icon: Landmark,
    label: 'Congress',
  },
  {
    description: 'Executive orders and presidential actions.',
    href: '/executive-orders',
    icon: PenLine,
    label: 'White House',
  },
  {
    description: 'Rules, notices, and federal agency documents.',
    href: '/agency-rules',
    icon: Building2,
    label: 'Agencies',
  },
  {
    description: 'Supreme Court cases, opinions, and justices.',
    href: '/supreme-court-cases',
    icon: Scale,
    label: 'Courts',
  },
] as const;

const helpSteps = [
  {
    icon: Search,
    text: 'Search federal legislation, orders, rules, decisions, agencies, and officials.',
    title: 'Find the record',
  },
  {
    icon: BookOpenText,
    text: 'Read concise explanations, timelines, and related government activity.',
    title: 'Understand what changed',
  },
  {
    icon: FileText,
    text: 'Save records and build a personal view of the policies and institutions you care about.',
    title: 'Follow what matters',
  },
] as const;

function formatDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date);
}

function getPopularItemDetails(item: PopularHomepageItem) {
  const data = item.data as PopularItemDisplayData;
  const detailByType: Record<PopularItemType, { href: string; label: string }> = {
    agency_document: { href: `/agency-rules/${data.id}`, label: 'Agency document' },
    bill: { href: `/bills/${data.id}`, label: 'Bill' },
    cluster: { href: `/supreme-court-cases/${data.id}`, label: 'Court decision' },
    executive_order: { href: `/executive-orders/${data.id}`, label: 'Executive order' },
    law: { href: `/laws/${data.id}`, label: 'Law' },
  };
  const detail = detailByType[item.item_type];
  const title =
    data.law_title || data.title || data.case_name_short || data.case_name || 'Untitled federal record';
  const date =
    data.law_enacted_date ||
    data.signing_date ||
    data.publication_date ||
    data.most_recent_action?.date ||
    data.date_filed ||
    data.introduced_date;
  const context =
    data.most_recent_action?.text ||
    data.abstract ||
    data.policy_area ||
    (data.president ? `Signed by President ${data.president}` : 'View the official record and related activity.');

  return { ...detail, context, date: formatDate(date), title };
}

function SectionHeading({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight text-foreground md:text-4xl">{title}</h2>
      <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
    </div>
  );
}

function HomeSearch() {
  const {
    clearSearch,
    closeResults,
    handleSearchChange,
    isLoading,
    results,
    searchQuery,
    showResults,
  } = useSearch();

  return (
    <div className="relative z-20 mt-8 max-w-2xl">
      <label htmlFor="public-home-search" className="sr-only">
        Search federal public records
      </label>
      <div className="relative rounded-xl border border-border bg-card shadow-[0_14px_40px_-26px_hsl(var(--foreground))]">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
        <Input
          id="public-home-search"
          type="search"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Search a bill, policy, agency, official, or question"
          className="h-14 border-0 bg-transparent pl-12 pr-12 text-base shadow-none focus-visible:ring-2 focus-visible:ring-primary/35"
          aria-expanded={showResults}
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>
      {showResults ? (
        <SearchResults
          results={results}
          isLoading={isLoading}
          onClose={closeResults}
          searchQuery={searchQuery}
        />
      ) : null}
    </div>
  );
}

export default function PublicHome({
  bills,
  billsLoading,
  loginUrl,
  popularItems,
  popularLoading,
  recentExecutiveOrders,
}: PublicHomeProps) {
  const spotlightItems = popularItems.slice(0, 3);
  const radarItems = popularItems.slice(0, 4);

  return (
    <div className="-mx-4 -mb-4 overflow-hidden md:-mx-6 md:-mb-6">
      <section className="relative border-b border-border/80 bg-background">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -right-32 -top-40 h-[32rem] w-[32rem] rounded-full bg-primary/[0.07] blur-3xl" />
          <div className="absolute -left-28 bottom-0 h-64 w-64 rounded-full bg-[hsl(var(--trust)/0.08)] blur-3xl" />
        </div>

        <div className="container relative mx-auto grid gap-12 px-4 py-16 md:py-24 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] lg:items-center lg:gap-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--trust)/0.25)] bg-[hsl(var(--trust)/0.08)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--trust))]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Federal public records, made clear
            </div>
            <h1 className="mt-6 max-w-4xl text-balance font-serif text-5xl font-semibold leading-[1.03] tracking-[-0.035em] text-foreground md:text-6xl lg:text-7xl">
              See what the federal government is doing.{' '}
              <span className="text-primary">Start with the source.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Explore bills, laws, executive orders, agency actions, court decisions, and the people behind them—explained clearly and linked to the official record.
            </p>

            <HomeSearch />

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href="#latest-activity" className={buttonVariants({ size: 'lg' })}>
                Explore latest activity
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
              <Link href="/articles" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
                Read briefings
              </Link>
            </div>
            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
              <span>Official-source links</span>
              <span aria-hidden="true">·</span>
              <span>Plain-language context</span>
              <span aria-hidden="true">·</span>
              <span>Updated continuously</span>
            </p>
          </div>

          <aside className="rounded-2xl border border-border bg-card p-5 shadow-[0_24px_70px_-48px_hsl(var(--foreground))] md:p-7">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Live record</p>
                <h2 className="mt-1 font-serif text-2xl font-semibold">Today in government</h2>
              </div>
              <Clock3 className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="divide-y divide-border">
              {popularLoading ? (
                Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="space-y-2 py-5">
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-5 w-full animate-pulse rounded bg-muted" />
                  </div>
                ))
              ) : spotlightItems.length > 0 ? (
                spotlightItems.map((item) => {
                  const detail = getPopularItemDetails(item);
                  return (
                    <Link key={`${item.item_type}-${item.data.id}`} href={detail.href} className="group block py-5">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        <span className="text-primary">{detail.label}</span>
                        {detail.date ? <span>· {detail.date}</span> : null}
                      </div>
                      <p className="mt-2 line-clamp-2 font-serif text-lg font-semibold leading-6 transition-colors group-hover:text-primary">
                        {detail.title}
                      </p>
                    </Link>
                  );
                })
              ) : (
                <div className="py-8 text-sm leading-6 text-muted-foreground">
                  Browse the latest records from Congress, federal agencies, the White House, and the courts.
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      <section className="border-b border-border bg-card/45 py-16 md:py-20">
        <div className="container mx-auto px-4">
          <SectionHeading
            eyebrow="Curated activity"
            title="On the radar"
            description="Significant and fast-moving activity across Congress, the White House, federal agencies, and the courts."
          />

          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2 xl:grid-cols-4">
            {popularLoading ? (
              Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="min-h-64 space-y-4 bg-card p-6">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-7 w-full animate-pulse rounded bg-muted" />
                  <div className="h-16 w-full animate-pulse rounded bg-muted" />
                </div>
              ))
            ) : radarItems.length > 0 ? (
              radarItems.map((item) => {
                const detail = getPopularItemDetails(item);
                return (
                  <Link
                    key={`${item.item_type}-${item.data.id}`}
                    href={detail.href}
                    className="group flex min-h-64 flex-col bg-card p-6 transition-colors hover:bg-secondary/45"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em]">
                      <span className="text-primary">{detail.label}</span>
                      {detail.date ? <span className="text-muted-foreground">{detail.date}</span> : null}
                    </div>
                    <h3 className="mt-6 line-clamp-4 font-serif text-2xl font-semibold leading-7 transition-colors group-hover:text-primary">
                      {detail.title}
                    </h3>
                    <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{detail.context}</p>
                    <span className="mt-auto flex items-center gap-2 pt-6 text-sm font-semibold text-foreground">
                      View source and details
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                );
              })
            ) : (
              <div className="bg-card p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-4">
                No curated records are available right now.
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="latest-activity" className="scroll-mt-36 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <SectionHeading
            eyebrow="Primary sources"
            title="Latest official actions"
            description="Newly introduced, signed, published, and decided records from across the federal government."
          />

          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-4 md:px-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Landmark className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-serif text-xl font-semibold">From Congress</p>
                    <p className="text-xs text-muted-foreground">Recently introduced legislation</p>
                  </div>
                </div>
                <Link href="/bills" className="text-sm font-semibold text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="divide-y divide-border px-5 md:px-6">
                {billsLoading ? (
                  Array.from({ length: 5 }, (_, index) => <div key={index} className="my-4 h-14 animate-pulse rounded bg-muted" />)
                ) : bills.length > 0 ? (
                  bills.slice(0, 5).map((bill) => (
                    <Link key={bill.id} href={`/bills/${bill.id}`} className="group flex gap-4 py-5">
                      <span className="mt-0.5 min-w-20 text-xs font-semibold uppercase tracking-wide text-primary">
                        {bill.type}. {bill.number}
                      </span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 font-medium leading-6 transition-colors group-hover:text-primary">{bill.title}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {formatDate(bill.introduced_date) ? `Introduced ${formatDate(bill.introduced_date)}` : 'View legislative record'}
                        </span>
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="py-8 text-sm text-muted-foreground">No recent legislation is available.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-4 md:px-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--trust)/0.1)] text-[hsl(var(--trust))]">
                    <PenLine className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-serif text-xl font-semibold">From the White House</p>
                    <p className="text-xs text-muted-foreground">Recently signed executive orders</p>
                  </div>
                </div>
                <Link href="/executive-orders" className="text-sm font-semibold text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="divide-y divide-border px-5 md:px-6">
                {recentExecutiveOrders.length > 0 ? (
                  recentExecutiveOrders.slice(0, 5).map((order) => (
                    <Link key={order.id} href={`/executive-orders/${order.id}`} className="group block py-5">
                      <span className="line-clamp-2 font-medium leading-6 transition-colors group-hover:text-primary">{order.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatDate(order.signing_date) ? `Signed ${formatDate(order.signing_date)}` : 'View executive order'}
                        {order.president ? ` · President ${order.president}` : ''}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="py-8 text-sm text-muted-foreground">No recent executive orders are available.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {sourceLinks.map(({ description, href, icon: Icon, label }) => (
              <Link key={href} href={href} className="group rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 font-serif text-xl font-semibold">{label}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  Browse records <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-[hsl(var(--ink))] py-16 text-[hsl(var(--ink-foreground))] md:py-20">
        <div className="container mx-auto px-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--highlight))]">How GovSource helps</p>
          <h2 className="mt-3 max-w-2xl font-serif text-3xl font-semibold md:text-4xl">From official record to useful context</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {helpSteps.map(({ icon: Icon, text, title }, index) => (
              <div key={title} className="border-t border-white/20 pt-6">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-[hsl(var(--highlight))]">0{index + 1}</span>
                  <Icon className="h-5 w-5 text-[hsl(var(--highlight))]" />
                </div>
                <h3 className="mt-5 font-serif text-2xl font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/70">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-10 md:px-12 md:py-14">
            <div className="absolute bottom-0 right-0 h-48 w-48 translate-x-1/3 translate-y-1/3 rounded-full bg-primary/10 blur-2xl" aria-hidden="true" />
            <div className="relative max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--trust))]">Personalize your view</p>
              <h2 className="mt-3 font-serif text-3xl font-semibold md:text-4xl">Make GovSource yours</h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Follow policies, officials, agencies, and cases you care about. Your saved sources and updates stay together in one place.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Link href={loginUrl} className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}>
                  Create your watchlist
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href={loginUrl} className="text-sm font-semibold text-primary hover:underline">
                  Already have an account? Sign in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
