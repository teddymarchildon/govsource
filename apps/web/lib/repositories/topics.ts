import 'server-only';

import { cache } from 'react';
import { createAdminClient } from '@/utils/supabase/admin';
import { isContentType } from '@/utils/contentReferences';
import type { Brief } from '@/types/brief';
import type { ContentReference } from '@/types/content';
import type { Topic, TopicPageData, TopicRecord } from '@/types/topic';
import type { Agency, AgencyDocument, Bill, Cluster, Congressman, Law } from '@/types/types';

const MAX_ASSIGNMENTS_PER_TYPE = 500;
const MAX_BRIEFS = 12;
const MAX_RECORDS = 36;

type TopicRow = Omit<Topic, 'id'> & { id: string | number };
type AssignmentRow = { record_id: string | number };
type BillRow = Bill & Partial<Law> & {
  sponsor?: Array<{ congressman: Congressman }>;
  actions?: Array<NonNullable<Bill['most_recent_action']>>;
};
type AgencyDocumentRow = AgencyDocument & {
  agencies?: Array<{ agency: Agency }>;
};
type BriefRow = Omit<Brief, 'id' | 'primary_item_id' | 'related_items'> & {
  id: string | number;
  primary_item_id: string | number;
  related_items?: Array<{ item_id: string | number; item_type: string }>;
};

function normalizeTopic(row: TopicRow): Topic {
  return { ...row, id: String(row.id) };
}

