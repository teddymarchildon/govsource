import { supabase } from '@/utils/supabase/client';

export interface BillSearchResult {
  id: number;
  title: string | null;
  type: string | null;
  number: number | null;
  congress: number | null;
  bill_unique_id?: string | null;
  updated_at: string | null;
  created_at: string;
  law_enacted_date?: string | null;
  law_number?: string | null;
  law_title?: string | null;
}

export interface ExecutiveOrderSearchResult {
  id: number;
  title: string | null;
  remote_document_number: string | null;
  signing_date: string | null;
  president: string | null;
  updated_at: string | null;
  created_at: string;
  subtype: string | null;
}

export interface SearchResultItem {
  id: number;
  type: string;
  url: string;
  displayText: string | null;
  [key: string]: unknown;
}

export interface GlobalSearchResults {
  bills: SearchResultItem[];
  congressmen: SearchResultItem[];
  agencies: SearchResultItem[];
  cases: SearchResultItem[];
  judges: SearchResultItem[];
  agencyDocuments: SearchResultItem[];
}

const EMPTY_RESULTS: GlobalSearchResults = {
  bills: [],
  congressmen: [],
  agencies: [],
  cases: [],
  judges: [],
  agencyDocuments: [],
};

function toLikePattern(query: string) {
  const normalized = query.trim().replace(/[(),]/g, ' ').replace(/[%_]/g, (match) => `\\${match}`);
  return `%${normalized}%`;
}

export async function searchBillsAndExecutiveOrders(query: string, limit = 25) {
  if (!query.trim()) {
    return { bills: [] as BillSearchResult[], executiveOrders: [] as ExecutiveOrderSearchResult[] };
  }

  const likePattern = toLikePattern(query);
  const [bills, executiveOrders] = await Promise.all([
    supabase
      .from('bill')
      .select('id, title, type, number, congress, bill_unique_id, updated_at, created_at, law_enacted_date, law_number, law_title')
      .or(`title.ilike.${likePattern},bill_unique_id.ilike.${likePattern},law_title.ilike.${likePattern}`)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('agency_document')
      .select('id, title, remote_document_number, signing_date, president, updated_at, created_at, subtype')
      .eq('subtype', 'Executive Order')
      .or(`title.ilike.${likePattern},remote_document_number.ilike.${likePattern}`)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  if (bills.error) throw bills.error;
  if (executiveOrders.error) throw executiveOrders.error;

  return {
    bills: (bills.data ?? []) as BillSearchResult[],
    executiveOrders: (executiveOrders.data ?? []) as ExecutiveOrderSearchResult[],
  };
}

export async function globalSearch(query: string, limit = 5): Promise<GlobalSearchResults> {
  if (!query.trim()) return EMPTY_RESULTS;

  const likePattern = toLikePattern(query);
  const [bills, congressmen, agencies, clusters, judges, agencyDocuments] = await Promise.all([
    supabase.from('bill')
      .select('id, title, congress, number, type, bill_unique_id, law_enacted_date, law_title')
      .or(`title.ilike.${likePattern},bill_unique_id.ilike.${likePattern},law_title.ilike.${likePattern}`)
      .limit(limit),
    supabase.from('congressman')
      .select('id, full_name, party, state, chamber, bioguide_id')
      .or(`full_name.ilike.${likePattern},last_name.ilike.${likePattern}`)
      .limit(limit),
    supabase.from('agency')
      .select('id, name, short_name')
      .or(`name.ilike.${likePattern},short_name.ilike.${likePattern}`)
      .limit(limit),
    supabase.from('cluster')
      .select('id, case_name, case_name_short')
      .or(`case_name.ilike.${likePattern},case_name_short.ilike.${likePattern}`)
      .limit(limit),
    supabase.from('judge')
      .select('id, full_name')
      .or(`full_name.ilike.${likePattern},last_name.ilike.${likePattern}`)
      .limit(limit),
    supabase.from('agency_document')
      .select('id, title, type, subtype')
      .or(`title.ilike.${likePattern},abstract.ilike.${likePattern}`)
      .limit(limit),
  ]);

  const error = [bills.error, congressmen.error, agencies.error, clusters.error, judges.error, agencyDocuments.error].find(Boolean);
  if (error) throw error;

  return {
    bills: (bills.data ?? []).map((bill) => ({
      ...bill,
      type: bill.law_enacted_date ? 'law' : 'bill',
      url: bill.law_enacted_date ? `/laws/${bill.id}` : `/bills/${bill.id}`,
      displayText: bill.law_title || bill.title,
    })),
    congressmen: (congressmen.data ?? []).map((member) => ({
      ...member,
      type: 'congressman',
      url: `/congress-members/${member.id}`,
      displayText: `${member.full_name} (${member.party}-${member.state})`,
    })),
    agencies: (agencies.data ?? []).map((agency) => ({
      ...agency,
      type: 'agency',
      url: `/agencies/${agency.id}`,
      displayText: agency.name,
    })),
    cases: (clusters.data ?? []).map((cluster) => ({
      ...cluster,
      type: 'case',
      url: `/supreme-court-cases/${cluster.id}`,
      displayText: cluster.case_name,
    })),
    judges: (judges.data ?? []).map((judge) => ({
      ...judge,
      type: 'judge',
      url: `/judges/${judge.id}`,
      displayText: judge.full_name,
    })),
    agencyDocuments: (agencyDocuments.data ?? []).map((document) => ({
      ...document,
      type: document.subtype === 'Executive Order' ? 'executive-order' : 'agency-rule',
      url: document.subtype === 'Executive Order' ? `/executive-orders/${document.id}` : `/agency-rules/${document.id}`,
      displayText: document.title,
    })),
  };
}

