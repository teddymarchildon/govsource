'use client';

import Link from 'next/link';
import { Cluster, CourtOpinion } from '../types/types';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { File } from 'lucide-react';

interface CourtCaseCardProps {
  cluster: Cluster;
}

export default function CourtCaseCard({ cluster }: CourtCaseCardProps) {
  if (!cluster) {
    return null;
  }

  // Get the most recent opinion date
  const mostRecentDate = cluster.opinions?.length > 0
    ? new Date(Math.max(...cluster.opinions.map((o: CourtOpinion) => new Date(o.date).getTime()))).toLocaleDateString()
    : cluster.date_filed
      ? new Date(cluster.date_filed).toLocaleDateString()
      : 'Unknown date';

  // Get the primary opinion (usually the majority opinion)
  const primaryOpinion = cluster.opinions?.find((o: CourtOpinion) => o.type === 'majority') || cluster.opinions?.[0];

  // Count opinions by type
  const opinionCounts = cluster.opinions?.reduce((acc: Record<string, number>, opinion: CourtOpinion) => {
    const type = opinion.type || 'Unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  return (
    <Card className="h-full flex flex-col hover:shadow-md transition-shadow duration-200">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start gap-4">
          <CardTitle className="text-base font-medium text-gray-900 line-clamp-2">
            <Link
              href={`/supreme-court-cases/${cluster.id}`}
              className="hover:text-blue-600 transition-colors"
            >
              {cluster.case_name}
            </Link>
          </CardTitle>
          <Badge variant="secondary" className="text-xs whitespace-nowrap">
            {mostRecentDate}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-grow px-4 pt-0 pb-2">
        {cluster.case_name_short && cluster.case_name_short !== cluster.case_name && (
          <p className="text-sm text-gray-600 line-clamp-1">
            {cluster.case_name_short}
          </p>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-2">
        <div className="flex flex-col space-y-3 w-full mt-auto">
          {primaryOpinion?.author && (
            <div className="text-xs text-gray-700">
              <span className="font-medium">Primary Opinion by:</span>{' '}
              <Link
                href={`/supreme-court-cases?judge_id=${primaryOpinion.author.id}`}
                className="text-blue-600 hover:underline"
              >
                {primaryOpinion.author.full_name}
              </Link>
            </div>
          )}

          {/* Opinion type counts */}
          {opinionCounts && Object.keys(opinionCounts).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(opinionCounts).map(([type, count]) => (
                <Badge
                  key={type}
                  variant="outline"
                  className="font-normal"
                >
                  {count} {type}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
