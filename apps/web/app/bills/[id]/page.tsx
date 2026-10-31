import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import BillOrLawDetail from '@/components/BillOrLawDetail';
import { getLegislationDetail } from '@/lib/repositories/legislation';

export const dynamic = 'force-dynamic';

type BillDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: BillDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const detail = await getLegislationDetail(id, 'bill');

  if (!detail) {
    const law = await getLegislationDetail(id, 'law');
    if (law) permanentRedirect(`/laws/${id}`);
    return { title: 'Bill not found' };
  }

  return {
    title: `${detail.item.type.toUpperCase()}. ${detail.item.number}: ${detail.item.title}`,
    description: detail.summary?.text?.slice(0, 160) ?? `Read and analyze ${detail.item.title}.`,
  };
}

export default async function BillDetailPage({ params }: BillDetailPageProps) {
  const { id } = await params;
  const detail = await getLegislationDetail(id, 'bill');

  if (!detail) {
    // Preserve old bill links when a record has since become an enacted law.
    const law = await getLegislationDetail(id, 'law');
    if (law) permanentRedirect(`/laws/${id}`);
    notFound();
  }

  return <BillOrLawDetail {...detail} isLaw={false} />;
}
