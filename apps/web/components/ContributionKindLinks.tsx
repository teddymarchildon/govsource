import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function ContributionKindLinks({ kind, cycle }: { kind: 'committees' | 'individuals'; cycle?: number | null }) {
  return <nav aria-label="Contribution type" className="flex flex-wrap gap-2">
    {(['committees', 'individuals'] as const).map(value => <Link key={value} scroll={false}
      href={`?tab=contributions&contributionKind=${value}${cycle ? `&cycle=${cycle}` : ''}`}
      aria-current={kind === value ? 'page' : undefined}
      className={buttonVariants({ variant: kind === value ? 'default' : 'outline', size: 'sm' })}>
      {value === 'committees' ? 'Parties & PACs' : 'Individuals'}
    </Link>)}
  </nav>;
}
