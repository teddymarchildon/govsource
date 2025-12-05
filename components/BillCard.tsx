'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bill, Congressman } from '../types/types';
import { supabase } from '../utils/supabase/client';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPolicyAreaColors } from "@/utils/policyColors";

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
    <Card className="h-full flex flex-col hover:shadow-md transition-shadow duration-200">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-base">{billIdentifier}</CardTitle>
          {bill.policy_area && (
            <Badge variant="outline" className={`truncate max-w-[150px] text-xs ${getPolicyAreaColors(bill.policy_area)}`}>
              {bill.policy_area}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow px-4 pb-2">
        <Link
          href={`/bills/${bill.id}`}
          className="block hover:text-blue-600 transition-colors"
        >
          <p className="text-sm font-medium text-gray-900 line-clamp-3">
            {bill.title}
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
              <span className="text-gray-500 ml-1 break-words">
                ({sponsor.party}-{sponsor.state})
              </span>
            </div>
          )}

          {bill.introduced_date && (
            <div className="text-gray-500">
              <span className="font-medium">Introduced:</span> {new Date(bill.introduced_date).toLocaleDateString()}
            </div>
          )}

          {bill.most_recent_action && bill.most_recent_action.date && (
            <div className="text-gray-500">
              <span className="font-medium">Latest Action:</span> {new Date(bill.most_recent_action.date).toLocaleDateString()}
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
