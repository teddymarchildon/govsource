import type { Metadata } from 'next';
import { Suspense } from 'react';
import AgencyRulesClient from './AgencyRulesClient';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { getRecentAgencyDocuments, getTopLevelAgencies } from '@/lib/repositories/agencyDocuments';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Agency Documents',
  description: 'Review federal agency rules, notices, and regulatory source documents.',
};

export default async function AgencyRulesPage() {
  const [initialRules, agencies] = await Promise.all([
    getRecentAgencyDocuments(),
    getTopLevelAgencies(),
  ]);

  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><LoadingIndicator size="large" /></div>}>
      <AgencyRulesClient initialRules={initialRules} agencies={agencies} />
    </Suspense>
  );
}
