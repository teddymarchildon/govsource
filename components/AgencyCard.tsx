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
    <Card className="h-full flex flex-col hover:shadow-md transition-shadow duration-200">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-lg font-semibold text-gray-900">
            <Link href={`/agencies/${agency.id}`} className="hover:text-blue-600 transition-colors">
              {agency.name}
            </Link>
          </CardTitle>
          {agency.parent_id === null && (
            <Badge className="bg-purple-100 text-purple-800 border-transparent whitespace-nowrap hover:bg-purple-200">
              Parent Agency
            </Badge>
          )}
        </div>
        {agency.short_name && (
          <p className="text-sm text-gray-500 pt-1">{agency.short_name}</p>
        )}
      </CardHeader>
      <CardContent className="p-4 pt-2 flex-grow flex flex-col">
        {agency.parent && (
          <p className="text-sm text-gray-500 mb-2">
            <span className="font-medium">Part of:</span>{' '}
            <Link
              href={`/agencies/${agency.parent.id}`}
              className="text-blue-600 hover:underline"
            >
              {agency.parent.name}
            </Link>
          </p>
        )}
        {agency.description && (
          <p className="text-sm text-gray-600 line-clamp-3 mt-auto">
            {truncateText(agency.description, 150)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
