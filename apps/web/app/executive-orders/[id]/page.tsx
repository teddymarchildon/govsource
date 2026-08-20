import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ExecutiveOrderDetail from '@/components/ExecutiveOrderDetail';
import { getAgencyDocument } from '@/lib/repositories/agencyDocuments';

export const dynamic = 'force-dynamic';

type ExecutiveOrderPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: ExecutiveOrderPageProps): Promise<Metadata> {
  const { id } = await params;
  const order = await getAgencyDocument(id, 'Executive Order');
  return order ? { title: order.title, description: order.abstract } : { title: 'Executive order not found' };
}

export default async function ExecutiveOrderDetailPage({ params }: ExecutiveOrderPageProps) {
  const { id } = await params;
  const order = await getAgencyDocument(id, 'Executive Order');
  if (!order) notFound();
  return <ExecutiveOrderDetail order={order} />;
}
