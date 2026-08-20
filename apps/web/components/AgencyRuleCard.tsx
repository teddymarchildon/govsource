import Link from 'next/link';
import { Building2, FileText } from 'lucide-react';

import { PublicRecordCard } from '@/components/listing/PublicRecordCard';
import { Badge } from '@/components/ui/badge';
import type { Agency, AgencyDocument } from '@/types/types';
import { formatDate, plainText } from '@/utils/utils';

interface AgencyRuleCardProps {
  rule: AgencyDocument & { agency?: Agency | null };
}

export default function AgencyRuleCard({ rule }: AgencyRuleCardProps) {
  const abstract = plainText(rule.abstract);
  const documentType = rule.subtype && rule.subtype !== rule.type ? rule.subtype : rule.type;
  const agencyLabel = rule.agency?.short_name || rule.agency?.name;

  return (
    <PublicRecordCard
      href={`/agency-rules/${rule.id}`}
      eyebrow="Agency document"
      title={rule.title}
      badge={documentType ? (
        <Badge variant="secondary" title={documentType} className="max-w-[150px] truncate text-[10px]">
          {documentType}
        </Badge>
      ) : null}
      footer={(
        <div className="space-y-1 text-xs leading-5 text-muted-foreground">
          {rule.agency ? (
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <Link href={`/agencies/${rule.agency.id}`} title={rule.agency.name} className="relative z-10 font-medium text-primary hover:underline">
                {agencyLabel}
              </Link>
            </div>
          ) : null}
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {rule.publication_date ? `Published ${formatDate(rule.publication_date)}` : 'Publication date unavailable'}
              {rule.remote_document_number ? ` · FR Doc. ${rule.remote_document_number}` : ''}
            </span>
          </div>
        </div>
      )}
    >
      {abstract ? (
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{abstract}</p>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">Review the official document and source materials.</p>
      )}
    </PublicRecordCard>
  );
}
