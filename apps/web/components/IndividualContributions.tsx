import Link from 'next/link';
import { ArrowUpRight, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import ContributionKindLinks from '@/components/ContributionKindLinks';
import { CONTRIBUTION_PAGE_SIZE } from '@/lib/repositories/contributions';
import { getMemberIndividualContributions, type IndividualGroup } from '@/lib/repositories/individualContributions';

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const date = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">{children}</div>;
}
function GroupSummary({ title, groups }: { title: string; groups: IndividualGroup[] }) {
  const missing = groups.find(group => group.label === null);
  const named = groups.filter(group => group.label !== null);
  return <Card><CardHeader><CardTitle className="text-xl">{title}</CardTitle><p className="text-sm text-muted-foreground">Top ten reported totals from individual contributions.</p></CardHeader><CardContent>
    {named.length ? <ol className="divide-y divide-border/60">{named.slice(0, 10).map((group, index) => <li key={group.label} className="flex items-start gap-3 py-3 first:pt-0">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
      <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{group.label}</p><p className="mt-1 text-xs text-muted-foreground">{group.count.toLocaleString('en-US')} {group.count === 1 ? 'record' : 'records'}</p></div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{money(group.total)}</span>
    </li>)}</ol> : <p className="text-sm text-muted-foreground">No reported values are available.</p>}
    {missing ? <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">Not reported: {money(missing.total)} across {missing.count.toLocaleString('en-US')} records.</p> : null}
  </CardContent></Card>;
}

export default async function IndividualContributions({ memberId, cycle, page }: { memberId: string; cycle?: string; page?: string }) {
  let data;
  try { data = await getMemberIndividualContributions(memberId, cycle, page); }
  catch {
    console.error('Individual contribution lookup failed', { memberId });
    return <div className="space-y-6"><ContributionKindLinks kind="individuals" /><EmptyState>Individual contributions are temporarily unavailable. <Link href="?tab=contributions&contributionKind=individuals" className="font-medium text-primary hover:underline">Try again</Link>.</EmptyState></div>;
  }
  const period = data.cycle;
  const pageCount = Math.max(1, Math.ceil(data.count / CONTRIBUTION_PAGE_SIZE));
  const href = (next: number) => `?tab=contributions&contributionKind=individuals&cycle=${period}&contributionPage=${next}`;
  return <div className="space-y-6">
    <ContributionKindLinks kind="individuals" cycle={period} />
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="flex items-center gap-2 text-xl font-semibold"><Users className="h-5 w-5 text-primary" />Individual contributions</h2><p className="mt-1 text-sm text-muted-foreground">Itemized contributions reported by this member’s campaigns.</p></div>
      {period ? <form action={`/congress-members/${memberId}`} className="flex shrink-0 items-end gap-2">
        <input type="hidden" name="tab" value="contributions" /><input type="hidden" name="contributionKind" value="individuals" />
        <div className="space-y-1.5"><label htmlFor="individual-cycle" className="block text-xs font-medium text-muted-foreground">Reporting period</label>
          <select id="individual-cycle" name="cycle" defaultValue={period} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {data.cycles.map(value => <option key={value} value={value}>{value - 1}–{value}</option>)}
          </select></div><Button type="submit" variant="outline">Apply</Button>
      </form> : null}
    </div>
    <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Itemized individual records</Badge>{data.refreshedAt ? <span className="text-xs">{data.coveredCommittees > 1 ? 'Oldest campaign refresh' : 'Updated'} {date(data.refreshedAt)}</span> : null}</div>
      <p className="mt-3">These are reported individual transactions, not a complete total of individual fundraising. Unitemized donations are not included. Signed corrections are included; refunds are not subtracted. Record counts are not counts of unique donors.</p>
      <p className="mt-2">Employer totals represent contributions from people reporting that employer—not donations by the employer. Employer and occupation groupings normalize only capitalization and spacing; spelling variants remain separate. “Retired,” “self-employed,” and other reported values are retained.</p>
      {data.excludedCommittees ? <p className="mt-2">{data.excludedCommittees} campaign committee{data.excludedCommittees === 1 ? ' is' : 's are'} linked to multiple candidates and excluded because attribution is uncertain.</p> : null}
      {data.coveredCommittees > 0 && data.coveredCommittees < data.eligibleCommittees ? <p className="mt-2 font-medium">Partial coverage: {data.coveredCommittees} of {data.eligibleCommittees} eligible campaigns have individual records published. Totals below cover only those campaigns.</p> : null}
    </div>
    {!period ? <EmptyState>No reporting periods have been published yet.</EmptyState>
      : !data.linked ? <EmptyState>A verified FEC candidate link is not yet available for this member. This does not mean they received no individual contributions.</EmptyState>
      : !data.coveredCommittees ? <EmptyState>Individual contribution coverage is not yet available for this member in {period - 1}–{period}. Missing coverage does not mean no contributions were received.</EmptyState>
      : !data.count ? <EmptyState>The completed import found no attributable itemized individual records for the covered campaigns in {period - 1}–{period}. Unitemized donations are not included.</EmptyState>
      : <>
        <div className="grid gap-4 sm:grid-cols-3">{[
          ['Available itemized contributions', money(data.total), 'Signed amounts, before refunds'],
          ['Contribution records', data.count.toLocaleString('en-US'), 'Transactions, not unique people'],
          ['Campaigns covered', `${data.coveredCommittees} of ${data.eligibleCommittees}`, `${period - 1}–${period} reporting period`],
        ].map(([label, value, helper]) => <Card key={label}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 break-words text-2xl font-bold lg:text-3xl">{value}</p><p className="mt-1 text-xs text-muted-foreground">{helper}</p></CardContent></Card>)}</div>
        <div className="grid gap-6 lg:grid-cols-2"><GroupSummary title="By reported employer" groups={data.employers} /><GroupSummary title="By reported occupation" groups={data.occupations} /></div>
        <Card><CardHeader><CardTitle className="text-xl">Individual contribution transactions</CardTitle><p className="text-sm text-muted-foreground">Most recent receipts first. Reporting periods may include receipts dated outside those years.</p></CardHeader><CardContent>
          <div className="relative overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Itemized individual contributions in {period - 1}–{period}</caption>
            <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">{['Contributor', 'Reported employer / occupation', 'Receipt date', 'Amount', 'Source'].map(label => <th scope="col" key={label} className={`pb-3 pr-4 font-medium ${['Amount', 'Source'].includes(label) ? 'text-right' : ''}`}>{label}</th>)}</tr></thead>
            <tbody>{data.receipts.map(receipt => <tr key={`${receipt.receiving_committee_id}:${receipt.sub_id}`} className="border-b border-border/60 last:border-0">
              <td className="min-w-[12rem] py-3 pr-4"><p className="font-medium">{receipt.contributor_name}</p><p className="text-xs text-muted-foreground">{[receipt.city, receipt.state].filter(Boolean).join(', ') || 'Location not reported'}</p></td>
              <td className="min-w-[12rem] py-3 pr-4"><p>{receipt.employer || 'Employer not reported'}</p><p className="text-xs text-muted-foreground">{receipt.occupation || 'Occupation not reported'}</p></td>
              <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{receipt.receipt_date ? date(receipt.receipt_date) : 'Not reported'}</td>
              <td className="whitespace-nowrap py-3 pr-4 text-right font-medium tabular-nums">{money(Number(receipt.amount))}</td>
              <td className="py-3 text-right"><a href={safeSource(receipt.source_url, receipt.receiving_committee_id, period)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">FEC<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /><span className="sr-only"> source for record {receipt.sub_id}</span></a></td>
            </tr>)}</tbody>
          </table></div>
          <nav aria-label="Individual contribution pages" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground">Page {data.page} of {pageCount} · {data.count.toLocaleString('en-US')} records</p><div className="flex gap-2">
              {data.page > 1 ? <Link scroll={false} href={href(data.page - 1)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Previous</Link> : <Button variant="outline" size="sm" disabled>Previous</Button>}
              {data.page < pageCount ? <Link scroll={false} href={href(data.page + 1)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Next</Link> : <Button variant="outline" size="sm" disabled>Next</Button>}
            </div>
          </nav>
        </CardContent></Card>
      </>}
  </div>;
}

function safeSource(source: string, committee: string, cycle: number) {
  try {
    const url = new URL(source);
    if (url.protocol === 'https:' && ['www.fec.gov', 'docquery.fec.gov'].includes(url.hostname)) return source;
  } catch { /* Use the FEC receipt search when a source URL is missing or invalid. */ }
  return `https://www.fec.gov/data/receipts/individual-contributions/?committee_id=${committee}&two_year_transaction_period=${cycle}`;
}
