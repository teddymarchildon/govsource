import 'server-only';

import { cache } from 'react';
import { createClient } from '@/utils/supabase/server';
import type { LegislationDetail } from '@/types/legislation';
import type { Bill, Congressman, Law } from '@/types/types';

export type LegislationKind = 'bill' | 'law';

type LegislationListingRow = Omit<Bill, 'sponsor'> & Omit<Partial<Law>, 'sponsor'> & {
  sponsor?: Array<{ congressman: Congressman }>;
  actions?: Array<NonNullable<Bill['most_recent_action']>>;
};

function normalizeBillListing(row: LegislationListingRow): Bill {
  return {
    ...row,
    sponsor: row.sponsor?.[0]?.congressman ? { congressman: row.sponsor[0].congressman } : undefined,
    most_recent_action: row.actions?.[0] ?? null,
    actions: undefined,
  } as Bill;
}

function normalizeLawListing(row: LegislationListingRow): Law {
  return {
    ...row,
    sponsor: row.sponsor?.[0]?.congressman ?? undefined,
    actions: undefined,
  } as Law;
}

export const getRecentBills = cache(async (limit = 50): Promise<Bill[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bill')
    .select('*, sponsor:sponsored_bills(congressman:congressman(*)), actions:bill_action!bill_id(id, date, text, type)')
    .is('law_enacted_date', null)
    .order('introduced_date', { ascending: false })
    .order('date', { referencedTable: 'actions', ascending: false })
    .limit(1, { referencedTable: 'actions' })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as unknown as LegislationListingRow[]).map(normalizeBillListing);
});

export const getRecentLaws = cache(async (limit = 50): Promise<Law[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bill')
    .select('*, sponsor:sponsored_bills(congressman:congressman(*))')
    .not('law_enacted_date', 'is', null)
    .order('law_enacted_date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as unknown as LegislationListingRow[]).map(normalizeLawListing);
});

export const getLegislationDetail = cache(
  async (id: string, kind: LegislationKind): Promise<LegislationDetail | null> => {
    const supabase = await createClient();

    const itemQuery = supabase.from('bill').select('*').eq('id', id);
    const scopedItemQuery = kind === 'law'
      ? itemQuery.not('law_enacted_date', 'is', null)
      : itemQuery.is('law_enacted_date', null);

    const [itemResult, textsResult, sponsorsResult, cosponsorsResult, actionsResult, summaryResult] =
      await Promise.all([
        scopedItemQuery.maybeSingle(),
        supabase.from('bill_text').select('*').eq('bill_id', id).order('date', { ascending: false }),
        supabase.from('sponsored_bills').select('congressman:congressman(*)').eq('bill_id', id),
        supabase.from('cosponsored_bills').select('congressman:congressman(*)').eq('bill_id', id),
        supabase.from('bill_action').select('*').eq('bill_id', id).order('date', { ascending: false }),
        supabase.from('bill_summary').select('*').eq('bill', id).order('date', { ascending: false }).limit(1).maybeSingle(),
      ]);

    const firstError = [
      itemResult.error,
      textsResult.error,
      sponsorsResult.error,
      cosponsorsResult.error,
      actionsResult.error,
      summaryResult.error,
    ].find(Boolean);

    if (firstError) throw firstError;
    if (!itemResult.data) return null;

    return {
      item: itemResult.data,
      texts: textsResult.data ?? [],
      sponsors: (sponsorsResult.data ?? []).flatMap((row) => row.congressman ?? []),
      cosponsors: (cosponsorsResult.data ?? []).flatMap((row) => row.congressman ?? []),
      actions: actionsResult.data ?? [],
      summary: summaryResult.data ?? null,
    } as unknown as LegislationDetail;
  }
);
