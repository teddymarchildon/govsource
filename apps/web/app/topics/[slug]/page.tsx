import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import AgencyRuleCard from '@/components/AgencyRuleCard';
import BillCard from '@/components/BillCard';
import BriefFrontPage from '@/components/briefs/BriefFrontPage';
import BriefTeaser from '@/components/briefs/BriefTeaser';
import { selectFrontPageBriefs } from '@/utils/briefSelection';
import CourtCaseCard from '@/components/CourtCaseCard';
import ExecutiveOrderCard from '@/components/ExecutiveOrderCard';
import LawCard from '@/components/LawCard';
import { Badge } from '@/components/ui/badge';
import { getTopicPageData } from '@/lib/repositories/topics';
import type { TopicRecord } from '@/types/topic';

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

export default async function TopicPage({ params }: TopicPageProps) {
  const { slug } = await params;
  const data = await getTopicPageData(slug);
  if (!data) notFound();

  const { lead, remaining } = selectFrontPageBriefs(data.briefs);

  return (
    <div className="-mx-4 -mb-4 overflow-hidden md:-mx-6 md:-mb-6">
      <header className="py-5 md:py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground pb-3">
            <h1 className="font-serif text-3xl font-semibold tracking-tight">{data.topic.name}</h1>
            <Link href="/topics" className="inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-primary hover:underline"><ArrowLeft aria-hidden="true" className="h-3 w-3" /> All topics</Link>
          </div>
          <p className="sr-only">{data.topic.description}</p>
        </div>
      </header>
      <section aria-label={`${data.topic.name} Briefs`} className="border-b border-border pb-7">
        <div className="container mx-auto px-4">
          {lead ? <>
            <BriefFrontPage briefs={data.briefs} placement={`topic:${data.topic.slug}`} />
            {remaining.length > 0 ? <div className="mt-6 grid gap-6 border-t border-border pt-5 md:grid-cols-2 lg:grid-cols-3">{remaining.map((brief) => <BriefTeaser key={brief.id} brief={brief} placement={`topic:${data.topic.slug}:more`} />)}</div> : null}
          </> : <div className="border border-dashed border-border px-4 py-5"><Badge variant="secondary">Briefs coming soon</Badge><p className="mt-2 text-sm text-muted-foreground">Explore the latest official records below while we prepare this topic’s Briefs.</p></div>}
        </div>
      </section>

      <section className="bg-card/40 py-7 md:py-9">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Official record</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold">Latest {data.topic.short_name || data.topic.name} activity</h2>
            </div>
            <span className="text-xs font-medium text-muted-foreground">Newest records across all branches</span>
          </div>

          {data.records.length > 0 ? (
            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {data.records.map((record) => (
                <RecordCard key={`${record.type}-${record.data.id}`} record={record} />
              ))}
            </div>
          ) : (
            <div className="mt-5 border border-dashed border-border bg-background px-6 py-14 text-center">
              <h3 className="font-serif text-2xl font-semibold">No categorized records yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">New official records will appear here as they are classified.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
