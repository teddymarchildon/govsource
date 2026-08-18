import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BillOrLawDetail from '@/components/BillOrLawDetail';
import { getLegislationDetail } from '@/lib/repositories/legislation';

export const dynamic = 'force-dynamic';

type LawDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: LawDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const detail = await getLegislationDetail(id, 'law');

  if (!detail) return { title: 'Law not found' };

  const title = detail.item.law_title || detail.item.title;
  return {
    title,
    description: detail.summary?.text?.slice(0, 160) ?? `Read and analyze ${title}.`,
  };
}

export default async function LawDetailPage({ params }: LawDetailPageProps) {
  const { id } = await params;
  const detail = await getLegislationDetail(id, 'law');

  if (!detail) notFound();

  return <BillOrLawDetail {...detail} isLaw />;
}
