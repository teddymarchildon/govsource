'use client';

import Link from 'next/link';
import { Cluster, CourtOpinion } from '../types/types';

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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 h-full">
      <div className="p-4 h-full flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
            {mostRecentDate}
          </span>
        </div>

        <Link
          href={`/supreme-court-cases/${cluster.id}`}
          className="block mb-3 hover:text-blue-600 transition-colors"
        >
          <h3 className="text-base font-medium text-gray-900 line-clamp-2">
            {cluster.case_name}
          </h3>
          {cluster.case_name_short && cluster.case_name_short !== cluster.case_name && (
            <p className="text-sm text-gray-600 line-clamp-1 mt-1">
              {cluster.case_name_short}
            </p>
          )}
        </Link>

        <div className="flex flex-col space-y-2 mt-auto">
          {primaryOpinion?.author && (
            <div className="text-xs text-gray-700">
              <span className="font-medium">Primary Opinion by:</span>{' '}
              <span className="text-blue-600">
                {primaryOpinion.author.full_name}
              </span>
            </div>
          )}

          {/* Opinion type counts */}
          {opinionCounts && Object.keys(opinionCounts).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(opinionCounts).map(([type, count]) => (
                <span
                  key={type}
                  className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700"
                >
                  {count} {type}
                </span>
              ))}
            </div>
          )}

          {primaryOpinion?.pdf_file_path && (
            <div className="text-xs text-gray-500 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="font-medium">PDF Available</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
