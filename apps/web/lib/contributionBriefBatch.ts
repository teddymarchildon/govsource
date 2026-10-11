import type { SupabaseClient } from '@supabase/supabase-js';
import { buildContributionBrief } from './contributionBrief';
import { getMemberContributions } from './repositories/contributions';
import { getMemberIndividualContributions } from './repositories/individualContributions';

export const CONTRIBUTION_PILOT_SIZE = 5;

// Require both imports to have published this UTC week before drafting the pilot.
export function contributionImportCutoff(now: Date) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start.toISOString();
}

export async function generateContributionBriefBatch(db: SupabaseClient, now = new Date()) {
  const year = now.getUTCFullYear();
  const cycle = year + year % 2;
  const cutoff = contributionImportCutoff(now);
  const summary = { cycle, created: [] as number[], existing: 0, ineligible: 0, reason: '' };
  const coverage = await db.from('fec_sync_state').select('last_full_success_at').eq('cycle', cycle).maybeSingle();
  if (coverage.error) throw coverage.error;
  if (!coverage.data?.last_full_success_at || new Date(coverage.data.last_full_success_at) < new Date(cutoff)) {
    return { ...summary, reason: 'Waiting for a successful nationwide committee import this week.' };
  }
  const existing = await db.from('brief').select('primary_item_id', { count: 'exact' })
    .eq('primary_item_type', 'campaign_finance').eq('contribution_cycle', cycle);
  if (existing.error) throw existing.error;
  summary.existing = existing.count ?? 0;
  // Count all statuses, including archived and published, so reviews never cause more pilot drafts.
  const remaining = Math.max(0, CONTRIBUTION_PILOT_SIZE - summary.existing);
  if (!remaining) return { ...summary, reason: 'Pilot cap reached; existing briefs were left unchanged.' };
  const seen = new Set<number>((existing.data ?? []).map(row => Number(row.primary_item_id)));
  const candidates = new Set<number>();
  for (let offset = 0; ; offset += 500) {
    const page = await db.from('fec_candidate').select('candidate_id,congressman_id')
      .not('congressman_id', 'is', null).order('candidate_id').range(offset, offset + 499);
    if (page.error) throw page.error;
    for (const row of page.data ?? []) candidates.add(Number(row.congressman_id));
    if ((page.data?.length ?? 0) < 500) break;
  }
  for (const id of [...candidates].sort((a, b) => a - b)) {
    if (summary.created.length >= remaining) break;
    if (seen.has(id)) continue;
    const [committees, individuals] = await Promise.all([
      getMemberContributions(String(id), String(cycle), undefined, {}, db),
      getMemberIndividualContributions(String(id), String(cycle), undefined, {}, db),
    ]);
    if (committees.cycle !== cycle || individuals.cycle !== cycle || !committees.linked || !individuals.linked
      || !individuals.coveredCommittees || individuals.coveredCommittees !== individuals.eligibleCommittees
      || !individuals.refreshedAt || new Date(individuals.refreshedAt) < new Date(cutoff)
      || (!committees.count && !individuals.count)) {
      summary.ineligible++;
      continue;
    }
    const member = await db.from('congressman').select('id,full_name').eq('id', id).single();
    if (member.error) throw member.error;
    const draft = buildContributionBrief(member.data, committees, individuals);
    const inserted = await db.from('brief').insert({ ...draft,
      // Keep these outside the verified-job publication pipeline; review is always manual.
      status: 'review', auto_generated: false,
      generation_metadata: { ...draft.generation_metadata, trigger: 'contribution-pilot-job' },
    }).select('id').single();
    if (inserted.error?.code === '23505') {
      const concurrent = await db.from('brief').select('id').eq('primary_item_type', 'campaign_finance')
        .eq('primary_item_id', id).eq('contribution_cycle', cycle).maybeSingle();
      if (concurrent.error || !concurrent.data) throw inserted.error;
      // A concurrent admin creation uses a pilot slot too.
      summary.existing++;
      if (summary.existing + summary.created.length >= CONTRIBUTION_PILOT_SIZE) break;
      continue;
    }
    if (inserted.error) throw inserted.error;
    summary.created.push(inserted.data.id);
  }
  return { ...summary, reason: 'Pilot complete; new briefs await editorial review.' };
}
