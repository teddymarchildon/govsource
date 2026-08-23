'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookOpenText,
  Building2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Landmark,
  PenLine,
  Scale,
  Sparkles,
  Tags,
} from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Brief } from '@/types/brief';
import type { AgencyDocument, Bill } from '@/types/types';
import type { PersonalizedHomepageItem, PopularHomepageItem } from '@/types/homepage';
import type { Topic } from '@/types/topic';
import { getContentTypeLabel } from '@/utils/contentReferences';
import { briefBelongsToSection } from '@/utils/briefSections';

type PopularItemType = 'bill' | 'law' | 'agency_document' | 'executive_order' | 'cluster';

interface PopularItemDisplayData {
  id: string;
  title?: string;
  law_title?: string;
  policy_area?: string;
  introduced_date?: string;
  law_enacted_date?: string;
  signing_date?: string;
  publication_date?: string;
  abstract?: string;
  case_name?: string;
  case_name_short?: string;
  date_filed?: string;
  most_recent_action?: { date?: string; text?: string } | null;
}

interface PublicHomeProps {
  briefs: Brief[];
  briefsLoading: boolean;
  bills: Bill[];
  billsLoading: boolean;
  isSignedIn: boolean;
  loginUrl: string;
  personalizedItems: PersonalizedHomepageItem[];
  personalizedLoading: boolean;
  policyAreas: string[];
  popularItems: PopularHomepageItem[];
  popularLoading: boolean;
  recentExecutiveOrders: AgencyDocument[];
  topics: Topic[];
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const sourceLinks = [
  { description: 'Bills, laws, sponsors, and every legislative action.', href: '/congress', icon: Landmark, label: 'Congress' },
  { description: 'Executive orders and presidential actions.', href: '/white-house', icon: PenLine, label: 'White House' },
  { description: 'Rules, notices, and federal agency documents.', href: '/agencies', icon: Building2, label: 'Agencies' },
  { description: 'Supreme Court cases, opinions, and justices.', href: '/courts', icon: Scale, label: 'Courts' },
] as const;

const briefLanes = [
  { label: 'Congress', section: 'congress' },
  { label: 'White House', section: 'white-house' },
  { label: 'Agencies', section: 'agencies' },
  { label: 'Courts', section: 'courts' },
] as const;

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date);
}

function getBriefSourceCount(brief: Brief) {
  return Math.max(1, 1 + (brief.related_items?.length ?? 0) + brief.sources.length);
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
  const title = data.law_title || data.title || data.case_name_short || data.case_name || 'Untitled federal record';
  const date = data.law_enacted_date || data.signing_date || data.publication_date || data.most_recent_action?.date || data.date_filed || data.introduced_date;
  const context = data.most_recent_action?.text || data.abstract || data.policy_area || 'Open the source record to review the official text and related activity.';

  return { ...detail, context, date: formatDate(date), title };
}

function StoryMeta({ brief }: { brief: Brief }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      <span className="text-primary">{getContentTypeLabel(brief.primary_item_type)}</span>
      {formatDate(brief.published_at) ? <span>{formatDate(brief.published_at)}</span> : null}
    </div>
  );
}

function StoryRow({ brief }: { brief: Brief }) {
  return (
    <Link href={`/briefs/${brief.slug}`} className="group block border-t border-border py-5 first:border-t-0 first:pt-0 last:pb-0">
      <StoryMeta brief={brief} />
      <h3 className="mt-2 font-serif text-xl font-semibold leading-6 transition-colors group-hover:text-primary">
        {brief.title}
      </h3>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
        {brief.dek}
      </p>
    </Link>
  );
}

