import { ParentNavigationLink } from '@/components/Breadcrumbs';
import type { ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import type { Brief } from '@/types/brief';
import { getContentHref, getContentTypeLabel } from '@/utils/contentReferences';
import { getBriefReadingMinutes } from '@/utils/briefReading';
import { BriefReadingAnalytics } from './BriefAnalytics';

const markdownClass = 'prose prose-sm mt-3 max-w-none text-base leading-[1.65] prose-headings:font-serif prose-headings:text-xl prose-p:my-3 prose-a:text-primary';

export default function BriefArticle({ brief, children }: { brief: Brief; children?: ReactNode }) {
  const primaryHref = getContentHref({ id: brief.primary_item_id, type: brief.primary_item_type });
  const sourcesById = new Map(brief.sources.map((source, index) => [source.id, { ...source, number: index + 1 }]));
  const published = brief.published_at ? new Date(brief.published_at) : null;
  const hasDate = published && !Number.isNaN(published.getTime());
  const context = brief.context_markdown?.trim();
  const longContext = Boolean(context && context.split(/\s+/).length > 120);

  return (
    <article className="mx-auto max-w-5xl py-5 md:py-6">
      <BriefReadingAnalytics briefId={brief.id} />
      <ParentNavigationLink href="/briefs">All Briefs</ParentNavigationLink>

      <header className="mt-3 max-w-[760px]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-primary">{getContentTypeLabel(brief.primary_item_type)}</span>
          {hasDate ? <><span aria-hidden="true">·</span><time dateTime={brief.published_at!}>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(published)}</time></> : null}
          <span aria-hidden="true">·</span><span>{getBriefReadingMinutes(brief)} min read</span>
          {brief.author_name ? <span>· By {brief.author_name}</span> : null}
          {brief.version > 1 && brief.updated_at ? <span>· Updated <time dateTime={brief.updated_at}>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(brief.updated_at))}</time></span> : null}
        </div>
        <h1 className="mt-3 break-words font-serif text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] md:text-[38px]">{brief.title}</h1>
        {brief.dek ? <p className="mt-3 max-w-[70ch] text-base leading-[1.6] text-muted-foreground">{brief.dek}</p> : null}
      </header>

      <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-10">
        <div data-brief-body className="min-w-0">
          <section aria-labelledby="brief-key-points" className="border-t-2 border-foreground">
            <h2 id="brief-key-points" className="pt-3 text-xs font-bold uppercase tracking-[0.12em]">Key points</h2>
            <ol className="divide-y divide-border">
              {brief.points.map((point, index) => (
                <li key={point.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 py-4 md:grid-cols-[24px_minmax(0,1fr)]">
                  <span aria-hidden="true" className="pt-1 font-mono text-xs font-semibold text-primary">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    {point.label?.trim() ? <h3 className="mb-1 text-base font-semibold leading-6">{point.label}</h3> : null}
                    <p className="max-w-[72ch] break-words text-base leading-[1.65]">
                      {point.text}
                      {[...new Set(point.source_refs)].map((ref) => {
                        if (ref === 'primary') return <Link key={ref} href={primaryHref} aria-label={`Primary source for point ${index + 1}`} className="ml-1 inline-flex min-h-6 items-center align-baseline text-xs font-semibold text-primary underline decoration-primary/30 underline-offset-2">[Source]</Link>;
                        const source = sourcesById.get(ref);
                        return source ? <a key={ref} href={source.url} target="_blank" rel="noreferrer" aria-label={`Source ${source.number} for point ${index + 1}: ${source.label}`} className="ml-1 inline-flex min-h-6 items-center text-xs font-semibold text-primary underline decoration-primary/30 underline-offset-2">[{source.number}]</a> : null;
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {context ? <section className="mt-3 border-t border-border pt-4" aria-label="Context">
            {longContext ? <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                <span><span className="block font-serif text-xl font-semibold">Context</span><span className="mt-1 block text-sm text-muted-foreground">Read the background and additional detail</span></span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className={markdownClass}><ReactMarkdown>{context}</ReactMarkdown></div>
            </details> : <><h2 className="font-serif text-xl font-semibold">Context</h2><div className={markdownClass}><ReactMarkdown>{context}</ReactMarkdown></div></>}
          </section> : null}
        </div>

        <aside aria-labelledby="brief-sources" className="min-w-0 border-t border-border pt-3 lg:self-start">
          <h2 id="brief-sources" className="text-xs font-bold uppercase tracking-[0.12em]">Sources &amp; records</h2>
          <Link href={primaryHref} className="mt-3 flex items-start justify-between gap-2 py-1 text-sm font-semibold leading-5 text-primary hover:underline">View the {getContentTypeLabel(brief.primary_item_type).toLowerCase()}<ArrowUpRight aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /></Link>
          {brief.sources.length > 0 ? <ol className="mt-3 space-y-2 border-t border-border pt-3">{brief.sources.map((source, index) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer" className="block break-words py-1 text-sm leading-5 text-primary hover:underline">[{index + 1}] {source.label}</a></li>)}</ol> : null}
          {brief.related_items?.length ? <div className="mt-3 border-t border-border pt-3"><h3 className="mb-2 text-xs font-semibold text-muted-foreground">Related records</h3>{brief.related_items.map((item) => <Link key={`${item.type}-${item.id}`} href={getContentHref(item)} className="block py-1 text-sm text-primary hover:underline">{getContentTypeLabel(item.type)} #{item.id}</Link>)}</div> : null}
        </aside>
      </div>

      {brief.policy_areas.length ? <footer className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><span className="font-semibold">Topics</span>{brief.policy_areas.map((area) => <span key={area} className="rounded-sm bg-secondary px-2 py-1">{area}</span>)}</footer> : null}
      {children}
    </article>
  );
}
