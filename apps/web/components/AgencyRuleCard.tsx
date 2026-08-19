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
    <Card className="group flex h-full flex-col border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start gap-2">
          <span className="text-sm font-semibold text-muted-foreground">
            {rule.publication_date ? new Date(rule.publication_date).toLocaleDateString() : 'No Date'}
          </span>
          {rule.agency && (
            <Badge variant="secondary" className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-[10px]">
              {rule.agency.name}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-4 pt-2 flex-grow flex flex-col">
        <Link href={`/agency-rules/${rule.id}`} className="mb-2 block transition-colors group-hover:text-primary">
          <h3 className="line-clamp-2 text-base font-medium text-foreground">
            {rule.title}
          </h3>
        </Link>

        <div className="mb-2 flex items-center space-x-2 text-xs text-muted-foreground/90">
          {rule.type && <span>{rule.type}</span>}
          {rule.subtype && (
            <>
              {rule.type && <span className="text-border">•</span>}
              <span>{rule.subtype}</span>
            </>
          )}
        </div>

        {rule.abstract && (
          <p className="mt-auto line-clamp-3 text-sm text-muted-foreground">
            {rule.abstract}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
