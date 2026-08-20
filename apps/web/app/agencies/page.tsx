import type { Metadata } from 'next';
import AgenciesClient from './AgenciesClient';
import { getAgencies } from '@/lib/repositories/agencyDocuments';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Federal Agencies',
  description: 'Browse federal departments, agencies, and offices.',
};

export default async function AgenciesPage() {
  const agencies = await getAgencies();
  return <AgenciesClient initialAgencies={agencies} />;
}
