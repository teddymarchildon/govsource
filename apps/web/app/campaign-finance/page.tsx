import type { Metadata } from 'next';
import BriefFeed from '@/components/briefs/BriefFeed';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Campaign Finance Briefs',
  description: 'Source-linked Briefs explaining campaign contributions, with party, PAC, and itemized individual records in context.',
  alternates: { canonical: '/campaign-finance' },
};

export default function CampaignFinancePage() {
  return <BriefFeed campaignFinance />;
}
