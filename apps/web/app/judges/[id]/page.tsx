import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import JudgeDetailClient from './JudgeDetailClient';
import { getJudgeDetail } from '@/lib/repositories/judiciary';

export const dynamic = 'force-dynamic';

type JudgePageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: JudgePageProps): Promise<Metadata> {
  const { id } = await params;
  const detail = await getJudgeDetail(id);
  return detail ? { title: detail.judge.full_name } : { title: 'Justice not found' };
}

export default async function JudgeDetailPage({ params }: JudgePageProps) {
  const { id } = await params;
  const detail = await getJudgeDetail(id);
  if (!detail) notFound();
  return <JudgeDetailClient {...detail} />;
}
