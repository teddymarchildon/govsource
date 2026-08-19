'use client';

import Link from 'next/link';
import { Judge } from '../types/types';
import { Card, CardContent } from '@/components/ui/card';

interface JudgeCardProps {
  judge: Judge;
}

export default function JudgeCard({ judge }: JudgeCardProps) {
  const fullName = judge.full_name || `${judge.first_name} ${judge.last_name}`;

  return (
    <Card className="group h-full border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex h-full flex-col p-3 md:p-4">
        <div className="flex justify-between items-start mb-2">
          <span className="text-sm font-semibold text-muted-foreground">
            {'Federal Judge'}
          </span>
        </div>

        <Link
          href={`/judges/${judge.id}`}
          className="mb-3 block transition-colors group-hover:text-primary"
        >
          <h3 className="line-clamp-2 text-sm font-medium text-foreground md:text-base">
            {fullName}
          </h3>
        </Link>
      </CardContent>
    </Card>
  );
}
