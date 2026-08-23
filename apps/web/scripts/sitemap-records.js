/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js');

const PAGE_SIZE = 1000;

function createSitemapClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function fetchAllRows(label, queryFactory, pageSize = PAGE_SIZE) {
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load ${label} for the sitemap: ${error.message}`);
    }

    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

function normalizeLastModified(...values) {
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return undefined;
}

function sitemapRecord(path, ...lastModifiedCandidates) {
  return {
    path,
    lastModified: normalizeLastModified(...lastModifiedCandidates),
  };
}

function buildSitemapRecords({ bills, agencyDocuments, briefs, agencies, members, judges, clusters }) {
  const records = [
    ...bills.map((bill) => sitemapRecord(
      `/${bill.law_enacted_date ? 'laws' : 'bills'}/${bill.id}`,
      bill.updated_at,
      bill.created_at,
      bill.law_enacted_date,
      bill.introduced_date,
    )),
    ...agencyDocuments.map((document) => sitemapRecord(
      `/${document.subtype === 'Executive Order' ? 'executive-orders' : 'agency-rules'}/${document.id}`,
      document.updated_at,
      document.created_at,
      document.publication_date,
    )),
    ...briefs.map((brief) => sitemapRecord(
      `/briefs/${encodeURIComponent(brief.slug)}`,
      brief.updated_at,
      brief.published_at,
    )),
    ...agencies.map((agency) => sitemapRecord(`/agencies/${agency.id}`)),
    ...members.map((member) => sitemapRecord(`/congress-members/${member.id}`)),
    ...judges.map((judge) => sitemapRecord(`/judges/${judge.id}`)),
    ...clusters.map((cluster) => sitemapRecord(
      `/supreme-court-cases/${cluster.id}`,
      cluster.updated_at,
      cluster.created_at,
      cluster.date_filed,
    )),
  ];

  return [...new Map(records.map((record) => [record.path, record])).values()];
}

async function getSitemapRecords(client = createSitemapClient()) {
  if (!client) {
    console.warn('[sitemap] Supabase credentials are unavailable; generating static routes only.');
    return [];
  }

  const now = new Date().toISOString();
  const [bills, agencyDocuments, briefs, agencies, members, judges, clusters] = await Promise.all([
    fetchAllRows('bills and laws', () => client
      .from('bill')
      .select('id,updated_at,created_at,introduced_date,law_enacted_date')
      .order('id', { ascending: true })),
    fetchAllRows('agency documents', () => client
      .from('agency_document')
      .select('id,subtype,updated_at,created_at,publication_date')
      .order('id', { ascending: true })),
    fetchAllRows('published Briefs', () => client
      .from('brief')
      .select('slug,updated_at,published_at')
      .in('status', ['published', 'scheduled'])
      .not('slug', 'is', null)
      .not('published_at', 'is', null)
      .lte('published_at', now)
      .order('id', { ascending: true })),
    fetchAllRows('agencies', () => client
      .from('agency')
      .select('id')
      .order('id', { ascending: true })),
    fetchAllRows('Congress members', () => client
      .from('congressman')
      .select('id')
      .order('id', { ascending: true })),
    fetchAllRows('judges', () => client
      .from('judge')
      .select('id')
      .order('id', { ascending: true })),
    fetchAllRows('Supreme Court cases', () => client
      .from('cluster')
      .select('id,updated_at,created_at,date_filed,court:court!inner(remote_id)')
      .eq('court.remote_id', 'scotus')
      .order('id', { ascending: true })),
  ]);

  return buildSitemapRecords({
    bills,
    agencyDocuments,
    briefs,
    agencies,
    members,
    judges,
    clusters,
  });
}

module.exports = {
  PAGE_SIZE,
  buildSitemapRecords,
  fetchAllRows,
  getSitemapRecords,
  normalizeLastModified,
};