function normalizeBill(row: BillRow): Bill | Law {
  const actions = [...(row.actions ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const sponsor = row.sponsor?.[0]?.congressman;
  const normalized = {
    ...row,
    sponsor: row.law_enacted_date ? sponsor : sponsor ? { congressman: sponsor } : undefined,
    most_recent_action: actions[0] ?? null,
    actions: undefined,
  };
  return normalized as Bill | Law;
}

function normalizeAgencyDocument(row: AgencyDocumentRow): AgencyDocument {
  return {
    ...row,
    id: String(row.id),
    agency: row.agencies?.[0]?.agency ?? row.agency,
  };
}

function normalizeBrief(row: BriefRow): Brief {
  const relatedItems: ContentReference[] = (row.related_items ?? []).flatMap((item) =>
    isContentType(item.item_type)
      ? [{ id: String(item.item_id), type: item.item_type }]
      : [],
  );

  return {
    ...row,
    id: String(row.id),
    primary_item_id: String(row.primary_item_id),
    points: Array.isArray(row.points) ? row.points : [],
    policy_areas: row.policy_areas ?? [],
    sources: Array.isArray(row.sources) ? row.sources : [],
    related_items: relatedItems,
  };
}

function uniqueIds(rows: AssignmentRow[]) {
  return [...new Set(rows.map((row) => String(row.record_id)))];
}

function timestamp(value?: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export const getTopics = cache(async (): Promise<Topic[]> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('topic')
    .select('id,slug,name,short_name,description,seo_title,seo_description,display_order')
    .eq('status', 'active')
    .order('display_order')
    .order('name');

  if (error) throw error;
  return ((data ?? []) as TopicRow[]).map(normalizeTopic);
});

export const getTopicPageData = cache(async (slug: string): Promise<TopicPageData | null> => {
  const supabase = createAdminClient();
  const topicResult = await supabase
    .from('topic')
    .select('id,slug,name,short_name,description,seo_title,seo_description,display_order')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();

  if (topicResult.error) throw topicResult.error;
  if (!topicResult.data) return null;

  const topic = normalizeTopic(topicResult.data as TopicRow);
  const [briefAssignments, billAssignments, documentAssignments, clusterAssignments, sourceMappings] = await Promise.all([
    supabase.from('brief_topic').select('record_id:brief_id').eq('topic_id', topic.id).eq('assignment_status', 'approved').order('brief_id', { ascending: false }).limit(MAX_ASSIGNMENTS_PER_TYPE),
    supabase.from('bill_topic').select('record_id:bill_id').eq('topic_id', topic.id).eq('assignment_status', 'approved').order('bill_id', { ascending: false }).limit(MAX_ASSIGNMENTS_PER_TYPE),
    supabase.from('agency_document_topic').select('record_id:agency_document_id').eq('topic_id', topic.id).eq('assignment_status', 'approved').order('agency_document_id', { ascending: false }).limit(MAX_ASSIGNMENTS_PER_TYPE),
    supabase.from('cluster_topic').select('record_id:cluster_id').eq('topic_id', topic.id).eq('assignment_status', 'approved').order('cluster_id', { ascending: false }).limit(MAX_ASSIGNMENTS_PER_TYPE),
    supabase.from('topic_source_mapping').select('source_value').eq('topic_id', topic.id),
  ]);

  const assignmentError = [
    briefAssignments.error,
    billAssignments.error,
    documentAssignments.error,
    clusterAssignments.error,
    sourceMappings.error,
  ].find(Boolean);
  if (assignmentError) throw assignmentError;

  const briefIds = uniqueIds((briefAssignments.data ?? []) as unknown as AssignmentRow[]);
  const billIds = uniqueIds((billAssignments.data ?? []) as unknown as AssignmentRow[]);
  const documentIds = uniqueIds((documentAssignments.data ?? []) as unknown as AssignmentRow[]);
  const clusterIds = uniqueIds((clusterAssignments.data ?? []) as unknown as AssignmentRow[]);
  const legacyBriefAreas = [...new Set([
    topic.name,
    topic.short_name,
    ...(sourceMappings.data ?? []).map((mapping) => mapping.source_value),
  ].filter((value): value is string => Boolean(value)))];
  const now = new Date().toISOString();

  const liveBriefBase = () => supabase
    .from('brief')
    .select('*, related_items:brief_related_item(item_type,item_id)')
    .in('status', ['published', 'scheduled'])
    .not('slug', 'is', null)
    .not('published_at', 'is', null)
    .lte('published_at', now)
    .order('published_at', { ascending: false })
    .limit(MAX_BRIEFS);

  const [assignedBriefs, legacyBriefs, billsResult, documentsResult, clustersResult] = await Promise.all([
    briefIds.length ? liveBriefBase().in('id', briefIds) : Promise.resolve({ data: [], error: null }),
    legacyBriefAreas.length ? liveBriefBase().overlaps('policy_areas', legacyBriefAreas) : Promise.resolve({ data: [], error: null }),
    billIds.length
      ? supabase.from('bill').select('*, sponsor:sponsored_bills!bill_id(congressman:congressman(*)), actions:bill_action!bill_id(id,date,text,type)').in('id', billIds).order('introduced_date', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    documentIds.length
      ? supabase.from('agency_document').select('*, agencies:agency_agencydocument!agency_document_id(agency:agency(*))').in('id', documentIds).order('publication_date', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    clusterIds.length
      ? supabase.from('cluster').select('*, court:court(*), opinions:court_opinion!cluster_id(*, author:judge(*))').in('id', clusterIds).order('date_filed', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const contentError = [assignedBriefs.error, legacyBriefs.error, billsResult.error, documentsResult.error, clustersResult.error].find(Boolean);
  if (contentError) throw contentError;

  const briefMap = new Map<string, Brief>();
  [...(assignedBriefs.data ?? []), ...(legacyBriefs.data ?? [])].forEach((row) => {
    const brief = normalizeBrief(row as unknown as BriefRow);
    briefMap.set(brief.id, brief);
  });
  const briefs = [...briefMap.values()]
    .sort((a, b) => timestamp(b.published_at) - timestamp(a.published_at))
    .slice(0, MAX_BRIEFS);

  const bills = ((billsResult.data ?? []) as unknown as BillRow[]).map(normalizeBill);
  const documents = ((documentsResult.data ?? []) as unknown as AgencyDocumentRow[]).map(normalizeAgencyDocument);
  const clusters = ((clustersResult.data ?? []) as unknown as Cluster[]).map((cluster) => ({
    ...cluster,
    id: String(cluster.id),
    opinions: cluster.opinions ?? [],
  }));

  const records: TopicRecord[] = [
    ...bills.map((bill): TopicRecord => bill.law_enacted_date
      ? { type: 'law', date: bill.law_enacted_date, data: bill as Law }
      : { type: 'bill', date: bill.most_recent_action?.date ?? bill.introduced_date ?? null, data: bill as Bill }),
    ...documents.map((document): TopicRecord => document.subtype === 'Executive Order'
      ? { type: 'executive_order', date: document.signing_date ?? document.publication_date ?? null, data: document }
      : { type: 'agency_document', date: document.publication_date ?? null, data: document }),
    ...clusters.map((cluster): TopicRecord => ({ type: 'cluster', date: cluster.date_filed ?? null, data: cluster })),
  ].sort((a, b) => timestamp(b.date) - timestamp(a.date)).slice(0, MAX_RECORDS);

  return {
    topic,
    briefs,
    records,
    counts: {
      briefs: briefs.length,
      bills: bills.filter((bill) => !bill.law_enacted_date).length,
      laws: bills.filter((bill) => Boolean(bill.law_enacted_date)).length,
      agencyDocuments: documents.filter((document) => document.subtype !== 'Executive Order').length,
      executiveOrders: documents.filter((document) => document.subtype === 'Executive Order').length,
      courtCases: clusters.length,
    },
  };
});
