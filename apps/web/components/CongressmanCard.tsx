import Link from 'next/link';
import { Congressman } from '../types/types';
import { ArrowUpRight, Landmark, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  getInitials,
  getMemberRole,
  getPartyBadgeClass,
  getPartyLabel,
} from '@/components/directory/directoryUtils';

interface CongressmanCardProps {
  congressman: Congressman;
}

export default function CongressmanCard({ congressman }: CongressmanCardProps) {
  return (
    <Card className="group relative flex h-full overflow-hidden border-border/80 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg focus-within:ring-2 focus-within:ring-primary/30">
      <CardContent className="flex w-full flex-col p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary ring-1 ring-primary/15">
            {getInitials(congressman.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <Landmark className="h-3.5 w-3.5" /> Congress
              </span>
              <Badge variant="outline" className={getPartyBadgeClass(congressman.party)}>
                {getPartyLabel(congressman.party)}
              </Badge>
            </div>
            <h2 className="text-lg font-semibold leading-snug text-foreground">
              <Link href={`/congress-members/${congressman.id}`} className="after:absolute after:inset-0 group-hover:text-primary">
                {congressman.full_name}
              </Link>
            </h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{getMemberRole(congressman)}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-4 text-sm text-muted-foreground">
          {congressman.phone && (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              {congressman.phone}
            </span>
          )}
          {congressman.website && (
            <a href={congressman.website} target="_blank" rel="noopener noreferrer" className="relative z-10 ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline">
              Official site <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
