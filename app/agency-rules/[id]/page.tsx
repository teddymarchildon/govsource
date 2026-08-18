import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AgencyRuleDetail from '@/components/AgencyRuleDetail';
import { getAgencyDocument } from '@/lib/repositories/agencyDocuments';

export const dynamic = 'force-dynamic';

type AgencyDocumentPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: AgencyDocumentPageProps): Promise<Metadata> {
  const { id } = await params;
  const document = await getAgencyDocument(id);

  if (!document || document.subtype === 'Executive Order') {
    return { title: 'Agency document not found' };
  }

  return {
    title: document.title,
    description: document.abstract?.replace(/<[^>]+>/g, '').slice(0, 160) ?? 'Federal agency document.',
  };
}

export default async function AgencyDocumentDetailPage({ params }: AgencyDocumentPageProps) {
  const { id } = await params;
  const document = await getAgencyDocument(id);

  if (!document || document.subtype === 'Executive Order') notFound();

  return <AgencyRuleDetail rule={document} />;
}
