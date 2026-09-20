import 'server-only';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const CONTRIBUTION_PAGE_SIZE = 25;

type Group = { giving_committee_id: string | null; group_name: string; total_amount: number; contribution_count: number };
export type Contribution = {
  sub_id: string; contributor_name: string; giving_committee_id: string | null;
  receiving_committee_id: string; amount: number; receipt_date: string | null; source_url: string;
};
export type MemberContributions = {
  cycles: number[]; cycle: number | null; refreshedAt: string | null; nationwide: boolean;
  linked: boolean; excludedCommittees: number; groups: Group[]; total: number;
  receipts: Contribution[]; count: number; page: number;
};

export async function getMemberContributions(memberId: string, requestedCycle?: string, requestedPage?: string): Promise<MemberContributions> {
  const db = await createClient();
  // Only publication metadata is returned. Import errors, leases and checkpoints stay private.
  const [coverage, candidates] = await Promise.all([
    createAdminClient().from('fec_sync_state')
      .select('cycle,last_success_at,last_full_success_at,published_scope')
      .not('last_success_at', 'is', null).order('cycle', { ascending: false }),
    db.from('fec_candidate').select('candidate_id').eq('congressman_id', memberId),
  ]);
  if (coverage.error) throw coverage.error;
  if (candidates.error) throw candidates.error;
  const cycles = (coverage.data ?? []).map(row => Number(row.cycle));
  const cycle = cycles.includes(Number(requestedCycle)) ? Number(requestedCycle) : cycles[0] ?? null;
  const publication = coverage.data?.find(row => Number(row.cycle) === cycle);
  const result: MemberContributions = {
    cycles, cycle, refreshedAt: publication?.last_success_at ?? null,
    nationwide: Boolean(publication?.last_full_success_at), linked: Boolean(candidates.data?.length),
    excludedCommittees: 0, groups: [], total: 0, receipts: [], count: 0, page: 1,
  };
  if (!cycle || !candidates.data?.length) return result;
  const ids = candidates.data.map(row => row.candidate_id);
  const links = await db.from('fec_candidate_committee').select('committee_id').in('candidate_id', ids).eq('cycle', cycle);
  if (links.error) throw links.error;
  const committees = [...new Set((links.data ?? []).map(row => row.committee_id))];
  if (!committees.length) return result;
  const allLinks = await db.from('fec_candidate_committee').select('committee_id,candidate_id').in('committee_id', committees).eq('cycle', cycle);
  if (allLinks.error) throw allLinks.error;
  const linkCounts = new Map<string, number>();
  for (const row of allLinks.data ?? []) linkCounts.set(row.committee_id, (linkCounts.get(row.committee_id) ?? 0) + 1);
  const attributed = committees.filter(id => linkCounts.get(id) === 1);
  result.excludedCommittees = committees.length - attributed.length;
  if (!attributed.length) return result;

  // Page through every group, including members with multiple FEC IDs; never total a truncated top-N result.
  const groups = new Map<string, Group>();
  for (let offset = 0; ; offset += 500) {
    const page = await db.from('fec_group_candidate_totals')
      .select('candidate_id,giving_committee_id,group_name,total_amount,contribution_count')
      .in('candidate_id', ids).eq('cycle', cycle)
      .order('candidate_id').order('giving_committee_id', { nullsFirst: false }).order('group_name')
      .range(offset, offset + 499);
    if (page.error) throw page.error;
    for (const row of page.data ?? []) {
      const key = row.giving_committee_id ?? `unresolved:${row.group_name}`;
      const previous = groups.get(key);
      groups.set(key, {
        giving_committee_id: row.giving_committee_id, group_name: row.group_name,
        total_amount: ((previous ? Math.round(previous.total_amount * 100) : 0) + Math.round(Number(row.total_amount) * 100)) / 100,
        contribution_count: (previous?.contribution_count ?? 0) + Number(row.contribution_count),
      });
    }
    if ((page.data?.length ?? 0) < 500) break;
  }
  result.groups = [...groups.values()].sort((a, b) => b.total_amount - a.total_amount || a.group_name.localeCompare(b.group_name));
  result.total = result.groups.reduce((sum, group) => sum + Math.round(group.total_amount * 100), 0) / 100;
  const count = await db.from('fec_committee_contribution').select('sub_id', { count: 'exact', head: true })
    .in('receiving_committee_id', attributed).eq('cycle', cycle);
  if (count.error) throw count.error;
  result.count = count.count ?? 0;
  const pageNumber = requestedPage && /^\d{1,8}$/.test(requestedPage) ? Number(requestedPage) : 1;
  result.page = Math.max(1, Math.min(pageNumber, Math.max(1, Math.ceil(result.count / CONTRIBUTION_PAGE_SIZE))));
  const offset = (result.page - 1) * CONTRIBUTION_PAGE_SIZE;
  const receipts = await db.from('fec_committee_contribution')
    .select('sub_id,contributor_name,giving_committee_id,receiving_committee_id,amount,receipt_date,source_url')
    .in('receiving_committee_id', attributed).eq('cycle', cycle)
    .order('receipt_date', { ascending: false, nullsFirst: false }).order('sub_id', { ascending: false })
    .range(offset, offset + CONTRIBUTION_PAGE_SIZE - 1);
  if (receipts.error) throw receipts.error;
  result.receipts = (receipts.data ?? []) as Contribution[];
  return result;
}
