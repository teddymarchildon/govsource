import Link from 'next/link';
import BriefCard from './BriefCard';
import { getPublishedBriefs, withFrontPageSelections } from '@/lib/repositories/briefs';
import BriefFrontPage from './BriefFrontPage';
import { selectFrontPageBriefs } from '@/utils/briefSelection';

export default async function BriefFeed({ campaignFinance = false }: { campaignFinance?: boolean }) {
  const recent = await getPublishedBriefs(48, campaignFinance);
  const briefs = campaignFinance ? await withFrontPageSelections('campaign-finance', recent) : recent;
  const remaining = campaignFinance ? selectFrontPageBriefs(briefs).remaining : briefs;

  return (
    <div className="container mx-auto max-w-7xl px-0 py-5 md:py-6">
      <header className="border-b-2 border-foreground pb-3">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{campaignFinance ? 'Campaign Finance' : 'All Briefs'}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{campaignFinance ? 'Campaign contributions in context. Explore source-linked Briefs on party, PAC, and itemized individual contributions.' : 'Government in five points or fewer. Every Brief links to the official record.'}</p>
      </header>

      <nav aria-label="Brief topics" className="mt-4 flex gap-4 text-sm font-medium">
        <Link href="/briefs" aria-current={!campaignFinance ? 'page' : undefined} className={!campaignFinance ? 'text-primary underline underline-offset-4' : 'text-muted-foreground hover:text-primary'}>All Briefs</Link>
        <Link href="/campaign-finance" aria-current={campaignFinance ? 'page' : undefined} className={campaignFinance ? 'text-primary underline underline-offset-4' : 'text-muted-foreground hover:text-primary'}>Campaign finance</Link>
      </nav>

      {briefs.length ? (
        <>
        {campaignFinance ? <section aria-label="Campaign Finance top stories" className="mt-6 border-b border-border pb-6"><BriefFrontPage briefs={briefs} placement="section:campaign-finance" /></section> : null}
        <div className="mt-5 grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          {remaining.map((brief) => <BriefCard key={brief.id} brief={brief} />)}
        </div>
        </>
      ) : (
        <div className="mt-8 rounded-xl border border-dashed bg-card px-6 py-16 text-center">
          <h2 className="font-serif text-2xl font-semibold">{campaignFinance ? 'Campaign contribution Briefs are coming soon' : 'No published Briefs yet'}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{campaignFinance ? 'Briefs will appear here after editorial review. In the meantime, explore contribution records on Congress member profiles.' : 'The first source-linked Briefs will appear here when they are published.'}</p>
          {campaignFinance ? <Link href="/congress-members" className="mt-5 inline-flex text-sm font-semibold text-primary hover:underline">Explore Congress members →</Link> : null}
        </div>
      )}
    </div>
  );
}
