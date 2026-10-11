import Link from 'next/link';

export type ContributionBar = { label: string; total: number; href?: string; count?: number };
export default function ContributionBars({ rows, label }: { rows: ContributionBar[]; label: string }) {
  const max = Math.max(1, ...rows.map(row => Math.abs(row.total)));
  const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
  return <ol aria-label={label} className="space-y-4">
    {rows.map((row, index) => <li key={`${row.label}-${index}`}>
      <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
        <div className="min-w-0">{row.href ? <Link href={row.href} className="break-words font-medium text-primary hover:underline">{row.label}</Link> : <span className="break-words font-medium">{row.label}</span>}
          {row.count !== undefined ? <p className="text-xs text-muted-foreground">{row.count.toLocaleString('en-US')} records</p> : null}</div>
        <span className="shrink-0 font-semibold tabular-nums">{money(row.total)}</span>
      </div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${row.total < 0 ? 'bg-amber-600' : 'bg-primary/70'}`} style={{ width: `${Math.abs(row.total) / max * 100}%` }} /></div>
    </li>)}
  </ol>;
}
