import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { contributionHref, type ContributionFilters as Filters } from '@/lib/contributionFilters';

export default function ContributionFilters({ kind, cycle, filters }: { kind: 'committees' | 'individuals'; cycle: number; filters: Filters }) {
  return <form className="mb-5 space-y-3 rounded-lg border border-border bg-muted/20 p-4" role="search" aria-label="Filter contribution transactions">
    <input type="hidden" name="tab" value="contributions" />
    <input type="hidden" name="contributionKind" value={kind} />
    <input type="hidden" name="cycle" value={cycle} />
    {filters.reportedGroup ? <input type="hidden" name="reportedGroup" value={filters.reportedGroup} /> : null}
    {filters.committee ? <input type="hidden" name="committee" value={filters.committee} /> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[
        ['contributor', 'Contributor name', 'search'],
        ...(kind === 'individuals' ? [['employer', 'Reported employer (exact)', 'text'], ['occupation', 'Reported occupation (exact)', 'text']] : []),
        ['from', 'From receipt date', 'date'], ['to', 'Through receipt date', 'date'],
        ['min', 'Minimum amount ($)', 'number'], ['max', 'Maximum amount ($)', 'number'],
      ].map(([key, label, type]) => <label key={key} className="text-xs font-medium text-muted-foreground">{label}
        <input name={key} type={type} defaultValue={filters[key as keyof Filters] ?? ''} step={type === 'number' ? '0.01' : undefined}
          className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" />
      </label>)}
    </div>
    {filters.committee ? <p className="text-xs text-muted-foreground">Selected committee: {filters.committee}</p> : null}
    {filters.reportedGroup ? <p className="text-xs text-muted-foreground">Reported group: {filters.reportedGroup} · Committee ID unavailable</p> : null}
    <div className="flex items-center gap-4"><Button variant="outline" size="sm" type="submit">Filter transactions</Button><Link href={contributionHref(kind, cycle)} className="text-sm text-primary hover:underline">Clear filters</Link></div>
    <p className="text-xs text-muted-foreground">Filters apply to transactions. Summary totals above cover the full reporting period.</p>
  </form>;
}