function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6 border-b-2 border-foreground pb-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h2 className="mt-2 font-serif text-3xl font-semibold leading-tight md:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export default function PublicHome({
  briefs,
  briefsLoading,
  bills,
  billsLoading,
  isSignedIn,
  loginUrl,
  personalizedItems,
  personalizedLoading,
  policyAreas,
  popularItems,
  popularLoading,
  recentExecutiveOrders,
  topics,
}: PublicHomeProps) {
  const activeFeatured = briefs.find((brief) => brief.is_featured && (!brief.featured_until || new Date(brief.featured_until) > new Date()));
  const leadBrief = activeFeatured || briefs[0];
  const remainingBriefs = briefs.filter((brief) => brief.id !== leadBrief?.id);
  const latestBriefs = remainingBriefs.slice(0, 4);
  const moreBriefs = remainingBriefs.slice(4, 10);

  return (
    <div className="-mx-4 -mb-4 overflow-hidden md:-mx-6 md:-mb-6">
      <section className="border-b border-border bg-background py-10 md:py-14">
        <div className="container mx-auto px-4">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--trust))]">
              <CheckCircle2 className="h-4 w-4" />
              Briefs grounded in official records
            </div>
            <p className="text-xs font-medium text-muted-foreground" suppressHydrationWarning>
              {new Intl.DateTimeFormat('en-US', { dateStyle: 'full' }).format(new Date())}
            </p>
          </div>

          {briefsLoading ? (
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
              <div className="space-y-5">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-24 max-w-3xl animate-pulse rounded bg-muted" />
                <div className="h-48 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-96 animate-pulse rounded bg-muted" />
            </div>
          ) : leadBrief ? (
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)] lg:gap-12">
              <article className="lg:border-r lg:border-border lg:pr-12">
                <StoryMeta brief={leadBrief} />
                <Link href={`/briefs/${leadBrief.slug}`} className="group block">
                  <h1 className="mt-5 max-w-4xl text-balance font-serif text-4xl font-semibold leading-[1.04] tracking-[-0.035em] transition-colors group-hover:text-primary md:text-6xl">
                    {leadBrief.title}
                  </h1>
                  <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
                    {leadBrief.dek}
                  </p>
                </Link>

                <div className="mt-8 border-y border-border bg-card/70 px-5 py-5 md:px-6">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em]">
                      <BookOpenText className="h-4 w-4 text-primary" />
                      What to know
                    </h2>
                    <span className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground sm:flex">
                      <FileCheck2 className="h-3.5 w-3.5 text-[hsl(var(--trust))]" />
                      {getBriefSourceCount(leadBrief)} official {getBriefSourceCount(leadBrief) === 1 ? 'source' : 'sources'}
                    </span>
                  </div>
                  <ol className="mt-4 grid gap-4 md:grid-cols-3">
                    {leadBrief.points.slice(0, 3).map((point, index) => (
                      <li key={point.id} className="flex gap-3 text-sm leading-6">
                        <span className="font-mono text-xs font-bold text-primary">0{index + 1}</span>
                        <span>{point.text}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <Link href={`/briefs/${leadBrief.slug}`} className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}>
                    Read the Brief <ArrowRight className="h-4 w-4" />
                  </Link>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" /> Source-linked government context
                  </span>
                </div>
              </article>

              <aside>
                <div className="mb-5 flex items-center justify-between border-b-2 border-foreground pb-3">
                  <h2 className="font-serif text-2xl font-semibold">Latest</h2>
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                </div>
                {latestBriefs.length > 0 ? (
                  latestBriefs.map((brief) => <StoryRow key={brief.id} brief={brief} />)
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">More source-grounded Briefs will appear here as they are published.</p>
                )}
              </aside>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.75fr)]">
              <div className="border-r-0 border-border lg:border-r lg:pr-10">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Today in government</p>
                <h1 className="mt-4 max-w-3xl font-serif text-4xl font-semibold leading-tight md:text-6xl">The official record, made readable.</h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Published Briefs will lead this page. Until then, explore the latest verified activity from Congress, agencies, the White House, and the courts.</p>
                <Link href="/briefs" className={cn(buttonVariants({ size: 'lg' }), 'mt-7')}>Browse Briefs</Link>
              </div>
              <div className="space-y-4">
                {popularLoading ? <div className="h-56 animate-pulse rounded bg-muted" /> : popularItems.slice(0, 3).map((item) => {
                  const detail = getPopularItemDetails(item);
                  return (
                    <Link key={`${item.item_type}-${item.data.id}`} href={detail.href} className="group block border-b border-border pb-4 last:border-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{detail.label}</p>
                      <h2 className="mt-2 font-serif text-xl font-semibold group-hover:text-primary">{detail.title}</h2>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {isSignedIn ? (
        <section className="border-b border-border bg-[hsl(var(--ink))] py-10 text-[hsl(var(--ink-foreground))]">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--highlight))]">For you</p>
                <h2 className="mt-2 font-serif text-3xl font-semibold">Your policy briefing</h2>
                <p className="mt-2 text-sm text-white/65">
                  {policyAreas.length > 0 ? `Recent activity across ${policyAreas.slice(0, 3).join(', ')}${policyAreas.length > 3 ? ` and ${policyAreas.length - 3} more` : ''}.` : 'Choose policy areas to shape this section.'}
                </p>
              </div>
              <Link href="/profile" className="text-sm font-semibold text-[hsl(var(--highlight))] hover:underline">Manage interests</Link>
            </div>

            <div className="mt-7 grid gap-px overflow-hidden border border-white/15 bg-white/15 md:grid-cols-3">
              {personalizedLoading ? Array.from({ length: 3 }, (_, index) => <div key={index} className="h-40 animate-pulse bg-white/5" />) : personalizedItems.length > 0 ? personalizedItems.slice(0, 3).map((item) => {
                const href = item.item_type === 'law' ? `/laws/${item.data.id}` : `/bills/${item.data.id}`;
                const title = item.item_type === 'law' && 'law_title' in item.data && item.data.law_title ? item.data.law_title : item.data.title;
                return (
                  <Link key={`${item.item_type}-${item.data.id}`} href={href} className="group bg-[hsl(var(--ink))] p-5 transition-colors hover:bg-white/5">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--highlight))]">{item.data.policy_area || (item.item_type === 'law' ? 'Law' : 'Bill')}</p>
                    <h3 className="mt-3 line-clamp-3 font-serif text-xl font-semibold leading-6 group-hover:text-[hsl(var(--highlight))]">{title}</h3>
                    <p className="mt-4 line-clamp-2 text-sm leading-6 text-white/60">{item.data.most_recent_action?.text || 'Review the latest source record and legislative activity.'}</p>
                  </Link>
                );
              }) : (
                <div className="bg-[hsl(var(--ink))] p-6 md:col-span-3">
                  <p className="text-sm text-white/70">Select policy areas in your profile to receive a personalized source feed here.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {moreBriefs.length > 0 ? (
        <section className="border-b border-border bg-card/40 py-14 md:py-20">
          <div className="container mx-auto px-4">
            <SectionHeading eyebrow="More to know" title="The latest Briefs" action={<Link href="/briefs" className="hidden text-sm font-semibold text-primary hover:underline sm:block">View all Briefs</Link>} />
            <div className="mt-8 grid gap-x-8 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
              {moreBriefs.map((brief) => (
                <article key={brief.id} className="group border-t border-border pt-5">
                  <StoryMeta brief={brief} />
                  <Link href={`/briefs/${brief.slug}`}>
                    <h3 className="mt-3 font-serif text-2xl font-semibold leading-7 transition-colors group-hover:text-primary">{brief.title}</h3>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{brief.dek}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">Read Brief <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {briefs.length > 1 ? (
        <section className="border-b border-border py-14 md:py-20">
          <div className="container mx-auto px-4">
            <SectionHeading eyebrow="By institution" title="Follow the federal government" />
            <div className="mt-9 grid gap-8 lg:grid-cols-2">
              {briefLanes.map((lane) => {
                const laneBriefs = briefs.filter((brief) => briefBelongsToSection(brief, lane.section)).slice(0, 3);
                if (laneBriefs.length === 0) return null;
                return (
                  <div key={lane.label} className="border-t-4 border-foreground pt-4">
                    <div className="mb-5 flex items-center justify-between">
                      <h3 className="font-serif text-2xl font-semibold">{lane.label}</h3>
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Source-linked</span>
                    </div>
                    {laneBriefs.map((brief) => <StoryRow key={brief.id} brief={brief} />)}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {topics.length > 0 ? (
        <section className="border-b border-border bg-background py-14 md:py-20">
          <div className="container mx-auto px-4">
            <SectionHeading
              eyebrow="Across government"
              title="Explore by topic"
              action={(
                <Link href="/topics" className="hidden items-center gap-2 text-sm font-semibold text-primary hover:underline sm:inline-flex">
                  View all topics <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            />
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              Follow one policy area across Congress, the White House, federal agencies, and the courts.
            </p>

            <div className="mt-8 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {topics.map((topic) => (
                <Link
                  key={topic.id}
                  href={`/topics/${topic.slug}`}
                  className="group flex min-h-28 items-start gap-3 bg-card px-5 py-5 transition-colors hover:bg-secondary/55"
                >
                  <Tags className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block font-serif text-lg font-semibold leading-6 transition-colors group-hover:text-primary">{topic.name}</span>
                    <span className="mt-1.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">{topic.description}</span>
                  </span>
                  <ArrowRight className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </Link>
              ))}
            </div>

            <Link href="/topics" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline sm:hidden">
              View all topics <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      ) : null}

      <section className="border-b border-border bg-card/45 py-14 md:py-20">
        <div className="container mx-auto px-4">
          <SectionHeading eyebrow="The evidence layer" title="Go directly to the source" action={<span className="hidden items-center gap-2 text-xs font-medium text-muted-foreground md:flex"><FileCheck2 className="h-4 w-4 text-[hsl(var(--trust))]" /> Official records</span>} />

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div className="border-t border-border">
              <div className="flex items-center justify-between py-4">
                <h3 className="font-serif text-xl font-semibold">Latest from Congress</h3>
                <Link href="/bills" className="text-sm font-semibold text-primary hover:underline">View all</Link>
              </div>
              <div className="divide-y divide-border">
                {billsLoading ? Array.from({ length: 4 }, (_, index) => <div key={index} className="my-4 h-12 animate-pulse rounded bg-muted" />) : bills.slice(0, 4).map((bill) => (
                  <Link key={bill.id} href={`/bills/${bill.id}`} className="group grid grid-cols-[78px_1fr] gap-4 py-4">
                    <span className="text-xs font-bold uppercase tracking-wide text-primary">{bill.type}. {bill.number}</span>
                    <span>
                      <span className="line-clamp-2 text-sm font-medium leading-5 group-hover:text-primary">{bill.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{formatDate(bill.introduced_date) || 'Official legislative record'}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="border-t border-border">
              <div className="flex items-center justify-between py-4">
                <h3 className="font-serif text-xl font-semibold">Latest from the White House</h3>
                <Link href="/executive-orders" className="text-sm font-semibold text-primary hover:underline">View all</Link>
              </div>
              <div className="divide-y divide-border">
                {recentExecutiveOrders.slice(0, 4).map((order) => (
                  <Link key={order.id} href={`/executive-orders/${order.id}`} className="group block py-4">
                    <span className="line-clamp-2 text-sm font-medium leading-5 group-hover:text-primary">{order.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{formatDate(order.signing_date) || 'Official executive record'}{order.president ? ` · President ${order.president}` : ''}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
            {sourceLinks.map(({ description, href, icon: Icon, label }) => (
              <Link key={href} href={href} className="group bg-card p-5 transition-colors hover:bg-secondary/55">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 font-serif text-xl font-semibold">{label}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">Browse records <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {!isSignedIn ? (
        <section className="py-14 md:py-20">
          <div className="container mx-auto px-4">
            <div className="grid gap-6 border-y border-border py-10 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--trust))]">Make it yours</p>
                <h2 className="mt-2 font-serif text-3xl font-semibold">Follow the policies and institutions that matter to you.</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">Sign in to add a personal policy briefing without losing the same editorial front page.</p>
              </div>
              <Link href={loginUrl} className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}>Create your briefing <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
