import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

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
      <header className="py-5 md:py-6">
        <div className="container mx-auto px-4">
          <h1 className="border-b-2 border-foreground pb-3 font-serif text-3xl font-semibold">Policy topics</h1>
          <p className="mt-3 text-sm text-muted-foreground">Follow an issue across Congress, the White House, agencies, and the courts.</p>
        </div>
      </header>
      <section className="pb-7">
        <div className="container mx-auto px-4">
          <div className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic, index) => (
              <Link
                key={topic.id}
                href={`/topics/${topic.slug}`}
                className="group flex min-h-36 flex-col bg-card p-4 transition-colors hover:bg-secondary/55"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono text-xs font-bold text-primary">{String(index + 1).padStart(2, '0')}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </div>
                <h2 className="mt-3 font-serif text-xl font-semibold leading-tight transition-colors group-hover:text-primary">{topic.name}</h2>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">{topic.description}</p>
                <span className="mt-auto pt-3 text-xs font-semibold uppercase tracking-[0.12em] text-primary">Open topic</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
