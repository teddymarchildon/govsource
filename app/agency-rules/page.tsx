'use server'

import { Suspense } from 'react';
import { createClient } from '@/lib/supabase-server';
import AgencyRulesClient from './AgencyRulesClient';
import { Agency, AgencyDocument } from '@/types/types';

// Server-side fetch for initial rules
async function fetchInitialRules() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('agency_document')
      .select(`
        *,
        agencies:agency_agencydocument!agency_document_id(
          agency:agency(*)
        )
      `)
      .order('publication_date', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching agency rules:', error);
      return [] as AgencyDocument[];
    }

    return data?.map((doc: any) => ({
      ...doc,
      agency: doc.agencies?.[0]?.agency || null
    })) as AgencyDocument[];
  } catch (error) {
    console.error('Error fetching agency rules:', error);
    return [] as AgencyDocument[];
  }
}

// Server-side fetch for top-level agencies
async function fetchTopLevelAgencies() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('agency')
      .select('*')
      .is('parent_id', null)
      .order('name');

    if (error) {
      console.error('Error fetching agencies:', error);
      return [] as Agency[];
    }
    return data || [];
  } catch (error) {
    console.error('Error fetching agencies:', error);
    return [] as Agency[];
  }
}

export default async function AgencyRulesPage() {
  const [initialRules, agencies] = await Promise.all([
    fetchInitialRules(),
    fetchTopLevelAgencies()
  ]);

  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">
      <div className="text-xl">Loading...</div>
    </div>}>
      <AgencyRulesClient
        initialRules={initialRules}
        agencies={agencies}
      />
    </Suspense>
  );
}
