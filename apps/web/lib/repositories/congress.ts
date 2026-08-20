import 'server-only';

import { cache } from 'react';
import { createClient } from '@/utils/supabase/server';
import type { Bill, Congressman, CongressmanTerm } from '@/types/types';

type BillRelationshipRow = {
  bill: (Bill & {
    sponsor?: Array<{ congressman: Congressman }>;
    cosponsors?: Array<{ congressman: Congressman }>;
  }) | null;
};

function normalizeBillRelationship(row: BillRelationshipRow): Bill | null {
  if (!row.bill) return null;
  return {
    ...row.bill,
    sponsor: row.bill.sponsor?.[0]?.congressman
      ? { congressman: row.bill.sponsor[0].congressman }
      : undefined,
    cosponsors: row.bill.cosponsors?.map(({ congressman }) => ({ congressman })) ?? [],
  };
}

export const getCurrentCongressMembers = cache(async (): Promise<Congressman[]> => {
  const supabase = await createClient();
  const { data: termRows, error: termError } = await supabase
    .from('congressman_term')
    .select('congressman_id')
    .is('end_year', null);

  if (termError) throw termError;
  const ids = [...new Set((termRows ?? []).map((row) => row.congressman_id))];
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('congressman')
    .select('*')
    .in('id', ids)
    .order('last_name');

  if (error) throw error;
  return (data ?? []) as Congressman[];
});

export type CongressMembersDirectory = {
  members: Congressman[];
  currentMemberIds: string[];
};

export const getCongressMembersDirectory = cache(async (): Promise<CongressMembersDirectory> => {
  const supabase = await createClient();
  const [membersResult, termsResult] = await Promise.all([
    supabase.from('congressman').select('*').order('last_name'),
    supabase.from('congressman_term').select('congressman_id').is('end_year', null),
  ]);

  const firstError = [membersResult.error, termsResult.error].find(Boolean);
  if (firstError) throw firstError;

  return {
    members: (membersResult.data ?? []) as Congressman[],
    currentMemberIds: [...new Set((termsResult.data ?? []).map((row) => String(row.congressman_id)))],
  };
});

export type CongressMemberDetail = {
  member: Congressman;
  sponsoredBills: Bill[];
  cosponsoredBills: Bill[];
  terms: CongressmanTerm[];
};

export const getCongressMemberDetail = cache(
  async (id: string): Promise<CongressMemberDetail | null> => {
    const supabase = await createClient();
    const billSelection = `
      bill:bill(
        *,
        sponsor:sponsored_bills!bill_id(congressman:congressman(*)),
        cosponsors:cosponsored_bills!bill_id(congressman:congressman(*))
      )
    `;

    const [memberResult, sponsoredResult, cosponsoredResult, termsResult] = await Promise.all([
      supabase.from('congressman').select('*').eq('id', id).maybeSingle(),
      supabase.from('sponsored_bills').select(billSelection).eq('congressman_id', id),
      supabase.from('cosponsored_bills').select(billSelection).eq('congressman_id', id),
      supabase
        .from('congressman_term')
        .select('*')
        .eq('congressman_id', id)
        .order('start_year', { ascending: false }),
    ]);

    const firstError = [
      memberResult.error,
      sponsoredResult.error,
      cosponsoredResult.error,
      termsResult.error,
    ].find(Boolean);
    if (firstError) throw firstError;
    if (!memberResult.data) return null;

    return {
      member: memberResult.data as Congressman,
      sponsoredBills: ((sponsoredResult.data ?? []) as unknown as BillRelationshipRow[])
        .map(normalizeBillRelationship)
        .filter((bill): bill is Bill => bill !== null),
      cosponsoredBills: ((cosponsoredResult.data ?? []) as unknown as BillRelationshipRow[])
        .map(normalizeBillRelationship)
        .filter((bill): bill is Bill => bill !== null),
      terms: (termsResult.data ?? []) as CongressmanTerm[],
    };
  },
);
