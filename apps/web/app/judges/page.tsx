import type { Metadata } from 'next';
import JudgesClient from './JudgesClient';
import { getJudges } from '@/lib/repositories/judiciary';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Supreme Court Justices',
  description: 'Browse current and former Supreme Court justices and their opinions.',
};

export default async function JudgesPage() {
  const judges = await getJudges();
  return <JudgesClient initialJudges={judges} />;
}
