import Link from 'next/link';
import { ArrowUpRight, HandCoins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { CONTRIBUTION_PAGE_SIZE, getMemberContributions } from '@/lib/repositories/contributions';

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const date = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const committeeUrl = (id: string, cycle: number) => `https://www.fec.gov/data/committee/${id}/?cycle=${cycle}`;
const sourceUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ['docquery.fec.gov', 'www.fec.gov'].includes(parsed.hostname) ? url : null;
  } catch { return null; }
};

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">{children}</div>;
}

export default async function CampaignContributions({ memberId, cycle, page }: { memberId: string; cycle?: string; page?: string }) {
  let data;
  try {
    data = await getMemberContributions(memberId, cycle, page);
  } catch {
    console.error('Campaign contribution lookup failed', { memberId });
    return <EmptyState>Campaign contributions are temporarily unavailable. <Link href={`?tab=contributions`} className="font-medium text-primary hover:underline">Try again</Link>.</EmptyState>;
  }
  const period = data.cycle;
  const href = (next: number) => `?tab=contributions&cycle=${period}&contributionPage=${next}`;
  const pageCount = Math.max(1, Math.ceil(data.count / CONTRIBUTION_PAGE_SIZE));
  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="flex items-center gap-2 text-xl font-semibold"><HandCoins className="h-5 w-5 text-primary" />Campaign contributions</h2><p className="mt-1 text-sm text-muted-foreground">Direct contributions from political parties and PACs to this member’s campaigns.</p></div>
      {period ? <form className="flex shrink-0 items-end gap-2" action={`/congress-members/${memberId}`}>
        <input type="hidden" name="tab" value="contributions" />
        <div className="space-y-1.5"><label htmlFor="contribution-cycle" className="block text-xs font-medium text-muted-foreground">Reporting period</label>
          <select id="contribution-cycle" name="cycle" defaultValue={period} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {data.cycles.map(value => <option key={value} value={value}>{value - 1}–{value}</option>)}
          </select></div>
        <Button type="submit" variant="outline">Apply</Button>
      </form> : null}
    </div>

    <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Party &amp; PAC contributions only</Badge>{data.refreshedAt ? <span className="text-xs">Updated {date(data.refreshedAt)}</span> : null}</div>
      <p className="mt-3">These reported amounts include signed corrections and are not net of refunds. Individual donations, independent spending, loans, and joint-fundraising transfers are not included. Reporting periods can contain receipts dated outside those years.</p>
      {period && !data.nationwide ? <p className="mt-2">This period has partial coverage; a nationwide import has not yet completed.</p> : null}
      {data.excludedCommittees ? <p className="mt-2">{data.excludedCommittees} campaign committee{data.excludedCommittees === 1 ? ' is' : 's are'} linked to multiple candidates. Their contributions are excluded from the totals and transactions below because attribution is uncertain.</p> : null}
    </div>

    {!period ? <EmptyState>No reporting periods have been published yet.</EmptyState>
      : !data.linked ? <EmptyState>A verified FEC candidate link is not yet available for this member. This does not mean they received no contributions.</EmptyState>
      : !data.count ? <EmptyState>No attributable party or PAC contributions are available for this member in {period - 1}–{period}. Missing records do not establish that no money was raised.</EmptyState>
      : <>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['Reported contributions', money(data.total), 'Signed amounts, before refunds'],
            ['Contributing groups', data.groups.length.toLocaleString('en-US'), 'Includes reported names with unresolved IDs'],
            ['Contribution records', data.count.toLocaleString('en-US'), `${period - 1}–${period} reporting period`],
          ].map(([label, value, helper]) => <Card key={label}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 break-words text-2xl font-bold lg:text-3xl">{value}</p><p className="mt-1 text-xs text-muted-foreground">{helper}</p></CardContent></Card>)}
        </div>

        <Card><CardHeader><CardTitle className="text-xl">Top contributing committees</CardTitle><p className="text-sm text-muted-foreground">The ten largest reported totals for this period.</p></CardHeader><CardContent>
          <ol className="divide-y divide-border/60">{data.groups.slice(0, 10).map((group, index) => <li key={group.giving_committee_id ?? group.group_name} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
            <div className="min-w-0 flex-1">{group.giving_committee_id ? <a className="text-sm font-medium text-primary hover:underline" href={committeeUrl(group.giving_committee_id, period)} target="_blank" rel="noopener noreferrer">{group.group_name}<ArrowUpRight aria-hidden="true" className="ml-1 inline h-3.5 w-3.5" /><span className="sr-only"> (FEC, opens in a new tab)</span></a> : <p className="text-sm font-medium">{group.group_name}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{group.contribution_count.toLocaleString('en-US')} records{!group.giving_committee_id ? ' · Committee ID unavailable' : ''}</p>
            </div><span className="shrink-0 text-sm font-semibold tabular-nums">{money(group.total_amount)}</span>
          </li>)}</ol>
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-xl">Contribution transactions</CardTitle><p className="text-sm text-muted-foreground">Most recent receipts first. Open a source record to review the original filing.</p></CardHeader><CardContent>
          <div className="relative overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Reported party and PAC contributions for {period - 1}–{period}</caption>
            <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th scope="col" className="pb-3 pr-4 font-medium">Contributor</th><th scope="col" className="whitespace-nowrap pb-3 pr-4 font-medium">Receipt date</th><th scope="col" className="pb-3 pr-4 text-right font-medium">Amount</th><th scope="col" className="pb-3 text-right font-medium">Source</th></tr></thead>
            <tbody>{data.receipts.map(receipt => <tr key={receipt.sub_id} className="border-b border-border/60 last:border-0">
              <td className="min-w-[13rem] py-3 pr-4"><p className="font-medium">{receipt.contributor_name}</p><a href={committeeUrl(receipt.receiving_committee_id, period)} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary hover:underline">To {receipt.receiving_committee_id}<span className="sr-only"> (FEC recipient committee)</span></a>{!receipt.giving_committee_id ? <p className="text-xs text-muted-foreground">Donor committee ID unavailable</p> : null}</td>
              <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{receipt.receipt_date ? date(receipt.receipt_date) : 'Not reported'}</td><td className="whitespace-nowrap py-3 pr-4 text-right font-medium tabular-nums">{money(Number(receipt.amount))}</td>
              <td className="py-3 text-right">{sourceUrl(receipt.source_url) ? <a href={sourceUrl(receipt.source_url)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">FEC<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /><span className="sr-only"> source for {receipt.contributor_name}, record {receipt.sub_id}</span></a> : <span className="text-muted-foreground">Unavailable</span>}</td>
            </tr>)}</tbody>
          </table></div>
          <nav aria-label="Contribution transaction pages" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground">Page {data.page} of {pageCount} · {data.count.toLocaleString('en-US')} records</p>
            <div className="flex gap-2">{data.page > 1 ? <Link scroll={false} href={href(data.page - 1)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Previous</Link> : <Button variant="outline" size="sm" disabled>Previous</Button>}{data.page < pageCount ? <Link scroll={false} href={href(data.page + 1)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Next</Link> : <Button variant="outline" size="sm" disabled>Next</Button>}</div>
          </nav>
        </CardContent></Card>
      </>}
  </div>;
}
