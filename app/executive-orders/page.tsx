'use server'

import { Suspense } from 'react';
import { supabaseServer as supabase } from '@/utils/supabase/server';
import { AgencyDocument } from '@/types/types';
import ExecutiveOrdersClient  from './ExecutiveOrdersClient';

// Server Component
async function fetchInitialOrders() {
  try {
    const { data, error } = await supabase
      .from('agency_document')
      .select(`
        id,
        title,
        type,
        remote_document_number,
        signing_date,
        publication_date,
        president,
        pdf_url,
        html_url,
        xml_url,
        pdf_file_path,
        html_file_path,
        xml_file_path,
        abstract,
        subtype,
        agency:agency_agencydocument!agency_document_id(
          agency:agency(id, name)
        )
      `)
      .eq('subtype', 'Executive Order')
      .order('signing_date', { ascending: false })
      .range(0, 49);

    if (error) {
      console.error('Error fetching executive orders:', error);
      return [] as AgencyDocument[];
    }

    // Transform the data to match our interface
    return data?.map(order => ({
      ...order,
      agency: order.agency?.[0]?.agency || null
    })) as unknown as AgencyDocument[];
  } catch (error) {
    console.error('Error fetching executive orders:', error);
    return [] as AgencyDocument[];
  }
}

async function fetchPresidents() {
  try {
    const { data, error } = await supabase
      .from('agency_document')
      .select('president')
      .eq('subtype', 'Executive Order')
      .not('president', 'is', null)
      .order('president');

    if (error) {
      console.error('Error fetching presidents:', error);
      return [];
    }

    // Extract unique presidents
    return [...new Set(data.map(item => item.president).filter(Boolean))];
  } catch (error) {
    console.error('Error fetching presidents:', error);
    return [];
  }
}

export default async function ExecutiveOrdersPage() {
  // Fetch initial data on the server
  const [initialOrders, presidents] = await Promise.all([
    fetchInitialOrders(),
    fetchPresidents()
  ]);

  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">
      <div className="text-xl">Loading...</div>
    </div>}>
      <ExecutiveOrdersClient
        initialOrders={initialOrders}
        initialPresidents={presidents}
      />
    </Suspense>
  );
}
