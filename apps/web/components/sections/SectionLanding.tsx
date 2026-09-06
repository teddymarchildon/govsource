import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import BriefFrontPage from '@/components/briefs/BriefFrontPage';
import BriefTeaser from '@/components/briefs/BriefTeaser';
import { selectFrontPageBriefs } from '@/utils/briefSelection';
import { Badge } from '@/components/ui/badge';
import type { Brief } from '@/types/brief';

type BrowseLink = {
  description: string;
  href: string;
  label: string;
};

type SectionLandingProps = {
  briefs: Brief[];
  browseLinks: BrowseLink[];
  description: string;
  eyebrow: string;
  latestActivity: ReactNode;
  latestDescription: string;
  latestTitle: string;
  title: string;
};

export default function SectionLanding({
  briefs,
  browseLinks,
  description,
  eyebrow,
  latestActivity,
  latestDescription,
  latestTitle,
  title,
}: SectionLandingProps) {
  const { lead, remaining } = selectFrontPageBriefs(briefs);

  return (
    <div className="-mx-4 -mb-4 overflow-hidden md:-mx-6 md:-mb-6">
      <header className="py-5 md:py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b-2 border-foreground pb-3">
            <h1 className="font-serif text-3xl font-semibold tracking-tight">{title}</h1>
            <nav aria-label={`${title} research links`} className="flex flex-wrap gap-x-4 gap-y-1">
              {browseLinks.map((link) => <Link key={link.href} href={link.href} className="inline-flex min-h-8 items-center text-xs font-semibold text-primary hover:underline">{link.label} <span aria-hidden="true" className="ml-1">↗</span></Link>)}
            </nav>
          </div>
          <p className="sr-only">{eyebrow}. {description}</p>
        </div>
      </header>

      <section aria-label={`${title} Briefs`} className="border-b border-border pb-7">
        <div className="container mx-auto px-4">
          {lead ? (
            <>
              <BriefFrontPage briefs={briefs} placement={`section:${title}`} />
              {remaining.length > 0 ? <div className="mt-6 grid gap-6 border-t border-border pt-5 md:grid-cols-2 lg:grid-cols-3">
                {remaining.map((brief) => <BriefTeaser key={brief.id} brief={brief} placement={`section:${title}:more`} />)}
              </div> : null}
            </>
          ) : (
            <div className="border border-dashed border-border px-4 py-5">
              <Badge variant="secondary">Briefs coming soon</Badge>
              <p className="mt-2 text-sm text-muted-foreground">Explore the latest official records below while we prepare this section’s Briefs.</p>
            </div>
          )}
        </div>
      </section>

      <section className="border-b border-border bg-card/40 py-7 md:py-9">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Official record</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold">{latestTitle}</h2>
            </div>
            <span className="max-w-sm text-right text-xs font-medium leading-5 text-muted-foreground">{latestDescription}</span>
          </div>
          <div className="mt-5">{latestActivity}</div>
        </div>
      </section>

      <section className="py-7 md:py-9">
        <div className="container mx-auto px-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Research tools</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold">Go deeper</h2>
          <div className="mt-5 grid gap-px overflow-hidden border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
            {browseLinks.map((item) => (
              <Link key={item.href} href={item.href} className="group bg-background p-6 transition-colors hover:bg-secondary/50">
                <span className="flex items-center justify-between gap-4 font-serif text-xl font-semibold">
                  {item.label}
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </span>
                <span className="mt-2 block text-sm leading-6 text-muted-foreground">{item.description}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
