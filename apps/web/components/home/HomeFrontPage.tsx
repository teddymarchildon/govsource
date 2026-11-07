import Link from 'next/link';
import { ArrowRight, FileText } from 'lucide-react';
import BriefTeaser, { BriefMeta } from '@/components/briefs/BriefTeaser';
import type { Brief } from '@/types/brief';
import { selectFrontPageBriefs } from '@/utils/briefSelection';
import { getBriefAuthorName } from '@/utils/briefAuthor';

/** The homepage edition uses the same editorial slots as institution pages. */
export default function HomeFrontPage({ briefs, placement = 'home', leadHeading = 'h1', moreHref = '/briefs', moreLabel = 'All Briefs' }: {
  briefs: Brief[];
  placement?: string;
  leadHeading?: 'h1' | 'h2';
  moreHref?: string;
  moreLabel?: string;
}) {
  const { lead, supporting, latest } = selectFrontPageBriefs(briefs);
  const LeadHeading = leadHeading;
  const moreId = `${placement.replace(/[^a-zA-Z0-9-]/g, '-')}-edition-more`;
  if (!lead) return null;

  return (
    <div className={supporting.length > 0 ? 'grid gap-7 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]' : 'grid gap-7'}>
      <div className="min-w-0 border border-foreground/35 bg-card/50 p-5 md:p-7">
        <article data-brief-preview={lead.id} data-brief-placement={`${placement}:lead`} className={lead.points.length > 0 ? 'grid gap-6 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]' : 'max-w-2xl'}>
          <div className="min-w-0">
            <BriefMeta brief={lead} />
            <Link href={`/briefs/${lead.slug}`} className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
              <LeadHeading className="mt-3 break-words font-serif text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] group-hover:text-primary md:text-[38px]">{lead.display_title?.trim() || lead.title}</LeadHeading>
              {lead.dek ? <p className="mt-4 text-base leading-relaxed text-muted-foreground">{lead.dek}</p> : null}
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">Read the Brief <ArrowRight aria-hidden="true" className="h-4 w-4" /></span>
            </Link>
            {lead.author_name ? <p className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">By <span className="font-semibold text-foreground">{getBriefAuthorName(lead.author_name)}</span></p> : null}
          </div>
          {lead.points.length > 0 ? (
            <aside aria-label="Lead story key takeaways" className="relative min-w-0 self-start overflow-hidden bg-[hsl(var(--ink))] p-6 text-[hsl(var(--ink-foreground))] md:p-7">
              <div className="mb-5 flex items-center justify-between border-b border-white/25 pb-4">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--highlight))]">Inside the Brief</h2>
                <FileText aria-hidden="true" className="h-5 w-5 text-white/50" />
              </div>
              <ol className="divide-y divide-white/20">
                {lead.points.slice(0, 3).map((point, index) => (
                  <li key={point.id} className="flex gap-4 py-4 first:pt-0">
                    <span aria-hidden="true" className="pt-1 font-serif text-sm text-[hsl(var(--highlight))]">0{index + 1}</span>
                    <div className="min-w-0">
                      {point.label ? <p className="mb-1 font-serif text-lg font-semibold leading-snug">{point.label}</p> : null}
                      <p className="line-clamp-4 text-sm leading-relaxed text-white/85">{point.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link href={`/briefs/${lead.slug}`} className="mt-3 inline-flex items-center gap-2 border-t border-white/25 pt-4 text-xs text-[hsl(var(--highlight))] hover:underline">Read the context & sources <ArrowRight aria-hidden="true" className="h-3 w-3" /></Link>
            </aside>
          ) : null}
        </article>
        {latest.length > 0 ? (
          <section aria-labelledby={moreId} className="mt-7 border-t border-foreground/70 pt-4">
            <h2 id={moreId} className="mb-1 text-sm font-bold">More to understand</h2>
            <div className="grid sm:grid-cols-2 sm:gap-x-6">
              {latest.map((brief) => <div key={brief.id} className="border-b border-border py-5 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"><BriefTeaser brief={brief} variant="headline" placement={`${placement}:latest`} /></div>)}
            </div>
          </section>
        ) : null}
      </div>
      {supporting.length > 0 ? (
        <aside aria-label="Supporting stories" className="min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <h2 className="border-b-2 border-foreground pb-3 text-xs font-bold uppercase tracking-[0.15em]">Also in focus</h2>
          <div className="divide-y divide-border">
            {supporting.map((brief) => (
              <div key={brief.id} className="py-6">
                <BriefTeaser brief={brief} variant="feature" heading="h3" placement={`${placement}:supporting`} />
                {brief.points[0] ? <p className="mt-4 line-clamp-3 border-l-2 border-[hsl(var(--trust))]/40 pl-3 text-sm leading-relaxed text-muted-foreground">{brief.points[0].text}</p> : null}
              </div>
            ))}
          </div>
          <Link href={moreHref} className="flex items-center justify-between border-t border-foreground py-4 text-sm font-semibold text-primary hover:underline">{moreLabel} <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </aside>
      ) : null}
    </div>
  );
}
