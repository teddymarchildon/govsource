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
    <Card className="group flex h-full flex-col border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="p-4 pb-2">
        <Link
          href={`/executive-orders/${order.id}`}
          className="block transition-colors group-hover:text-primary"
        >
          <CardTitle className="line-clamp-2 text-base font-semibold text-foreground">
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
            <div className="text-muted-foreground">
              <span className="font-medium">President:</span>{' '}
              <span>{order.president}</span>
            </div>
          )}

          {order.signing_date && (
            <div className="text-muted-foreground/90">
              <span className="font-medium">Signed:</span> {new Date(order.signing_date).toLocaleDateString()}
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
