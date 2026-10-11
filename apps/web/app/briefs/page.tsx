import Link from 'next/link';
import type { Metadata } from 'next';
import BriefCard from '@/components/briefs/BriefCard';
import { getPublishedBriefs } from '@/lib/repositories/briefs';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Briefs',
  description: 'Quick, source-linked explanations of what government data is doing and what it reflects.',
};

export default async function BriefsPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const campaignFinance = (await searchParams).topic === 'campaign-finance';
  const briefs = await getPublishedBriefs(48, campaignFinance);

  return (
    <div className="container mx-auto max-w-7xl px-0 py-5 md:py-6">
      <header className="border-b-2 border-foreground pb-3">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">All Briefs</h1>
        <p className="mt-2 text-sm text-muted-foreground">Government in five points or fewer. Every Brief links to the official record.</p>
      </header>

      <nav aria-label="Brief topics" className="mt-4 flex gap-4 text-sm font-medium">
        <Link href="/briefs" aria-current={!campaignFinance ? 'page' : undefined} className={!campaignFinance ? 'text-primary underline underline-offset-4' : 'text-muted-foreground hover:text-primary'}>All Briefs</Link>
        <Link href="/briefs?topic=campaign-finance" aria-current={campaignFinance ? 'page' : undefined} className={campaignFinance ? 'text-primary underline underline-offset-4' : 'text-muted-foreground hover:text-primary'}>Campaign finance</Link>
      </nav>

      {briefs.length ? (
        <div className="mt-5 grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          {briefs.map((brief) => <BriefCard key={brief.id} brief={brief} />)}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-dashed bg-card px-6 py-16 text-center">
          <h2 className="font-serif text-2xl font-semibold">No published Briefs yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">The first source-linked Briefs will appear here when they are published.</p>
        </div>
      )}
    </div>
  );
}
