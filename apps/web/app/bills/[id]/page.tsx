import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BillOrLawDetail from '@/components/BillOrLawDetail';
import { getLegislationDetail } from '@/lib/repositories/legislation';

export const dynamic = 'force-dynamic';

type BillDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: BillDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const detail = await getLegislationDetail(id, 'bill');

  if (!detail) return { title: 'Bill not found' };

  return {
    title: `${detail.item.type.toUpperCase()}. ${detail.item.number}: ${detail.item.title}`,
    description: detail.summary?.text?.slice(0, 160) ?? `Read and analyze ${detail.item.title}.`,
  };
}

export default async function BillDetailPage({ params }: BillDetailPageProps) {
  const { id } = await params;
  const detail = await getLegislationDetail(id, 'bill');

  if (!detail) notFound();

  return <BillOrLawDetail {...detail} isLaw={false} />;
}
