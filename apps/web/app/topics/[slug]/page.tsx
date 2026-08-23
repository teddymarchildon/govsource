import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Building2,
  CheckCircle2,
  FileCheck2,
  Gavel,
  Landmark,
  PenLine,
  Scale,
} from 'lucide-react';

import AgencyRuleCard from '@/components/AgencyRuleCard';
import BillCard from '@/components/BillCard';
import CourtCaseCard from '@/components/CourtCaseCard';
import ExecutiveOrderCard from '@/components/ExecutiveOrderCard';
import LawCard from '@/components/LawCard';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getTopicPageData } from '@/lib/repositories/topics';
import type { Brief } from '@/types/brief';
import type { TopicPageData, TopicRecord } from '@/types/topic';
import { getContentTypeLabel } from '@/utils/contentReferences';
import { formatDate } from '@/utils/utils';

export const dynamic = 'force-dynamic';

type TopicPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: TopicPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTopicPageData(slug);
  if (!data) return { title: 'Policy topic not found' };

  return {
    title: data.topic.seo_title,
    description: data.topic.seo_description,
    alternates: { canonical: `/topics/${data.topic.slug}` },
    openGraph: {
      title: data.topic.seo_title,
      description: data.topic.seo_description,
      url: `/topics/${data.topic.slug}`,
      type: 'website',
    },
  };
}

function BriefMeta({ brief }: { brief: Brief }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      <span className="text-primary">{getContentTypeLabel(brief.primary_item_type)}</span>
      {brief.published_at ? <><span aria-hidden="true">·</span><span>{formatDate(brief.published_at)}</span></> : null}
    </div>
  );
}

function LeadBrief({ brief }: { brief: Brief }) {
  return (
    <article className="border-y border-border bg-card/70 px-5 py-7 md:px-8 md:py-9">
      <BriefMeta brief={brief} />
      <Link href={`/briefs/${brief.slug}`} className="group block">
        <h2 className="mt-4 text-balance font-serif text-3xl font-semibold leading-tight tracking-[-0.02em] transition-colors group-hover:text-primary md:text-5xl">
          {brief.title}
        </h2>
        {brief.dek ? <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg">{brief.dek}</p> : null}
      </Link>

      {brief.points.length > 0 ? (
        <ol className="mt-7 grid gap-4 border-t border-border pt-6 md:grid-cols-3">
          {brief.points.slice(0, 3).map((point, index) => (
            <li key={point.id} className="flex gap-3 text-sm leading-6">
              <span className="font-mono text-xs font-bold text-primary">0{index + 1}</span>
              <span>{point.text}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <Link href={`/briefs/${brief.slug}`} className={cn(buttonVariants(), 'mt-7 gap-2')}>
        Read the Brief <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}

function SecondaryBrief({ brief }: { brief: Brief }) {
  return (
    <article className="group border-t border-border pt-5">
      <BriefMeta brief={brief} />
      <Link href={`/briefs/${brief.slug}`}>
        <h3 className="mt-3 font-serif text-2xl font-semibold leading-7 transition-colors group-hover:text-primary">{brief.title}</h3>
        {brief.dek ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{brief.dek}</p> : null}
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
          Read Brief <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
      </Link>
    </article>
  );
}

function RecordCard({ record }: { record: TopicRecord }) {
  switch (record.type) {
    case 'bill':
      return <BillCard bill={record.data} />;
    case 'law':
      return <LawCard law={record.data} />;
    case 'executive_order':
      return <ExecutiveOrderCard order={record.data} />;
    case 'agency_document':
      return <AgencyRuleCard rule={record.data} />;
    case 'cluster':
      return <CourtCaseCard cluster={record.data} />;
  }
}

const countItems = [
  { key: 'briefs', label: 'Briefs', icon: BookOpenText },
  { key: 'bills', label: 'Bills', icon: Landmark },
  { key: 'laws', label: 'Laws', icon: Gavel },
  { key: 'executiveOrders', label: 'Executive orders', icon: PenLine },
  { key: 'agencyDocuments', label: 'Agency documents', icon: Building2 },
  { key: 'courtCases', label: 'Court decisions', icon: Scale },
] as const;

function TopicStats({ counts }: { counts: TopicPageData['counts'] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden border border-white/15 bg-white/15 sm:grid-cols-3 lg:grid-cols-6">
      {countItems.map(({ key, label, icon: Icon }) => (
        <div key={key} className="bg-[hsl(var(--ink))] px-4 py-4">
          <Icon className="h-4 w-4 text-[hsl(var(--highlight))]" />
          <p className="mt-3 font-mono text-2xl font-semibold">{counts[key]}</p>
          <p className="mt-1 text-xs text-white/55">{label}</p>
        </div>
      ))}
    </div>
  );
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { slug } = await params;
  const data = await getTopicPageData(slug);
  if (!data) notFound();

  const [leadBrief, ...otherBriefs] = data.briefs;

  return (
    <div className="-mx-4 -mb-4 overflow-hidden md:-mx-6 md:-mb-6">
      <section className="border-b border-border bg-[hsl(var(--ink))] py-10 text-[hsl(var(--ink-foreground))] md:py-14">
        <div className="container mx-auto px-4">
          <Link href="/topics" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/60 transition-colors hover:text-[hsl(var(--highlight))]">
            <ArrowLeft className="h-3.5 w-3.5" /> All policy topics
          </Link>
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(520px,0.9fr)] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--highlight))]">Policy briefing</p>
              <h1 className="mt-3 text-balance font-serif text-5xl font-semibold leading-none tracking-[-0.035em] md:text-7xl">{data.topic.name}</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-white/70">{data.topic.description}</p>
            </div>
            <TopicStats counts={data.counts} />
          </div>
        </div>
      </section>

      <section className="border-b border-border py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground pb-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--trust))]" /> GovSource Briefs
              </p>
              <h2 className="mt-2 font-serif text-3xl font-semibold md:text-4xl">Start with the context</h2>
            </div>
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <FileCheck2 className="h-4 w-4 text-[hsl(var(--trust))]" /> Grounded in official records
            </p>
          </div>

          {leadBrief ? (
            <>
              <LeadBrief brief={leadBrief} />
              {otherBriefs.length > 0 ? (
                <div className="mt-9 grid gap-x-8 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
                  {otherBriefs.slice(0, 6).map((brief) => <SecondaryBrief key={brief.id} brief={brief} />)}
                </div>
              ) : null}
            </>
          ) : (
            <div className="border-y border-dashed border-border bg-card/45 px-6 py-10">
              <Badge variant="secondary">Briefs coming soon</Badge>
              <h3 className="mt-4 font-serif text-2xl font-semibold">The official record is already here.</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                We have not published a {data.topic.short_name || data.topic.name} Brief yet. Browse the latest categorized source documents below in the meantime.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="bg-card/40 py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Official record</p>
              <h2 className="mt-2 font-serif text-3xl font-semibold md:text-4xl">Latest {data.topic.short_name || data.topic.name} activity</h2>
            </div>
            <span className="text-xs font-medium text-muted-foreground">Newest records across all branches</span>
          </div>

          {data.records.length > 0 ? (
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {data.records.map((record) => (
                <RecordCard key={`${record.type}-${record.data.id}`} record={record} />
              ))}
            </div>
          ) : (
            <div className="mt-8 border border-dashed border-border bg-background px-6 py-14 text-center">
              <h3 className="font-serif text-2xl font-semibold">No categorized records yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">New official records will appear here as they are classified.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
