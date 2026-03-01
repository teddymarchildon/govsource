'use client';

import Link from 'next/link';
import { formatDate } from '@/utils/utils';
import { Law } from '@/types/types';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPolicyAreaColors } from "@/utils/policyColors";

interface LawCardProps {
  law: Law;
}

export default function LawCard({ law }: LawCardProps) {
  // Get the sponsor from the law object
  const sponsor = law.sponsor

  // Format law identifier (e.g., P.L. 117-5)
  const lawIdentifier = `${law.law_type || 'P.L.'} ${law.law_number}`;

  // Use law_enacted_date instead of enacted_date
  const formattedDate = law.law_enacted_date ? formatDate(law.law_enacted_date) : 'Unknown date';

  return (
    <Card className="group flex h-full flex-col border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-base">{lawIdentifier}</CardTitle>

          {law.policy_area ? (
            <Badge variant="outline" className={`max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-[10px] ${getPolicyAreaColors(law.policy_area)}`}>
              {law.policy_area}
            </Badge>
          ) : (
            <Badge variant="outline" className="whitespace-nowrap text-[10px]">
              Uncategorized
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow px-4 pb-2">
        <Link
          href={`/laws/${law.id}`}
          className="block transition-colors group-hover:text-primary"
        >
          <p className="line-clamp-3 text-sm font-medium text-foreground">
            {law.law_title || law.title}
          </p>
        </Link>
      </CardContent>
      <CardFooter className="p-4 pt-2">
        <div className="flex flex-col space-y-2 text-xs w-full">
          {sponsor && (
            <div className="text-muted-foreground">
              <span className="font-medium">Sponsored by:</span>{' '}
              <Link
                href={`/congressmen/${sponsor.id}`}
                className="text-primary hover:underline"
              >
                {sponsor.full_name}
              </Link>
              <span className="ml-1 text-muted-foreground/90">
                ({sponsor.party}-{sponsor.state})
              </span>
            </div>
          )}

          <div className="text-muted-foreground/90">
            <span className="font-medium">Enacted:</span> {formattedDate}
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
