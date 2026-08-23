import type { Metadata } from 'next';
import AgenciesClient from './AgenciesClient';
import AgencyRuleCard from '@/components/AgencyRuleCard';
import SectionLanding from '@/components/sections/SectionLanding';
import { getAgencies, getRecentAgencyDocuments } from '@/lib/repositories/agencyDocuments';
import { getPublishedBriefsBySection } from '@/lib/repositories/briefs';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Agencies',
  description: 'Understand recent federal regulatory activity, then explore agency documents and the federal agency directory.',
};

export default async function AgenciesPage() {
  const [briefs, documents, agencies] = await Promise.all([
    getPublishedBriefsBySection('agencies'),
    getRecentAgencyDocuments(9),
    getAgencies(),
  ]);

  return (
    <>
      <SectionLanding
        eyebrow="Executive branch"
        title="Federal agencies"
        description="See what federal agencies are changing, why it matters, and how new rules, notices, and regulatory actions connect to the laws they administer."
        briefs={briefs}
        latestTitle="Latest agency activity"
        latestDescription="Recently published rules, proposed rules, and notices"
        latestActivity={(
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {documents.map((document) => <AgencyRuleCard key={document.id} rule={document} />)}
          </div>
        )}
        browseLinks={[
          { href: '/agency-rules', label: 'Agency documents', description: 'Search rules, notices, proposals, agencies, and publication dates.' },
          { href: '#agency-directory', label: 'Federal agency directory', description: 'Browse departments, independent agencies, and their sub-agencies.' },
        ]}
      />
      <section id="agency-directory" className="scroll-mt-20">
        <AgenciesClient initialAgencies={agencies} embedded />
      </section>
    </>
  );
}
