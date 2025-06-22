'use client';

import { AgencyDocument, Agency } from '../types/types';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AgencyRuleCardProps {
  rule: AgencyDocument & { agency?: Agency };
}

export default function AgencyRuleCard({ rule }: AgencyRuleCardProps) {
  return (
    <Card className="h-full flex flex-col hover:shadow-md transition-shadow duration-200">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start gap-2">
          <span className="text-sm font-semibold text-gray-700">
            {rule.publication_date ? new Date(rule.publication_date).toLocaleDateString() : 'No Date'}
          </span>
          {rule.agency && (
            <Badge variant="secondary" className="truncate max-w-[180px] text-xs">
              {rule.agency.name}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-4 pt-2 flex-grow flex flex-col">
        <Link href={`/agency-rules/${rule.id}`} className="block mb-2 hover:text-blue-600 transition-colors">
          <h3 className="text-base font-medium text-gray-900 line-clamp-2">
            {rule.title}
          </h3>
        </Link>

        <div className="flex items-center space-x-2 text-xs text-gray-500 mb-2">
          {rule.type && <span>{rule.type}</span>}
          {rule.subtype && (
            <>
              {rule.type && <span className="text-gray-300">•</span>}
              <span>{rule.subtype}</span>
            </>
          )}
        </div>

        {rule.abstract && (
          <p className="text-sm text-gray-600 line-clamp-3 mt-auto">
            {rule.abstract}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
