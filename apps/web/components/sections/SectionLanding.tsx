import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, FileCheck2 } from 'lucide-react';

import { LeadBrief, SecondaryBrief } from '@/components/briefs/BriefEditorial';
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
  const [leadBrief, ...otherBriefs] = briefs;

  return (
    <div className="-mx-4 -mb-4 overflow-hidden md:-mx-6 md:-mb-6">
      <section className="border-b border-border bg-[hsl(var(--ink))] py-12 text-[hsl(var(--ink-foreground))] md:py-16">
        <div className="container mx-auto px-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--highlight))]">{eyebrow}</p>
          <h1 className="mt-3 text-balance font-serif text-5xl font-semibold leading-none tracking-[-0.035em] md:text-7xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-white/70">{description}</p>
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
                We have not published a Brief for this section yet. Browse the latest source documents below in the meantime.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="border-b border-border bg-card/40 py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Official record</p>
              <h2 className="mt-2 font-serif text-3xl font-semibold md:text-4xl">{latestTitle}</h2>
            </div>
            <span className="max-w-sm text-right text-xs font-medium leading-5 text-muted-foreground">{latestDescription}</span>
          </div>
          <div className="mt-8">{latestActivity}</div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Research tools</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold md:text-4xl">Go deeper</h2>
          <div className="mt-8 grid gap-px overflow-hidden border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
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
