import type { Metadata } from 'next';

import ExecutiveOrderCard from '@/components/ExecutiveOrderCard';
import SectionLanding from '@/components/sections/SectionLanding';
import { getRecentExecutiveOrders } from '@/lib/repositories/agencyDocuments';
import { getPublishedBriefsBySection } from '@/lib/repositories/briefs';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'White House',
  description: 'Understand recent presidential actions and explore their official source documents.',
};

export default async function WhiteHousePage() {
  const [briefs, orders] = await Promise.all([
    getPublishedBriefsBySection('white-house'),
    getRecentExecutiveOrders(9),
  ]);

  return (
    <SectionLanding
      eyebrow="Executive branch"
      title="White House"
      description="Understand presidential actions in context, from the policy choices behind them to the directives recorded in official executive orders."
      briefs={briefs}
      latestTitle="Latest executive orders"
      latestDescription="The newest presidential directives in the Federal Register"
      latestActivity={(
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => <ExecutiveOrderCard key={order.id} order={order} />)}
        </div>
      )}
      browseLinks={[
        { href: '/executive-orders', label: 'Executive orders', description: 'Search presidential directives by president, date, or keyword.' },
      ]}
    />
  );
}
