import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpenText, Layers3 } from 'lucide-react';

import { getTopics } from '@/lib/repositories/topics';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Policy Topics',
  description: 'Explore GovSource Briefs and official federal records by policy topic.',
};

export default async function TopicsPage() {
  const topics = await getTopics();

  return (
    <div className="-mx-4 -mb-4 overflow-hidden md:-mx-6 md:-mb-6">
      <section className="border-b border-border bg-[hsl(var(--ink))] py-12 text-[hsl(var(--ink-foreground))] md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--highlight))]">
              <Layers3 className="h-4 w-4" /> Policy topics
            </p>
            <h1 className="mt-4 text-balance font-serif text-4xl font-semibold leading-tight tracking-[-0.03em] md:text-6xl">
              Follow an issue across the federal government.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/70">
              Each topic brings together concise GovSource Briefs and the official bills, laws, executive actions, agency documents, and court decisions behind them.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Browse the taxonomy</p>
              <h2 className="mt-2 font-serif text-3xl font-semibold">{topics.length} areas of federal policy</h2>
            </div>
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <BookOpenText className="h-4 w-4 text-[hsl(var(--trust))]" /> Briefs appear first when available
            </p>
          </div>

          <div className="mt-8 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic, index) => (
              <Link
                key={topic.id}
                href={`/topics/${topic.slug}`}
                className="group flex min-h-56 flex-col bg-card p-6 transition-colors hover:bg-secondary/55"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono text-xs font-bold text-primary">{String(index + 1).padStart(2, '0')}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </div>
                <h2 className="mt-7 font-serif text-2xl font-semibold leading-tight transition-colors group-hover:text-primary">{topic.name}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{topic.description}</p>
                <span className="mt-auto pt-6 text-xs font-semibold uppercase tracking-[0.12em] text-primary">Open topic</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
