'use client';

import Link from 'next/link';
import { Agency } from '../types/types';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AgencyCardProps {
  agency: Agency;
}

export default function AgencyCard({ agency }: AgencyCardProps) {
  // Function to truncate text with ellipsis
  const truncateText = (text: string | undefined, maxLength: number) => {
    if (!text) return '';
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  };

  return (
    <Card className="group flex h-full flex-col border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-lg font-semibold text-foreground">
            <Link href={`/agencies/${agency.id}`} className="transition-colors group-hover:text-primary">
              {agency.name}
            </Link>
          </CardTitle>
          {agency.parent_id === null && (
            <Badge className="whitespace-nowrap border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/90">
              Parent Agency
            </Badge>
          )}
        </div>
        {agency.short_name && (
          <p className="pt-1 text-sm text-muted-foreground/90">{agency.short_name}</p>
        )}
      </CardHeader>
      <CardContent className="p-4 pt-2 flex-grow flex flex-col">
        {agency.parent && (
          <p className="mb-2 text-sm text-muted-foreground/90">
            <span className="font-medium">Part of:</span>{' '}
            <Link
              href={`/agencies/${agency.parent.id}`}
              className="text-primary hover:underline"
            >
              {agency.parent.name}
            </Link>
          </p>
        )}
        {agency.description && (
          <p className="mt-auto line-clamp-3 text-sm text-muted-foreground">
            {truncateText(agency.description, 150)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
