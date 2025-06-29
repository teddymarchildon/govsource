'use client';

import Link from 'next/link';
import { AgencyDocument, Agency } from '../types/types';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ExecutiveOrderCardProps {
  order: AgencyDocument & {
    agency?: Agency | null;
    president?: string | null;
  };
}

export default function ExecutiveOrderCard({ order }: ExecutiveOrderCardProps) {
  return (
    <Card className="h-full flex flex-col hover:shadow-md transition-shadow duration-200">
      <CardHeader className="p-4 pb-2">
        <Link
          href={`/executive-orders/${order.id}`}
          className="block hover:text-blue-600 transition-colors"
        >
          <CardTitle className="text-base font-semibold text-gray-900 line-clamp-2">
            {order.title}
          </CardTitle>
        </Link>
      </CardHeader>

      <CardContent className="flex-grow px-4 pb-2">
        {/* No title here, only abstract or other info if needed */}
      </CardContent>

      <CardFooter className="p-4 pt-2">
        <div className="flex flex-col space-y-2 text-xs w-full mt-auto">
          {order.president && (
            <div className="text-gray-700">
              <span className="font-medium">President:</span>{' '}
              <span>{order.president}</span>
            </div>
          )}

          {order.signing_date && (
            <div className="text-gray-500">
              <span className="font-medium">Signed:</span> {new Date(order.signing_date).toLocaleDateString()}
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
