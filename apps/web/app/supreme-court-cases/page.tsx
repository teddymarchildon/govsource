import type { Metadata } from 'next';
import { Suspense } from 'react';
import SupremeCourtCasesClient from './SupremeCourtCasesClient';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { getJudges, getSupremeCourtCasesPage } from '@/lib/repositories/judiciary';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Supreme Court Cases',
  description: 'Browse Supreme Court cases, opinions, filing dates, and authoring justices.',
};

type CasesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SupremeCourtCasesPage({ searchParams }: CasesPageProps) {
  const params = await searchParams;
  const filters = {
    search: first(params.search),
    judgeId: first(params.judge_id),
    startDate: first(params.start_date),
    endDate: first(params.end_date),
    sortOrder: first(params.sort_order) === 'asc' ? ('asc' as const) : ('desc' as const),
  };
  const [initialClusters, judges] = await Promise.all([
    getSupremeCourtCasesPage(filters),
    getJudges(),
  ]);

  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><LoadingIndicator size="large" /></div>}>
      <SupremeCourtCasesClient initialClusters={initialClusters} judges={judges} />
    </Suspense>
  );
}
