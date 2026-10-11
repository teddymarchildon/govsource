import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CongressMemberDetailClient from './CongressMemberDetailClient';
import { getCongressMemberDetail } from '@/lib/repositories/congress';
import CampaignContributions from '@/components/CampaignContributions';
import IndividualContributions from '@/components/IndividualContributions';
import ContributionOverview from '@/components/ContributionOverview';
import { normalizeContributionFilters, type ContributionQuery } from '@/lib/contributionFilters';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

type CongressMemberPageProps = { params: Promise<{ id: string }>; searchParams: Promise<ContributionQuery> };

export async function generateMetadata({ params }: CongressMemberPageProps): Promise<Metadata> {
  const { id } = await params;
  const detail = await getCongressMemberDetail(id);
  if (!detail) return { title: 'Congress member not found' };

  return {
    title: detail.member.full_name,
    alternates: { canonical: `/congress-members/${detail.member.id}` },
  };
}

export default async function CongressMemberDetailPage({ params, searchParams }: CongressMemberPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const detail = await getCongressMemberDetail(id);
  if (!detail) notFound();
  const filters = normalizeContributionFilters(query);
  const activeTab = ['bills', 'terms', 'statistics', 'contributions'].includes(query.tab ?? '') ? query.tab! : 'bills';
  return <CongressMemberDetailClient {...detail} activeTab={activeTab} contributions={activeTab === 'contributions' ?
    <Suspense key={JSON.stringify(query)} fallback={<p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading campaign contributions…</p>}>
      {query.contributionKind === 'individuals'
        ? <IndividualContributions memberId={String(detail.member.id)} cycle={query.cycle} page={query.contributionPage} filters={filters} />
        : query.contributionKind === 'committees' ? <CampaignContributions memberId={String(detail.member.id)} cycle={query.cycle} page={query.contributionPage} filters={filters} /> : <ContributionOverview memberId={String(detail.member.id)} cycle={query.cycle} />}
    </Suspense> : null} />;
}
