import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CongressMemberDetailClient from './CongressMemberDetailClient';
import { getCongressMemberDetail } from '@/lib/repositories/congress';
import CampaignContributions from '@/components/CampaignContributions';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

type CongressMemberPageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; cycle?: string; contributionPage?: string }> };

export async function generateMetadata({ params }: CongressMemberPageProps): Promise<Metadata> {
  const { id } = await params;
  const detail = await getCongressMemberDetail(id);
  return detail ? { title: detail.member.full_name } : { title: 'Congress member not found' };
}

export default async function CongressMemberDetailPage({ params, searchParams }: CongressMemberPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const detail = await getCongressMemberDetail(id);
  if (!detail) notFound();
  const activeTab = ['bills', 'terms', 'statistics', 'contributions'].includes(query.tab ?? '') ? query.tab! : 'bills';
  return <CongressMemberDetailClient {...detail} activeTab={activeTab} contributions={activeTab === 'contributions' ?
    <Suspense key={`${query.cycle}-${query.contributionPage}`} fallback={<p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading campaign contributions…</p>}>
      <CampaignContributions memberId={String(detail.member.id)} cycle={query.cycle} page={query.contributionPage} />
    </Suspense> : null} />;
}
