import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SupremeCourtCaseClient from './SupremeCourtCaseClient';
import { getSupremeCourtCase } from '@/lib/repositories/judiciary';

export const dynamic = 'force-dynamic';

type SupremeCourtCasePageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: SupremeCourtCasePageProps): Promise<Metadata> {
  const { id } = await params;
  const cluster = await getSupremeCourtCase(id);
  return cluster ? { title: cluster.case_name } : { title: 'Supreme Court case not found' };
}

export default async function SupremeCourtCasePage({ params }: SupremeCourtCasePageProps) {
  const { id } = await params;
  const cluster = await getSupremeCourtCase(id);
  if (!cluster) notFound();
  return <SupremeCourtCaseClient cluster={cluster} />;
}
