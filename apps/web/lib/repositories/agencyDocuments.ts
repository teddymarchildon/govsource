import 'server-only';

import { cache } from 'react';
import { createClient } from '@/utils/supabase/server';
import type { Agency, AgencyDocument } from '@/types/types';

type AgencyDocumentRow = AgencyDocument & {
  agencies?: Array<{ agency: Agency }>;
};

function normalizeAgencyDocument(row: AgencyDocumentRow): AgencyDocument {
  return {
    ...row,
    agency: row.agencies?.[0]?.agency ?? row.agency,
  };
}

export const getRecentAgencyDocuments = cache(async (limit = 50): Promise<AgencyDocument[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('agency_document')
    .select('*, agencies:agency_agencydocument!agency_document_id(agency:agency(*))')
    .neq('subtype', 'Executive Order')
    .order('publication_date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as unknown as AgencyDocumentRow[]).map(normalizeAgencyDocument);
});

export const getRecentExecutiveOrders = cache(async (limit = 50): Promise<AgencyDocument[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('agency_document')
    .select('*, agencies:agency_agencydocument!agency_document_id(agency:agency(*))')
    .eq('subtype', 'Executive Order')
    .not('signing_date', 'is', null)
    .order('signing_date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as unknown as AgencyDocumentRow[]).map(normalizeAgencyDocument);
});

export const getExecutiveOrderPresidents = cache(async (): Promise<string[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('agency_document')
    .select('president')
    .eq('subtype', 'Executive Order')
    .not('president', 'is', null)
    .order('president');

  if (error) throw error;
  return [...new Set((data ?? []).flatMap((row) => row.president ? [row.president] : []))];
});

export const getTopLevelAgencies = cache(async (): Promise<Agency[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('agency')
    .select('*')
    .is('parent_id', null)
    .order('name');

  if (error) throw error;
  return (data ?? []) as Agency[];
});

export const getAgencies = cache(async (): Promise<Agency[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('agency')
    .select('*, parent:parent_id(id, name, short_name)')
    .order('name');

  if (error) throw error;
  return (data ?? []) as Agency[];
});

export type AgencyDetail = {
  agency: Agency;
  childAgencies: Agency[];
  documents: AgencyDocument[];
};

export const getAgencyDetail = cache(async (id: string): Promise<AgencyDetail | null> => {
  const supabase = await createClient();
  const [agencyResult, childrenResult, documentsResult] = await Promise.all([
    supabase
      .from('agency')
      .select('*, parent:parent_id(id, name, short_name)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('agency').select('*').eq('parent_id', id).order('name'),
    supabase
      .from('agency_document')
      .select('*, agency_link:agency_agencydocument!inner(agency_id)')
      .eq('agency_link.agency_id', id)
      .order('publication_date', { ascending: false }),
  ]);

  const firstError = [agencyResult.error, childrenResult.error, documentsResult.error].find(Boolean);
  if (firstError) throw firstError;
  if (!agencyResult.data) return null;

  return {
    agency: agencyResult.data as Agency,
    childAgencies: (childrenResult.data ?? []) as Agency[],
    documents: (documentsResult.data ?? []) as AgencyDocument[],
  };
});

export const getAgencyDocument = cache(
  async (id: string, subtype?: string): Promise<AgencyDocument | null> => {
    const supabase = await createClient();
    let query = supabase
      .from('agency_document')
      .select(`
        *,
        agencies:agency_agencydocument!agency_document_id(
          agency:agency(id, name, short_name)
        )
      `)
      .eq('id', id);

    if (subtype) query = query.eq('subtype', subtype);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return normalizeAgencyDocument(data as unknown as AgencyDocumentRow);
  }
);
