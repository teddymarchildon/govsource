'use server'

import { Suspense } from 'react';
import { createClient } from '@/utils/supabase/server';
import { Law } from '@/types/types';
import { POLICY_AREAS } from '@/constants/policyAreas';
import type { PolicyArea } from '@/types/types';
import LawsClient from './LawsClient';

// Server Component
async function fetchInitialLaws() {
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
      .not('law_enacted_date', 'is', null)
      .order('law_enacted_date', { ascending: false })
      .range(0, 49);

    if (error) {
      console.error('Error fetching laws:', error);
      return [] as Law[];
    }

    // Transform the data to match our Law interface
    return data?.map((law: any) => ({
      ...law,
      sponsor: law.sponsor?.[0]?.congressman || null
    })) as Law[];
  } catch (error) {
    console.error('Error fetching laws:', error);
    return [] as Law[];
  }
}

export default async function LawsPage() {
  // Fetch initial data on the server
  const initialLaws = await fetchInitialLaws();

  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">
      <div className="text-xl">Loading...</div>
    </div>}>
      <LawsClient
        initialLaws={initialLaws}
        policyAreas={POLICY_AREAS as PolicyArea[]}
      />
    </Suspense>
  );
}
