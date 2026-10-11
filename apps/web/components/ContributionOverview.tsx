import Link from 'next/link';
import ContributionKindLinks from './ContributionKindLinks';
import ContributionBars from './ContributionBars';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { contributionHref } from '@/lib/contributionFilters';
import { getContributionMonths, getContributionOverview, type ContributionMonth } from '@/lib/repositories/contributionOverview';
import { getPublishedContributionBrief } from '@/lib/repositories/briefs';

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' }) : 'Not available';

function MonthChart({ months, kind, cycle }: { months: ContributionMonth[]; kind: 'committees' | 'individuals'; cycle: number }) {
  return <Card><CardHeader><CardTitle className="text-lg">{kind === 'committees' ? 'Party & PAC' : 'Individual'} contributions by month</CardTitle><p className="text-xs text-muted-foreground">Signed amounts by receipt date. Select a month to see its transactions.</p></CardHeader><CardContent>
    {months.length ? <ContributionBars label={`${kind} monthly totals`} rows={months.map(row => ({
      label: row.month ? new Date(`${row.month}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Date not reported', total: row.total, count: row.count,
      href: row.month ? contributionHref(kind, cycle, { from: row.month, to: new Date(Date.UTC(Number(row.month.slice(0, 4)), Number(row.month.slice(5, 7)), 0)).toISOString().slice(0, 10) }) : undefined,
    }))} /> : <p className="text-sm text-muted-foreground">No published records available.</p>}
  </CardContent></Card>;
}

export default async function ContributionOverview({ memberId, cycle }: { memberId: string; cycle?: string }) {
  let data;
  try { data = await getContributionOverview(memberId, cycle); }
  catch { return <div className="space-y-5"><ContributionKindLinks kind="overview" /><p role="status">Contribution summaries are temporarily unavailable. Please try again.</p></div>; }
  const { committees, individuals } = data;
  const period = committees.cycle;
  if (!period) return <div className="space-y-5"><ContributionKindLinks kind="overview" /><p>No reporting periods have been published yet.</p></div>;
  // A chart or editorial outage must not hide already available contribution totals.
  const [committeeMonths, individualMonths, briefResult] = await Promise.allSettled([
    getContributionMonths(period, committees.committeeIds, 'committees'),
    getContributionMonths(period, individuals.committeeIds, 'individuals'),
    getPublishedContributionBrief(memberId, period),
  ]);
  const brief = briefResult.status === 'fulfilled' ? briefResult.value : null;
  return <div className="space-y-6">
    <ContributionKindLinks kind="overview" cycle={period} />
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-semibold">Campaign contribution overview</h2><p className="mt-1 text-sm text-muted-foreground">Follow reported contributions to this member’s campaigns.</p></div>
      <form className="flex items-end gap-2"><input type="hidden" name="tab" value="contributions" /><input type="hidden" name="contributionKind" value="overview" />
        <label className="text-xs font-medium text-muted-foreground">Reporting period<select name="cycle" defaultValue={period} className="mt-1 block h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">{committees.cycles.map(value => <option key={value} value={value}>{value - 1}–{value}</option>)}</select></label><Button variant="outline" type="submit">Apply</Button>
      </form>
    </div>
    {!committees.linked ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">A verified FEC candidate link is not available yet. This does not mean no contributions were received.</p> : <>
      <div className="grid gap-4 md:grid-cols-2">{[
        { title: 'Reported party & PAC contributions', value: committees.committeeIds.length ? money(committees.total) : 'Not available', note: committees.nationwide ? 'Nationwide import completed' : 'Partial nationwide coverage', updated: committees.refreshedAt, kind: 'committees' as const },
        { title: 'Available itemized individual contributions', value: individuals.coveredCommittees ? money(individuals.total) : 'Not available', note: `${individuals.coveredCommittees} of ${individuals.eligibleCommittees} eligible campaigns covered`, updated: individuals.refreshedAt, kind: 'individuals' as const },
      ].map(item => <Card key={item.kind}><CardContent className="p-5"><p className="text-sm font-medium text-muted-foreground">{item.title}</p><p className="mt-3 break-words text-3xl font-semibold tabular-nums">{item.value}</p><p className="mt-3 text-sm">{item.note}</p><p className="mt-1 text-xs text-muted-foreground">{item.kind === 'individuals' ? 'Oldest campaign refresh' : 'Updated'}: {date(item.updated)}</p><Link href={contributionHref(item.kind, period)} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Explore transactions →</Link></CardContent></Card>)}</div>
      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">These are separate categories of available records, not total campaign fundraising. Amounts retain signed corrections and are before refunds. Unitemized donations, independent spending, loans, and joint-fundraising transfers are excluded. Record counts are not unique donor counts.
        {committees.excludedCommittees ? <p className="mt-2">{committees.excludedCommittees} ambiguously linked campaign committee{committees.excludedCommittees === 1 ? ' is' : 's are'} excluded.</p> : null}
      </div>
      {brief ? <Card><CardHeader><p className="text-xs font-semibold uppercase tracking-wide text-primary">Contribution brief · {period - 1}–{period}</p><CardTitle className="font-serif text-2xl"><Link href={`/briefs/${brief.slug}`} className="hover:underline">{brief.title}</Link></CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{brief.dek}</p><Link href={`/briefs/${brief.slug}`} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">Read the overview →</Link></CardContent></Card> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-lg">Top party & PAC contributors</CardTitle><p className="text-xs text-muted-foreground">Select a group to explore its transactions.</p></CardHeader><CardContent>{committees.groups.length ? <ContributionBars label="Top committee contributions" rows={committees.groups.slice(0, 5).map(group => ({ label: group.group_name, total: group.total_amount, count: group.contribution_count, href: contributionHref('committees', period, group.giving_committee_id ? { committee: group.giving_committee_id } : { reportedGroup: group.group_name }) }))} /> : <p className="text-sm text-muted-foreground">No attributable committee records available.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-lg">Individuals by reported employer</CardTitle><p className="text-xs text-muted-foreground">Contributions by people reporting an employer, not by the employer itself. Spelling variants remain separate.</p></CardHeader><CardContent>{individuals.employers.some(group => group.label) ? <ContributionBars label="Top reported employer groupings" rows={individuals.employers.filter(group => group.label).slice(0, 5).map(group => ({ label: group.label!, total: group.total, count: group.count, href: contributionHref('individuals', period, { employer: group.label! }) }))} /> : <p className="text-sm text-muted-foreground">No named employer groups available.</p>}{individuals.employers.find(group => group.label === null) ? <p className="mt-4 text-xs text-muted-foreground">Employer not reported: {money(individuals.employers.find(group => group.label === null)!.total)}</p> : null}</CardContent></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">{committeeMonths.status === 'fulfilled' ? <MonthChart months={committeeMonths.value} kind="committees" cycle={period} /> : <p role="status">Committee trends are temporarily unavailable.</p>}{individualMonths.status === 'fulfilled' ? <MonthChart months={individualMonths.value} kind="individuals" cycle={period} /> : <p role="status">Individual trends are temporarily unavailable.</p>}</div>
    </>}
  </div>;
}
