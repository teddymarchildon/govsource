import 'server-only';
import { getMemberContributions } from './contributions';
import { getMemberIndividualContributions } from './individualContributions';
import { createClient } from '@/utils/supabase/server';

export async function getContributionOverview(memberId: string, cycle?: string) {
  const [committees, individuals] = await Promise.all([
    getMemberContributions(memberId, cycle), getMemberIndividualContributions(memberId, cycle),
  ]);
  if (committees.cycle !== individuals.cycle) throw new Error('Reporting periods changed. Please try again.');
  return { committees, individuals };
}

export type ContributionMonth = { month: string | null; total: number; count: number };
export async function getContributionMonths(cycle: number, committeeIds: string[], kind: 'committees' | 'individuals'): Promise<ContributionMonth[]> {
  if (!committeeIds.length) return [];
  const db = await createClient();
  const months = new Map<string | null, ContributionMonth>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('fec_contribution_month_totals')
      .select('receiving_committee_id,month,total_amount,contribution_count').eq('cycle', cycle).eq('kind', kind)
      .in('receiving_committee_id', committeeIds).order('receiving_committee_id').order('month', { nullsFirst: false })
      .range(offset, offset + 499);
    if (error) throw error;
    for (const row of data ?? []) {
      const previous = months.get(row.month);
      months.set(row.month, { month: row.month,
        total: (Math.round((previous?.total ?? 0) * 100) + Math.round(Number(row.total_amount) * 100)) / 100,
        count: (previous?.count ?? 0) + Number(row.contribution_count) });
    }
    if ((data?.length ?? 0) < 500) break;
  }
  return [...months.values()].sort((a, b) => a.month === null ? 1 : b.month === null ? -1 : a.month.localeCompare(b.month));
}
