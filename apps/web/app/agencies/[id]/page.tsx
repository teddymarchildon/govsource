import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AgencyDetailClient from './AgencyDetailClient';
import { getAgencyDetail } from '@/lib/repositories/agencyDocuments';

export const dynamic = 'force-dynamic';

type AgencyPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: AgencyPageProps): Promise<Metadata> {
  const { id } = await params;
  const detail = await getAgencyDetail(id);
  return detail
    ? { title: detail.agency.name, description: detail.agency.description }
    : { title: 'Agency not found' };
}

export default async function AgencyDetailPage({ params }: AgencyPageProps) {
  const { id } = await params;
  const detail = await getAgencyDetail(id);
  if (!detail) notFound();
  return <AgencyDetailClient agencyId={id} {...detail} />;
}
