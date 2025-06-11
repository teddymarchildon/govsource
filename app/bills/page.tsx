import { Suspense } from 'react';
import { createClient } from '@/lib/supabase-server';
import { Bill } from '@/types/types';
import { POLICY_AREAS } from '@/constants/policyAreas';
import type { PolicyArea } from '@/types/types';
import BillsClient from './BillsClient';

// Server Component
async function fetchInitialBills() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('bill')
      .select(`
        *,
        sponsor:sponsored_bills(
          congressman:congressman(*)
        )
      `)
      .order('introduced_date', { ascending: false })
      .range(0, 49);

    if (error) {
      console.error('Error fetching bills:', error);
      return [] as Bill[];
    }

    // Transform the data to match our Bill interface
    return data?.map((bill: any) => ({
      ...bill,
      sponsor: bill.sponsor?.[0]?.congressman || null
    })) as Bill[];
  } catch (error) {
    console.error('Error fetching bills:', error);
    return [] as Bill[];
  }
}

export default async function BillsPage() {
  // Fetch initial data on the server
  const initialBills = await fetchInitialBills();

  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">
      <div className="text-xl">Loading...</div>
    </div>}>
      <BillsClient
        initialBills={initialBills}
        policyAreas={POLICY_AREAS as PolicyArea[]}
      />
    </Suspense>
  );
}
