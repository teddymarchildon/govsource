import 'server-only';

import { cache } from 'react';
import { createClient } from '@/utils/supabase/server';
import { getPublishedArticles } from './articles';
import { getRecentExecutiveOrders } from './agencyDocuments';
import type { AgencyDocument, Bill, Cluster, Law } from '@/types/types';
import type { HomepagePublicData, PopularHomepageItem } from '@/types/homepage';

type RankedRow = {
  id: string;
  item_id: string;
  item_type: PopularHomepageItem['item_type'];
};

type BillRow = Bill & {
  sponsor?: Array<{ congressman: unknown }>;
  actions?: Array<{ id: string; date: string; text: string; type: string }>;
};

function normalizeBill(row: BillRow): Bill | Law {
  const actions = [...(row.actions ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  return {
    ...row,
    sponsor: row.sponsor?.[0]?.congressman
      ? { congressman: row.sponsor[0].congressman }
      : undefined,
    most_recent_action: actions[0] ?? null,
    actions: undefined,
  } as unknown as Bill | Law;
}

export const getHomepagePublicData = cache(async (): Promise<HomepagePublicData> => {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [articles, billsResult, recentExecutiveOrders, rankedResult] = await Promise.all([
    getPublishedArticles(24),
    supabase
      .from('bill')
      .select('*, sponsor:sponsored_bills!bill_id(congressman:congressman(*)), actions:bill_action!bill_id(id, date, text, type)')
      .order('introduced_date', { ascending: false })
      .limit(12),
    getRecentExecutiveOrders(6),
    supabase
      .from('ranked_item')
      .select('id, item_id, item_type')
      .is('ranking_ended_at', null)
      .or(`effectively_ranked_at.is.null,effectively_ranked_at.lte.${now}`)
      .order('rank', { ascending: true })
      .limit(24),
  ]);

  const firstError = [billsResult.error, rankedResult.error].find(Boolean);
  if (firstError) throw firstError;

  const ranked = (rankedResult.data ?? []) as RankedRow[];
  const billIds = ranked
    .filter((item) => item.item_type === 'bill' || item.item_type === 'law')
    .map((item) => item.item_id);
  const documentIds = ranked
    .filter((item) => item.item_type === 'agency_document' || item.item_type === 'executive_order')
    .map((item) => item.item_id);
  const clusterIds = ranked.filter((item) => item.item_type === 'cluster').map((item) => item.item_id);

  const [rankedBillsResult, documentsResult, clustersResult] = await Promise.all([
    billIds.length
      ? supabase
          .from('bill')
          .select('*, sponsor:sponsored_bills!bill_id(congressman:congressman(*)), actions:bill_action!bill_id(id, date, text, type)')
          .in('id', billIds)
      : Promise.resolve({ data: [], error: null }),
    documentIds.length
      ? supabase
          .from('agency_document')
          .select('*, agency_link:agency_agencydocument!agency_document_id(agency:agency(*))')
          .in('id', documentIds)
      : Promise.resolve({ data: [], error: null }),
    clusterIds.length
      ? supabase
          .from('cluster')
          .select('*, court:court(*), opinions:court_opinion!cluster_id(*, author:judge(*))')
          .in('id', clusterIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const hydrationError = [rankedBillsResult.error, documentsResult.error, clustersResult.error].find(Boolean);
  if (hydrationError) throw hydrationError;

  const billsById = new Map(
    ((rankedBillsResult.data ?? []) as unknown as BillRow[]).map((row) => [String(row.id), normalizeBill(row)]),
  );
  const documentsById = new Map(
    ((documentsResult.data ?? []) as unknown as Array<AgencyDocument & { agency_link?: Array<{ agency: AgencyDocument['agency'] }> }>).map(
      (row) => [String(row.id), { ...row, agency: row.agency_link?.[0]?.agency } as AgencyDocument],
    ),
  );
  const clustersById = new Map(
    ((clustersResult.data ?? []) as unknown as Cluster[]).map((row) => [String(row.id), row]),
  );

  const popularItems = ranked.flatMap((rankedItem): PopularHomepageItem[] => {
    if (rankedItem.item_type === 'bill' || rankedItem.item_type === 'law') {
      const item = billsById.get(String(rankedItem.item_id));
      if (!item) return [];
      if (rankedItem.item_type === 'law' && !item.law_enacted_date) return [];
      if (rankedItem.item_type === 'bill' && item.law_enacted_date) return [];
      return [{ id: rankedItem.id, item_type: rankedItem.item_type, data: item as Law & Bill }];
    }
    if (rankedItem.item_type === 'agency_document' || rankedItem.item_type === 'executive_order') {
      const item = documentsById.get(String(rankedItem.item_id));
      if (!item) return [];
      const itemType = item.subtype === 'Executive Order' ? 'executive_order' : 'agency_document';
      if (itemType !== rankedItem.item_type) return [];
      return [{ id: rankedItem.id, item_type: itemType, data: item }];
    }
    const item = clustersById.get(String(rankedItem.item_id));
    return item ? [{ id: rankedItem.id, item_type: 'cluster', data: item }] : [];
  }).slice(0, 8);

  return {
    articles,
    bills: ((billsResult.data ?? []) as unknown as BillRow[]).map((row) => normalizeBill(row) as Bill),
    popularItems,
    recentExecutiveOrders,
  };
});
