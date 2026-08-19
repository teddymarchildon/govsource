import type { Metadata } from 'next';
import { Suspense } from 'react';
import ExecutiveOrdersClient from './ExecutiveOrdersClient';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { getExecutiveOrderPresidents, getRecentExecutiveOrders } from '@/lib/repositories/agencyDocuments';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Executive Orders',
  description: 'Read presidential directives and their official source documents.',
};

export default async function ExecutiveOrdersPage() {
  const [initialOrders, presidents] = await Promise.all([
    getRecentExecutiveOrders(),
    getExecutiveOrderPresidents(),
  ]);

  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><LoadingIndicator size="large" /></div>}>
      <ExecutiveOrdersClient initialOrders={initialOrders} initialPresidents={presidents} />
    </Suspense>
  );
}
