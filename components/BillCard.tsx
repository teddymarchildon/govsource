'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bill, Congressman } from '../types/types';
import { supabase } from '../utils/supabase/client';

interface BillCardProps {
  bill: Bill;
}

export default function BillCard({ bill }: BillCardProps) {
  // Use pre-loaded data if available, otherwise initialize as null
  const [sponsor, setSponsor] = useState<Congressman | null>(bill.sponsor?.congressman || null);

  // Format bill identifier (e.g., HR. 2139)
  const billIdentifier = `${bill.type.toUpperCase()}. ${bill.number}`;
    

  useEffect(() => {
    // Only fetch sponsor if not already available in the bill data
    const fetchSponsor = async () => {
      if (!bill.sponsor) {
        try {
          const { data, error } = await supabase
            .from('sponsored_bills')
            .select('congressman_id, congressman:congressman(*)')
            .eq('bill_id', bill.id)
            .limit(1);

          if (error) throw error;

          if (data && data.length > 0) {
            setSponsor(data[0].congressman as unknown as Congressman);
          }
        } catch (error) {
          console.error('Error fetching sponsor:', error);
        }
      }
    };

    fetchSponsor();
  }, [bill.id, bill.sponsor]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-full hover:shadow-md transition-shadow duration-200">
      <div className="p-3 md:p-4 h-full flex flex-col">
        <div className="flex flex-wrap justify-between items-start mb-2 gap-2">
          <span className="text-sm font-semibold text-gray-700">{billIdentifier}</span>

          {bill.policy_area && (
            <span className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 truncate max-w-[150px]">
              {bill.policy_area}
            </span>
          )}
        </div>

        <Link
          href={`/bills/${bill.id}`}
          className="block mb-3 hover:text-blue-600 transition-colors"
        >
          <h3 className="text-sm md:text-base font-medium text-gray-900 line-clamp-2">
            {bill.title}
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
              <span className="text-gray-500 ml-1 break-words">
                ({sponsor.party}-{sponsor.state})
              </span>
            </div>
          )}

          {bill.introduced_date && (
            <div className="text-xs text-gray-500">
              <span className="font-medium">Introduced:</span> {new Date(bill.introduced_date).toLocaleDateString()}
            </div>
          )}

          {bill.most_recent_action && bill.most_recent_action.date && (
            <div className="text-xs text-gray-500 mt-1">
              <span className="font-medium">Latest Action:</span> {new Date(bill.most_recent_action.date).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
