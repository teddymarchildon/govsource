import { ContributionDataPending, verifyContributionFigures } from './contributionVerification';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildContributionBrief, contributionFingerprint, selectContributionDevelopment, type PriorEvidence } from './contributionBrief';
import { getMemberContributions } from './repositories/contributions';
import { getMemberIndividualContributions } from './repositories/individualContributions';

export function contributionImportCutoff(now: Date) {
  // A Sunday boundary should not invalidate a successful Saturday import.
  return new Date(now.getTime() - 8 * 86400000).toISOString();
}

export async function generateContributionBriefBatch(db: SupabaseClient, now?: Date) {
  const batchTime = now ?? new Date();
  const year = batchTime.getUTCFullYear();
  const cycle = year + year % 2;
  const cutoff = contributionImportCutoff(batchTime);
  const summary = { cycle, created: [] as number[], existing: 0, ineligible: 0, unchanged: 0, reason: '', waiting: [] as { memberId: number; reason: string }[], blocked: [] as { memberId: number; reason: string }[] };
  const coverage = await db.from('fec_sync_state').select('last_full_success_at').eq('cycle', cycle).maybeSingle();
  if (coverage.error) throw coverage.error;
  if (!coverage.data?.last_full_success_at || new Date(coverage.data.last_full_success_at) < new Date(cutoff)) {
    return { ...summary, waiting: [{ memberId: 0, reason: 'Nationwide committee import is stale.' }], reason: 'Waiting for a successful nationwide committee import.' };
  }
  // Pagination matters once this is no longer a five-article pilot.
  const existing: { id: number; primary_item_id: number; status: string; generation_metadata: { fingerprint?: string; evidence?: PriorEvidence } }[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await db.from('brief').select('id,primary_item_id,status,generation_metadata')
      .eq('primary_item_type', 'campaign_finance').eq('contribution_cycle', cycle)
      .order('id', { ascending: false }).range(offset, offset + 499);
    if (page.error) throw page.error;
    existing.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 500) break;
  }
  summary.existing = existing.length;
  const candidates = new Set<number>();
  for (let offset = 0; ; offset += 500) {
    const page = await db.from('fec_candidate').select('candidate_id,congressman_id')
      .not('congressman_id', 'is', null).order('candidate_id').range(offset, offset + 499);
    if (page.error) throw page.error;
    for (const row of page.data ?? []) candidates.add(Number(row.congressman_id));
    if ((page.data?.length ?? 0) < 500) break;
  }
  // Least recently covered first prevents repeated small-ID failures from
  // starving other campaigns. A time bound is not a lifetime article cap.
  const latestId = (id: number) => existing.find(row => row.primary_item_id === id)?.id ?? 0;
  const deadline = Date.now() + 15 * 60 * 1000;
  for (const id of [...candidates].sort((a, b) => latestId(a) - latestId(b) || a - b)) {
    if (Date.now() >= deadline) return { ...summary, reason: 'Time budget reached; remaining campaigns resume on the next run.' };
    const prior = existing.filter(row => row.primary_item_id === id);
    // Never overwrite editorial work or accumulate drafts for the same member.
    if (prior.some(row => ['draft', 'review', 'scheduled'].includes(row.status))) { summary.unchanged++; continue; }
    try {
      const [committees, individuals] = await Promise.all([
        getMemberContributions(String(id), String(cycle), undefined, {}, db),
        getMemberIndividualContributions(String(id), String(cycle), undefined, {}, db),
      ]);
      if (committees.cycle !== cycle || individuals.cycle !== cycle || !committees.linked || !individuals.linked
        || !individuals.coveredCommittees || individuals.coveredCommittees !== individuals.eligibleCommittees
        || !individuals.refreshedAt || new Date(individuals.refreshedAt) < new Date(cutoff)
        || (!committees.count && !individuals.count)) { summary.ineligible++; continue; }
      const fingerprint = contributionFingerprint(committees, individuals);
      if (prior.some(row => row.generation_metadata?.fingerprint === fingerprint)) { summary.unchanged++; continue; }
      // Unknown legacy evidence cannot establish a change safely.
      const baseline = prior[0]?.generation_metadata?.evidence;
      if (prior.length && !baseline) { summary.unchanged++; continue; }
      const selection = selectContributionDevelopment(committees, individuals, baseline);
      if (!selection.selected) { summary.unchanged++; continue; }
      const verification = await verifyContributionFigures(committees, individuals, now ?? new Date());
      const member = await db.from('congressman').select('id,full_name').eq('id', id).single();
      if (member.error) throw member.error;
      const draft = buildContributionBrief(member.data, committees, individuals, verification);
      // Atomic staging shares the daily editorial admission limit with the other
      // source types and rechecks duplicates and pending editorial work.
      const saved = await db.rpc('stage_contribution_brief', { p_draft: { ...draft,
        title: `${member.data.full_name}: reported contributions through ${verification.coverageEnd}`.slice(0, 180),
        slug: `${draft.slug}-${fingerprint.slice(0, 16)}`,
        author_name: 'GovSource',
        generation_metadata: { ...draft.generation_metadata, trigger: 'contribution-continuous', fingerprint,
          selection: { ...selection, version: 'reader-value-finance-v1', prior_brief_id: prior[0]?.id ?? null,
            reader_question: 'What does the reported funding mix reveal, and what can voters not infer from these records?',
            affected_audience: 'Voters evaluating this member’s campaign financing',
            editorial_review_required: true } },
      } });
      if (saved.error) throw saved.error;
      if (saved.data === null) return { ...summary, reason: 'Daily editorial draft allowance reached; resume tomorrow.' };
      if (saved.data > 0) summary.created.push(Number(saved.data));
      else summary.unchanged++;
    } catch (error) {
      (error instanceof ContributionDataPending ? summary.waiting : summary.blocked).push({ memberId: id, reason: error instanceof Error ? error.message : 'Contribution verification or persistence failed.' });
      // One campaign's reconciliation failure must not stop unrelated coverage.
    }
  }
  return { ...summary, reason: 'Selected developments staged for editorial review; public articles unchanged.' };
}
