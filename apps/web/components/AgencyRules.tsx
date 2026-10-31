'use client';

import LoadingIndicator from '@/components/ui/LoadingIndicator';

import { useState, useEffect } from 'react';
import { AgencyDocument } from '../types/types';
import { getAgencyRules } from '../services/api';
import AgencyRuleCard from './AgencyRuleCard';

interface AgencyRulesProps {
  agencyId?: string;
  limit?: number;
}

export default function AgencyRules({ agencyId, limit }: AgencyRulesProps) {
  const [rules, setRules] = useState<AgencyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRules = async () => {
      setLoading(true);
      try {
        const params: any = {};
        if (agencyId) params.agencyId = agencyId;
        if (limit) params.limit = limit;

        const data = await getAgencyRules(params);
        setRules(data);
      } catch (err) {
        console.error('Failed to fetch rules:', err);
        setError('Failed to load agency rules. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchRules();
  }, [agencyId, limit]);

  if (loading) {
    return (
      <div className="text-center py-8">
        <LoadingIndicator label="Loading rules…" />
        <p className="mt-2 text-gray-700">Loading rules...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="text-center py-8">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No rules found</h3>
        <p className="mt-1 text-sm text-gray-500">
          {agencyId
            ? "This agency has not published any rules yet."
            : "No agency rules available at this time."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {rules.map((rule) => (
        <AgencyRuleCard key={rule.id} rule={rule} />
      ))}
    </div>
  );
}
