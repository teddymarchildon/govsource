'use client';

import type { Judge, CourtOpinion } from '@/types/types';
import SaveButton from '@/components/SaveButton';
import Link from 'next/link';
import Breadcrumbs from '@/components/Breadcrumbs';

export default function JudgeDetailClient({ judge, opinions }: { judge: Judge; opinions: CourtOpinion[] }) {

  return (
    <div className="container mx-auto px-4 py-8">
      <nav className="mb-6 text-sm">
        <Breadcrumbs
          steps={[
            { label: 'Home', href: '/' },
            { label: 'Judges', href: '/judges' },
            { label: judge.full_name || `${judge.first_name} ${judge.middle_name ? judge.middle_name + ' ' : ''}${judge.last_name}${judge.suffix ? ' ' + judge.suffix : ''}` }
          ]}
        />
      </nav>

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-3xl font-bold text-gray-800">
            {judge.full_name || `${judge.first_name} ${judge.middle_name ? judge.middle_name + ' ' : ''}${judge.last_name}`}
            {judge.suffix && ` ${judge.suffix}`}
          </h1>
          <SaveButton itemId={judge.id} itemType="judge" />
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Recent Opinions</h2>
        {opinions.length > 0 ? (
          <div className="space-y-4">
            {opinions.map((opinion) => (
              <div key={opinion.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {opinion.cluster?.id ? (
                        <Link href={`/supreme-court-cases/${opinion.cluster.id}`}>
                          {opinion.cluster?.case_name || 'Unnamed Case'}
                        </Link>
                      ) : (
                        opinion.cluster?.case_name || 'Unnamed Case'
                      )}
                    </h3>
                    {opinion.cluster?.case_name_short && opinion.cluster.case_name_short !== opinion.cluster.case_name && (
                      <p className="text-sm text-gray-600">{opinion.cluster.case_name_short}</p>
                    )}
                  </div>
                  <div className="flex items-center mt-2 md:mt-0">
                    {opinion.type && (
                      <span className="inline-block px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800 mr-2">
                        {opinion.type.charAt(0).toUpperCase() + opinion.type.slice(1)}
                      </span>
                    )}
                    <span className="text-sm text-gray-500">
                      {new Date(opinion.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                </div>

                <div className="mt-2">
                  {opinion.court && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Court:</span> {opinion.court.full_name}
                    </p>
                  )}

                  {opinion.joined_by && opinion.joined_by.length > 0 && (
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-medium">Joined by:</span>{' '}
                      {opinion.joined_by.map((judge, index) => (
                        <span key={judge.id}>
                          {judge.full_name}
                          {index < opinion.joined_by.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
            <p className="text-gray-700">
              No opinions found for this judge.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
