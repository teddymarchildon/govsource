import Link from 'next/link';
import { Judge } from '../types/types';
import { ArrowRight, Scale } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getInitials, getJudgeName } from '@/components/directory/directoryUtils';

interface JudgeCardProps {
  judge: Judge;
}

export default function JudgeCard({ judge }: JudgeCardProps) {
  const fullName = getJudgeName(judge);

  return (
    <Card className="group relative h-full overflow-hidden border-border/80 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg focus-within:ring-2 focus-within:ring-primary/30">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary ring-1 ring-primary/15">
            {getInitials(fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <Scale className="h-3.5 w-3.5" /> Supreme Court justice
            </span>
            <h2 className="mt-2 text-lg font-semibold leading-snug text-foreground">
              <Link href={`/judges/${judge.id}`} className="after:absolute after:inset-0 group-hover:text-primary">
                {fullName}
              </Link>
            </h2>
          </div>
        </div>
        <div className="mt-5 flex items-center border-t border-border/60 pt-4 text-sm font-medium text-primary">
          View authored opinions <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </CardContent>
    </Card>
  );
}
