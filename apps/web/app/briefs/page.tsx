import type { Metadata } from 'next';
import BriefCard from '@/components/briefs/BriefCard';
import { getPublishedBriefs } from '@/lib/repositories/briefs';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Briefs',
  description: 'Quick, source-linked explanations of what government data is doing and what it reflects.',
};

export default async function BriefsPage() {
  const briefs = await getPublishedBriefs(48);

  return (
    <main className="container mx-auto max-w-7xl px-4 py-10">
      <header className="max-w-3xl border-b-2 border-foreground pb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">GovSource Briefs</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight md:text-5xl">Government, in five points or fewer</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">Fast, factual context connected directly to the public records behind each development.</p>
      </header>

      {briefs.length ? (
        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {briefs.map((brief) => <BriefCard key={brief.id} brief={brief} />)}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-dashed bg-card px-6 py-16 text-center">
          <h2 className="font-serif text-2xl font-semibold">No published Briefs yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">The first source-linked Briefs will appear here when they are published.</p>
        </div>
      )}
    </main>
  );
}
