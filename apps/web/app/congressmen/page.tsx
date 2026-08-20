import type { Metadata } from 'next';
import CongressMembersClient from './CongressMembersClient';
import { getCongressMembersDirectory } from '@/lib/repositories/congress';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Congress Members',
  description: 'Browse current and former members of the United States Congress.',
};

export default async function CongressMembersPage() {
  const directory = await getCongressMembersDirectory();
  return <CongressMembersClient {...directory} />;
}
