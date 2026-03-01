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
    <Card className="group flex h-full flex-col border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-base">{billIdentifier}</CardTitle>
          {bill.policy_area && (
            <Badge variant="outline" className={`max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-[10px] ${getPolicyAreaColors(bill.policy_area)}`}>
              {bill.policy_area}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow px-4 pb-2">
        <Link
          href={`/bills/${bill.id}`}
          className="block transition-colors group-hover:text-primary"
        >
          <p className="line-clamp-3 text-sm font-medium text-foreground">
            {bill.title}
          </p>
        </Link>
      </CardContent>
      <CardFooter className="p-4 pt-2">
        <div className="flex flex-col space-y-2 text-xs w-full">
          {sponsor && (
            <div className="text-muted-foreground">
              <span className="font-medium">Sponsored by:</span>{' '}
              <Link
                href={`/congress-members/${sponsor.id}`}
                className="text-primary hover:underline"
              >
                {sponsor.full_name}
              </Link>
              <span className="ml-1 break-words text-muted-foreground/90">
                ({sponsor.party}-{sponsor.state})
              </span>
            </div>
          )}

          {bill.introduced_date && (
            <div className="text-muted-foreground/90">
              <span className="font-medium">Introduced:</span> {new Date(bill.introduced_date).toLocaleDateString()}
            </div>
          )}

          {bill.most_recent_action && bill.most_recent_action.date && (
            <div className="text-muted-foreground/90">
              <span className="font-medium">Latest Action:</span> {new Date(bill.most_recent_action.date).toLocaleDateString()}
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
