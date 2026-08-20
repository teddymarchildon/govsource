import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CongressMemberDetailClient from './CongressMemberDetailClient';
import { getCongressMemberDetail } from '@/lib/repositories/congress';

export const dynamic = 'force-dynamic';

type CongressMemberPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: CongressMemberPageProps): Promise<Metadata> {
  const { id } = await params;
  const detail = await getCongressMemberDetail(id);
  return detail ? { title: detail.member.full_name } : { title: 'Congress member not found' };
}

export default async function CongressMemberDetailPage({ params }: CongressMemberPageProps) {
  const { id } = await params;
  const detail = await getCongressMemberDetail(id);
  if (!detail) notFound();
  return <CongressMemberDetailClient {...detail} />;
}
