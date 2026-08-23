import type { Metadata } from 'next';

import BillCard from '@/components/BillCard';
import LawCard from '@/components/LawCard';
import SectionLanding from '@/components/sections/SectionLanding';
import { getPublishedBriefsBySection } from '@/lib/repositories/briefs';
import { getRecentBills, getRecentLaws } from '@/lib/repositories/legislation';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Congress',
  description: 'Understand the latest congressional activity, then explore bills, laws, and members of Congress.',
};

export default async function CongressPage() {
  const [briefs, bills, laws] = await Promise.all([
    getPublishedBriefsBySection('congress'),
    getRecentBills(6),
    getRecentLaws(3),
  ]);

  return (
    <SectionLanding
      eyebrow="Legislative branch"
      title="Congress"
      description="Follow the legislation moving through Congress, understand what it would change, and trace every development back to the official record."
      briefs={briefs}
      latestTitle="Latest congressional activity"
      latestDescription="Recently introduced bills and enacted laws"
      latestActivity={(
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {bills.map((bill) => <BillCard key={`bill-${bill.id}`} bill={bill} />)}
          {laws.map((law) => <LawCard key={`law-${law.id}`} law={law} />)}
        </div>
      )}
      browseLinks={[
        { href: '/bills', label: 'Bills', description: 'Search proposals, sponsors, actions, and legislative status.' },
        { href: '/laws', label: 'Laws', description: 'Browse legislation enacted into federal law.' },
        { href: '/congress-members', label: 'Congress members', description: 'Find representatives and senators and review their work.' },
      ]}
    />
  );
}
