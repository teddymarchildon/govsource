import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getPublishedBriefBySlug } from '@/lib/repositories/briefs';
import { getContentHref, getContentTypeLabel } from '@/utils/contentReferences';

export const dynamic = 'force-dynamic';

type BriefPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: BriefPageProps): Promise<Metadata> {
  const { slug } = await params;
  const brief = await getPublishedBriefBySlug(slug);
  if (!brief) return { title: 'Brief not found' };
  return { title: brief.title, description: brief.dek || brief.points[0]?.text.slice(0, 160) };
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(value));
}

export default async function BriefPage({ params }: BriefPageProps) {
  const { slug } = await params;
  const brief = await getPublishedBriefBySlug(slug);
  if (!brief) notFound();

  const primaryReference = { id: brief.primary_item_id, type: brief.primary_item_type };
  const sourcesById = new Map(brief.sources.map((source, index) => [source.id, { ...source, number: index + 1 }]));

  return (
    <article className="container mx-auto max-w-6xl px-4 py-10">
      <Link href="/briefs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to Briefs</Link>

      <header className="mt-7 max-w-4xl">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>{getContentTypeLabel(brief.primary_item_type)}</Badge>
          {formatDate(brief.published_at) ? <span className="text-sm text-muted-foreground">{formatDate(brief.published_at)}</span> : null}
          {brief.policy_areas.map((area) => <Badge key={area} variant="secondary">{area}</Badge>)}
        </div>
        <h1 className="mt-5 text-balance font-serif text-4xl font-semibold leading-tight tracking-tight md:text-6xl">{brief.title}</h1>
        {brief.dek ? <p className="mt-5 max-w-3xl text-xl leading-8 text-muted-foreground">{brief.dek}</p> : null}
        {brief.author_name ? <p className="mt-4 text-sm font-medium">By {brief.author_name}</p> : null}
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <section className="border-y-2 border-foreground py-2">
            <h2 className="sr-only">Key points</h2>
            <ol className="divide-y divide-border">
              {brief.points.map((point, index) => (
                <li key={point.id} className="grid gap-3 py-6 sm:grid-cols-[44px_1fr]">
                  <span className="font-mono text-sm font-bold text-primary">0{index + 1}</span>
                  <p className="text-lg leading-8">
                    {point.text}
                    {point.source_refs.filter((ref) => ref !== 'primary').map((ref) => {
                      const source = sourcesById.get(ref);
                      return source ? <sup key={ref} className="ml-1"><a href={source.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary">[{source.number}]</a></sup> : null;
                    })}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {brief.context_markdown ? (
            <section className="mt-10">
              <h2 className="font-serif text-3xl font-semibold">What this reflects for government</h2>
              <div className="prose prose-gray mt-5 max-w-none prose-a:text-primary"><ReactMarkdown>{brief.context_markdown}</ReactMarkdown></div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card><CardContent className="space-y-3 p-5">
            <h2 className="font-semibold">Primary government source</h2>
            <Link href={getContentHref(primaryReference)} className="inline-flex items-start gap-2 text-sm font-medium text-primary hover:underline"><FileText className="mt-0.5 h-4 w-4 shrink-0" /> View the {getContentTypeLabel(brief.primary_item_type).toLowerCase()}</Link>
          </CardContent></Card>

          {brief.sources.length ? <Card><CardContent className="space-y-3 p-5"><h2 className="font-semibold">Additional sources</h2>{brief.sources.map((source, index) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 break-all text-sm text-primary hover:underline"><ExternalLink className="mt-0.5 h-4 w-4 shrink-0" /> [{index + 1}] {source.label}</a>)}</CardContent></Card> : null}

          {brief.related_items?.length ? <Card><CardContent className="space-y-3 p-5"><h2 className="font-semibold">Related records</h2>{brief.related_items.map((item) => <Link key={`${item.type}-${item.id}`} href={getContentHref(item)} className="block text-sm text-primary hover:underline">{getContentTypeLabel(item.type)} #{item.id}</Link>)}</CardContent></Card> : null}
        </aside>
      </div>
    </article>
  );
}
