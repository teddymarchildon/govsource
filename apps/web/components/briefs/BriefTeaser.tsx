import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Brief } from '@/types/brief';
import { cn } from '@/lib/utils';
import { getContentTypeLabel } from '@/utils/contentReferences';

export function BriefMeta({ brief }: { brief: Brief }) {
  const date = brief.published_at ? new Date(brief.published_at) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      <span className="text-primary">{getContentTypeLabel(brief.primary_item_type)}</span>
      {date && !Number.isNaN(date.getTime()) ? <time dateTime={brief.published_at!}>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date)}</time> : null}
    </div>
  );
}

export default function BriefTeaser({ brief, variant = 'standard', heading = 'h3', placement = 'feed' }: {
  brief: Brief;
  variant?: 'lead' | 'standard' | 'headline';
  heading?: 'h1' | 'h2' | 'h3';
  placement?: string;
}) {
  const Heading = heading;
  const headline = brief.display_title?.trim() || brief.title;
  return (
    <article className="min-w-0" data-brief-preview={brief.id} data-brief-placement={placement}>
      <Link href={`/briefs/${brief.slug}`} className="group block rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        <BriefMeta brief={brief} />
        <Heading className={cn('mt-2 break-words font-serif font-semibold transition-colors group-hover:text-primary group-hover:underline group-hover:decoration-primary/40 group-hover:underline-offset-4', {
          'text-[28px] leading-[1.12] tracking-[-0.025em] md:text-[36px] xl:text-[40px]': variant === 'lead',
          'text-[21px] leading-[1.2] tracking-[-0.015em] md:text-[23px]': variant === 'standard',
          'text-[19px] leading-[1.25] tracking-[-0.01em]': variant === 'headline',
        })}>{headline}</Heading>
        {brief.dek && variant !== 'headline' ? <p className={cn("mt-2 text-sm leading-[1.55] text-muted-foreground", variant === 'lead' ? 'line-clamp-2' : 'hidden md:line-clamp-2')}>{brief.dek}</p> : null}
        {variant === 'lead' ? <span className="mt-3 inline-flex min-h-6 items-center gap-1.5 text-sm font-semibold text-primary">Read Brief <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span> : null}
      </Link>
    </article>
  );
}
