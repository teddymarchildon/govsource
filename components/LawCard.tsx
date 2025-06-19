'use client';

import Link from 'next/link';
import { formatDate } from '@/utils/utils';
import { Law } from '@/types/types';

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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 h-full">
      <div className="p-4 h-full flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <span className="text-sm font-semibold text-gray-700">{lawIdentifier}</span>

          {law.policy_area ? (
            <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
              {law.policy_area}
            </span>
          ) : (
            <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
              Uncategorized
            </span>
          )}
        </div>

        <Link
          href={`/laws/${law.id}`}
          className="block mb-3 hover:text-blue-600 transition-colors"
        >
          <h3 className="text-base font-medium text-gray-900 line-clamp-2">
            {law.law_title || law.title}
          </h3>
        </Link>

        <div className="flex flex-col space-y-2 mt-auto">
          {sponsor && (
            <div className="text-xs text-gray-700">
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

          <div className="text-xs text-gray-500">
            <span className="font-medium">Enacted:</span> {formattedDate}
          </div>
        </div>
      </div>
    </div>
  );
}
