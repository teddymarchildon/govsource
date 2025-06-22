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
    <Card className="h-full flex flex-col hover:shadow-md transition-shadow duration-200">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-base">{lawIdentifier}</CardTitle>

          {law.policy_area ? (
            <Badge variant="secondary" className="truncate text-xs">
              {law.policy_area}
            </Badge>
          ) : (
            <Badge variant="outline" className="truncate text-xs">
              Uncategorized
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow px-4 pb-2">
        <Link
          href={`/laws/${law.id}`}
          className="block hover:text-blue-600 transition-colors"
        >
          <p className="text-sm font-medium text-gray-900 line-clamp-3">
            {law.law_title || law.title}
          </p>
        </Link>
      </CardContent>
      <CardFooter className="p-4 pt-2">
        <div className="flex flex-col space-y-2 text-xs w-full">
          {sponsor && (
            <div className="text-gray-700">
              <span className="font-medium">Sponsored by:</span>{' '}
              <Link
                href={`/congressmen/${sponsor.id}`}
                className="text-blue-600 hover:underline"
              >
                {sponsor.full_name}
              </Link>
              <span className="text-gray-500 ml-1">
                ({sponsor.party}-{sponsor.state})
              </span>
            </div>
          )}

          <div className="text-gray-500">
            <span className="font-medium">Enacted:</span> {formattedDate}
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
