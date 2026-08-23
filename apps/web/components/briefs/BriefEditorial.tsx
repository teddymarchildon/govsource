import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Brief } from '@/types/brief';
import { getContentTypeLabel } from '@/utils/contentReferences';
import { formatDate } from '@/utils/utils';

export function BriefMeta({ brief }: { brief: Brief }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      <span className="text-primary">{getContentTypeLabel(brief.primary_item_type)}</span>
      {brief.published_at ? <><span aria-hidden="true">·</span><span>{formatDate(brief.published_at)}</span></> : null}
    </div>
  );
}

export function LeadBrief({ brief }: { brief: Brief }) {
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

export function SecondaryBrief({ brief }: { brief: Brief }) {
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
