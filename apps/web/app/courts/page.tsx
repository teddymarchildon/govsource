import type { Metadata } from 'next';

import CourtCaseCard from '@/components/CourtCaseCard';
import SectionLanding from '@/components/sections/SectionLanding';
import { getPublishedBriefsBySection } from '@/lib/repositories/briefs';
import { getRecentSupremeCourtCases } from '@/lib/repositories/judiciary';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Courts',
  description: 'Understand recent Supreme Court decisions and explore opinions, cases, and justices.',
};

export default async function CourtsPage() {
  const [briefs, cases] = await Promise.all([
    getPublishedBriefsBySection('courts'),
    getRecentSupremeCourtCases(9),
  ]);

  return (
    <SectionLanding
      eyebrow="Judicial branch"
      title="Courts"
      description="Follow consequential court decisions with plain-language context, then examine the opinions and official case records behind them."
      briefs={briefs}
      latestTitle="Latest Supreme Court decisions"
      latestDescription="Recently filed opinions and case activity"
      latestActivity={(
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cases.map((courtCase) => <CourtCaseCard key={courtCase.id} cluster={courtCase} />)}
        </div>
      )}
      browseLinks={[
        { href: '/supreme-court-cases', label: 'Supreme Court cases', description: 'Search cases, opinions, filing dates, and authoring justices.' },
        { href: '/judges', label: 'Justices and judges', description: 'Browse the judicial directory and authored opinions.' },
      ]}
    />
  );
}
