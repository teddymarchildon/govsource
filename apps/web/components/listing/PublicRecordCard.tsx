import type { ReactNode } from 'react';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface PublicRecordCardProps {
  href: string;
  eyebrow: string;
  title: string;
  badge?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: 'default' | 'enacted';
}

export function PublicRecordCard({
  href,
  eyebrow,
  title,
  badge,
  children,
  footer,
  tone = 'default',
}: PublicRecordCardProps) {
  return (
    <Card
      className={cn(
        'group relative flex h-full min-h-[238px] cursor-pointer flex-col overflow-hidden border-border/80 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md focus-within:ring-2 focus-within:ring-primary/30',
        tone === 'enacted' && 'border-l-2 border-l-[hsl(var(--trust))]',
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <p className="min-w-0 line-clamp-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.12em] text-primary">
          {eyebrow}
        </p>
        {badge ? <div className="relative z-10 shrink-0">{badge}</div> : null}
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <Link
          href={href}
          className="after:absolute after:inset-0 focus:outline-none"
          aria-label={`View ${title}`}
        >
          <h2 className="line-clamp-3 text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
            {title}
          </h2>
        </Link>

        {children ? <div className="mt-3">{children}</div> : null}
        {footer ? <div className="mt-auto border-t border-border/70 pt-3">{footer}</div> : null}
      </div>
    </Card>
  );
}
