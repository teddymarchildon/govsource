import type { Metadata } from 'next';
import { Suspense } from 'react';
import BillsClient from './BillsClient';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { POLICY_AREAS } from '@/constants/policyAreas';
import { getRecentBills } from '@/lib/repositories/legislation';
import type { PolicyArea } from '@/types/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bills',
  description: 'Browse congressional bills, sponsors, actions, policy areas, and source text.',
};

export default async function BillsPage() {
  const initialBills = await getRecentBills();

  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><LoadingIndicator size="large" /></div>}>
      <BillsClient initialBills={initialBills} policyAreas={POLICY_AREAS as PolicyArea[]} />
    </Suspense>
  );
}
