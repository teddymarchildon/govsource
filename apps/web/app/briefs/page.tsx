import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import BriefFeed from '@/components/briefs/BriefFeed';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Briefs',
  description: 'Quick, source-linked explanations of what government data is doing and what it reflects.',
};

export default async function BriefsPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  if ((await searchParams).topic === 'campaign-finance') redirect('/campaign-finance');
  return <BriefFeed />;
}
