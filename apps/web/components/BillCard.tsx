import Link from 'next/link';
import { Clock3, UserRound } from 'lucide-react';

import { PublicRecordCard } from '@/components/listing/PublicRecordCard';
import { Badge } from '@/components/ui/badge';
import type { Bill } from '@/types/types';
import { getPolicyAreaColors } from '@/utils/policyColors';
import { formatDate } from '@/utils/utils';

interface BillCardProps {
  bill: Bill;
}

export default function BillCard({ bill }: BillCardProps) {
  const sponsor = bill.sponsor?.congressman;
  const billIdentifier = `${bill.type.toUpperCase()}. ${bill.number}`;

  return (
    <PublicRecordCard
      href={`/bills/${bill.id}`}
      eyebrow={`Bill · ${billIdentifier}`}
      title={bill.title}
      badge={bill.policy_area ? (
        <Badge
          variant="outline"
          title={bill.policy_area}
          className={`max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap text-[10px] ${getPolicyAreaColors(bill.policy_area)}`}
        >
          {bill.policy_area}
        </Badge>
      ) : null}
      footer={(
        <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {sponsor ? (
            <span>
              Sponsored by{' '}
              <Link href={`/congress-members/${sponsor.id}`} className="relative z-10 font-medium text-primary hover:underline">
                {sponsor.full_name}
              </Link>{' '}
              <span>({sponsor.party}-{sponsor.state})</span>
            </span>
          ) : (
            <span>Sponsor not listed</span>
          )}
        </div>
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {bill.introduced_date ? <span>Introduced {formatDate(bill.introduced_date)}</span> : null}
        {bill.introduced_date ? <span aria-hidden="true">·</span> : null}
        <span>{bill.congress}th Congress</span>
      </div>

      {bill.most_recent_action ? (
        <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" /> Latest action
            {bill.most_recent_action.date ? <span>· {formatDate(bill.most_recent_action.date)}</span> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-foreground">
            {bill.most_recent_action.text || bill.most_recent_action.type}
          </p>
        </div>
      ) : null}
    </PublicRecordCard>
  );
}
