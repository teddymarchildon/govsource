import 'server-only';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { CONTRIBUTION_PAGE_SIZE } from './contributions';

export type IndividualReceipt = {
  sub_id: string; contributor_name: string; receiving_committee_id: string;
  employer: string | null; occupation: string | null; city: string | null; state: string | null;
  amount: number; receipt_date: string | null; source_url: string;
};
export type IndividualGroup = { label: string | null; total: number; count: number };
export type IndividualContributions = {
  cycle: number | null; cycles: number[]; linked: boolean; excludedCommittees: number;
  coveredCommittees: number; eligibleCommittees: number; refreshedAt: string | null;
  total: number; count: number; page: number; receipts: IndividualReceipt[];
  employers: IndividualGroup[]; occupations: IndividualGroup[];
};

export async function getMemberIndividualContributions(memberId: string, requestedCycle?: string, requestedPage?: string): Promise<IndividualContributions> {
  const db = await createClient();
  const [periods, candidates] = await Promise.all([
    createAdminClient().from('fec_sync_state').select('cycle').not('last_success_at', 'is', null).order('cycle', { ascending: false }),
    db.from('fec_candidate').select('candidate_id').eq('congressman_id', memberId),
  ]);
  if (periods.error) throw periods.error;
  if (candidates.error) throw candidates.error;
  const cycles = (periods.data ?? []).map(row => Number(row.cycle));
  const cycle = cycles.includes(Number(requestedCycle)) ? Number(requestedCycle) : cycles[0] ?? null;
  const result: IndividualContributions = { cycle, cycles, linked: Boolean(candidates.data?.length), excludedCommittees: 0,
    coveredCommittees: 0, eligibleCommittees: 0, refreshedAt: null, total: 0, count: 0, page: 1, receipts: [], employers: [], occupations: [] };
  if (!cycle || !candidates.data?.length) return result;
  const links = await db.from('fec_candidate_committee').select('committee_id').eq('cycle', cycle)
    .in('candidate_id', candidates.data.map(row => row.candidate_id));
  if (links.error) throw links.error;
  const committees = [...new Set((links.data ?? []).map(row => row.committee_id))];
  if (!committees.length) return result;
  const [allLinks, coverage] = await Promise.all([
    db.from('fec_candidate_committee').select('committee_id,candidate_id').eq('cycle', cycle).in('committee_id', committees),
    db.from('fec_individual_coverage').select('committee_id,last_success_at,receipt_count,total_amount').eq('cycle', cycle).in('committee_id', committees),
  ]);
  if (allLinks.error) throw allLinks.error;
  if (coverage.error) throw coverage.error;
  const linkCounts = new Map<string, number>();
  for (const row of allLinks.data ?? []) linkCounts.set(row.committee_id, (linkCounts.get(row.committee_id) ?? 0) + 1);
  const eligible = committees.filter(id => linkCounts.get(id) === 1);
  result.eligibleCommittees = eligible.length;
  result.excludedCommittees = committees.length - eligible.length;
  const published = (coverage.data ?? []).filter(row => eligible.includes(row.committee_id));
  result.coveredCommittees = published.length;
  if (!published.length) return result;
  result.refreshedAt = published.map(row => row.last_success_at).sort()[0];
  result.count = published.reduce((sum, row) => sum + Number(row.receipt_count), 0);
  result.total = published.reduce((sum, row) => sum + Math.round(Number(row.total_amount) * 100), 0) / 100;
  const ids = published.map(row => row.committee_id);
  const pageNumber = requestedPage && /^\d{1,8}$/.test(requestedPage) ? Number(requestedPage) : 1;
  result.page = Math.max(1, Math.min(pageNumber, Math.max(1, Math.ceil(result.count / CONTRIBUTION_PAGE_SIZE))));
  const offset = (result.page - 1) * CONTRIBUTION_PAGE_SIZE;

  const loadGroups = async () => {
    const groups = { employer: new Map<string | null, IndividualGroup>(), occupation: new Map<string | null, IndividualGroup>() };
    for (let start = 0; ; start += 500) {
      const response = await db.from('fec_individual_group_totals').select('receiving_committee_id,kind,label,total_amount,contribution_count')
        .eq('cycle', cycle).in('receiving_committee_id', ids)
        .order('receiving_committee_id').order('kind').order('label', { nullsFirst: false }).range(start, start + 499);
      if (response.error) throw response.error;
      for (const row of response.data ?? []) {
        if (row.kind !== 'employer' && row.kind !== 'occupation') throw new Error('Unknown contribution grouping');
        const map = groups[row.kind as keyof typeof groups];
        const previous = map.get(row.label);
        map.set(row.label, { label: row.label,
          total: ((previous ? Math.round(previous.total * 100) : 0) + Math.round(Number(row.total_amount) * 100)) / 100,
          count: (previous?.count ?? 0) + Number(row.contribution_count) });
      }
      if ((response.data?.length ?? 0) < 500) break;
    }
    return groups;
  };
  const [receipts, groups] = await Promise.all([
    db.from('fec_individual_contribution').select('sub_id,contributor_name,receiving_committee_id,employer,occupation,city,state,amount,receipt_date,source_url')
      .eq('cycle', cycle).in('receiving_committee_id', ids)
      .order('receipt_date', { ascending: false, nullsFirst: false }).order('sub_id', { ascending: false }).order('receiving_committee_id')
      .range(offset, offset + CONTRIBUTION_PAGE_SIZE - 1),
    loadGroups(),
  ]);
  if (receipts.error) throw receipts.error;
  result.receipts = (receipts.data ?? []) as IndividualReceipt[];
  const sortGroups = (map: Map<string | null, IndividualGroup>) => [...map.values()].sort((a, b) => b.total - a.total || (a.label ?? '').localeCompare(b.label ?? ''));
  result.employers = sortGroups(groups.employer);
  result.occupations = sortGroups(groups.occupation);
  return result;
}
