import type { MemberContributions } from './repositories/contributions';
import type { IndividualContributions } from './repositories/individualContributions';
import type { BriefPoint } from '@/types/brief';

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const date = (value: string | null) => value ? new Date(value).toISOString().slice(0, 10) : 'unavailable';

export function buildContributionBrief(member: { id: number; full_name: string }, committees: MemberContributions, individuals: IndividualContributions) {
  const cycle = committees.cycle;
  if (!cycle || cycle !== individuals.cycle || !committees.linked || !individuals.linked) throw new Error('A verified candidate link and matching published reporting period are required.');
  if (!committees.committeeIds.length && !individuals.coveredCommittees) throw new Error('No attributable campaign coverage is available for this reporting period.');
  if (!committees.count && !individuals.count) throw new Error('No contribution records are available to summarize for this reporting period.');
  const period = `${cycle - 1}–${cycle}`;
  const source = (kind: 'committees' | 'individuals', ids: string[]) => {
    const params = new URLSearchParams({ two_year_transaction_period: String(cycle) });
    ids.forEach(id => params.append('committee_id', id));
    if (kind === 'committees') { params.append('line_number', 'F3-11B'); params.append('line_number', 'F3-11C'); }
    else params.set('line_number', 'F3-11AI');
    return { id: kind, label: kind === 'committees' ? `FEC party and PAC receipts, ${period}` : `FEC itemized individual receipts, ${period}`,
      url: `https://www.fec.gov/data/receipts/${kind === 'individuals' ? 'individual-contributions/' : ''}?${params}` };
  };
  const sources = [
    ...(committees.committeeIds.length ? [source('committees', committees.committeeIds)] : []),
    ...(individuals.committeeIds.length ? [source('individuals', individuals.committeeIds)] : []),
  ];
  const points: BriefPoint[] = [];
  const add = (label: string, text: string, refs: string[]) => points.push({ id: `point_${points.length + 1}`, label, text, source_refs: refs });
  add('Party and PAC contributions', committees.committeeIds.length
    ? `Available party and PAC records total ${money(committees.total)} across ${committees.count.toLocaleString('en-US')} transactions in the ${period} reporting period. These are signed reported amounts before refunds.${!committees.nationwide ? ' Nationwide coverage is incomplete.' : ''}`
    : 'No unambiguously attributable party or PAC campaign coverage is available for this period. This does not establish that no contributions were received.', committees.committeeIds.length ? ['committees'] : ['primary']);
  const top = committees.groups[0];
  if (top && top.total_amount > 0) add('Largest reported committee grouping', `${top.group_name} has the largest available party/PAC group total at ${money(top.total_amount)}, across ${top.contribution_count.toLocaleString('en-US')} records.${!top.giving_committee_id ? ' Its committee ID is unresolved; this grouping uses the reported name.' : ''}`, ['committees']);
  add('Itemized individual contributions', individuals.coveredCommittees
    ? `Available itemized individual records total ${money(individuals.total)} across ${individuals.count.toLocaleString('en-US')} transactions, covering ${individuals.coveredCommittees} of ${individuals.eligibleCommittees} eligible campaigns. Unitemized donations are excluded, refunds are not subtracted, and transaction counts are not unique donor counts.`
    : 'Individual contribution coverage is not yet available for this period. Missing coverage does not mean that no individual contributions were received.', individuals.coveredCommittees ? ['individuals'] : ['primary']);
  const employer = individuals.employers.find(group => group.label !== null && group.total > 0);
  if (employer) add('By reported employer', `The largest named employer grouping is ${employer.label}, totaling ${money(employer.total)} from people reporting that value. This is not a contribution by the employer. Only capitalization and spacing are normalized; spelling variants remain separate.`, ['individuals']);
  const excluded = Math.max(committees.excludedCommittees, individuals.excludedCommittees);
  add('Scope and coverage', `These records do not establish total campaign fundraising or political influence. They retain signed corrections and exclude independent spending, loans, and joint-fundraising transfers.${excluded ? ` ${excluded} ambiguously linked campaign committee${excluded === 1 ? ' is' : 's are'} excluded.` : ''} Receipt dates can fall outside the reporting period.`, ['primary']);
  return {
    title: `${member.full_name}: contributions in ${period}`.slice(0, 180),
    slug: `contributions-${member.id}-${cycle}`,
    dek: `A source-linked overview of available campaign contribution records for ${period}, with party/PAC and itemized individual amounts shown separately.`,
    points,
    context_markdown: `Party/PAC data as of: ${date(committees.refreshedAt)}. Oldest covered individual campaign refresh: ${date(individuals.refreshedAt)}.\n\nThis overview reflects the data available when drafted. It does not update automatically. FEC source searches may show newer filings. Summary figures cover attributable campaign committees only. Missing employer and occupation values remain separate from named groups.`,
    primary_item_type: 'campaign_finance' as const,
    primary_item_id: member.id,
    contribution_cycle: cycle,
    policy_areas: ['Campaign finance'], sources, status: 'review' as const,
    auto_generated: false,
    editor_notes: 'Generated from calculated contribution summaries using a factual template. Review coverage and sources before publishing.',
    generation_metadata: { method: 'contribution-template', cycle, generated_at: new Date().toISOString(),
      evidence: {
        committees: { total: committees.total, count: committees.count, top: committees.groups.slice(0, 10), committeeIds: committees.committeeIds, refreshedAt: committees.refreshedAt, nationwide: committees.nationwide, excludedCommittees: committees.excludedCommittees },
        individuals: { total: individuals.total, count: individuals.count, employers: individuals.employers.slice(0, 10), committeeIds: individuals.committeeIds, refreshedAt: individuals.refreshedAt, coveredCommittees: individuals.coveredCommittees, eligibleCommittees: individuals.eligibleCommittees, excludedCommittees: individuals.excludedCommittees },
      } },
  };
}
