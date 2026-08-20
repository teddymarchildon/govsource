import Link from 'next/link';
import { CheckCircle2, UserRound } from 'lucide-react';

import { PublicRecordCard } from '@/components/listing/PublicRecordCard';
import { Badge } from '@/components/ui/badge';
import type { Law } from '@/types/types';
import { getPolicyAreaColors } from '@/utils/policyColors';
import { formatDate } from '@/utils/utils';

interface LawCardProps {
  law: Law;
}

export default function LawCard({ law }: LawCardProps) {
  const lawIdentifier = `${law.law_type || 'Public Law'} ${law.law_number}`;
  const originatingBill = `${law.type.toUpperCase()}. ${law.number}`;

  return (
    <PublicRecordCard
      href={`/laws/${law.id}`}
      eyebrow={`Federal law · ${lawIdentifier}`}
      title={law.law_title || law.title}
      tone="enacted"
      badge={law.policy_area ? (
        <Badge
          variant="outline"
          title={law.policy_area}
          className={`max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap text-[10px] ${getPolicyAreaColors(law.policy_area)}`}
        >
          {law.policy_area}
        </Badge>
      ) : null}
      footer={(
        <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {law.sponsor ? (
            <span>
              Sponsored by{' '}
              <Link href={`/congress-members/${law.sponsor.id}`} className="relative z-10 font-medium text-primary hover:underline">
                {law.sponsor.full_name}
              </Link>{' '}
              <span>({law.sponsor.party}-{law.sponsor.state})</span>
            </span>
          ) : (
            <span>Sponsor not listed</span>
          )}
        </div>
      )}
    >
      <div className="rounded-lg bg-[hsl(var(--trust)/0.08)] px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--trust))]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Enacted {law.law_enacted_date ? formatDate(law.law_enacted_date) : 'date unavailable'}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Originated as {originatingBill} · {law.congress}th Congress
        </p>
      </div>
    </PublicRecordCard>
  );
}
