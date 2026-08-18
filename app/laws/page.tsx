import type { Metadata } from 'next';
import { Suspense } from 'react';
import LawsClient from './LawsClient';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { POLICY_AREAS } from '@/constants/policyAreas';
import { getRecentLaws } from '@/lib/repositories/legislation';
import type { PolicyArea } from '@/types/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Laws',
  description: 'Explore enacted federal legislation and its authoritative source material.',
};

export default async function LawsPage() {
  const initialLaws = await getRecentLaws();

  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><LoadingIndicator size="large" /></div>}>
      <LawsClient initialLaws={initialLaws} policyAreas={POLICY_AREAS as PolicyArea[]} />
    </Suspense>
  );
}
