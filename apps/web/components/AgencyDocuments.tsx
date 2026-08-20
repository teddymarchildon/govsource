import { CalendarDays, FileText } from 'lucide-react';

import { PublicRecordCard } from '@/components/listing/PublicRecordCard';
import { Badge } from '@/components/ui/badge';
import type { AgencyDocument } from '@/types/types';
import { formatDate, plainText } from '@/utils/utils';

function documentHref(document: AgencyDocument) {
  return document.subtype === 'Executive Order' ? `/executive-orders/${document.id}` : `/agency-rules/${document.id}`;
}

export default function AgencyDocuments({ documents }: { documents: AgencyDocument[] }) {
  if (!documents.length) {
    return <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center"><div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground"><FileText className="h-6 w-6" /></div><h3 className="font-semibold">No documents listed</h3><p className="mt-1 text-sm text-muted-foreground">This agency has no connected documents in GovSource.</p></div>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {documents.map((document) => (
        <PublicRecordCard
          key={document.id}
          href={documentHref(document)}
          eyebrow={document.remote_document_number || 'Federal Register document'}
          title={document.title}
          badge={<Badge variant="secondary">{document.subtype || document.type || 'Document'}</Badge>}
          footer={<div className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /><span>Published {formatDate(document.publication_date)}</span></div>}
        >
          {document.abstract ? <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{plainText(document.abstract)}</p> : null}
        </PublicRecordCard>
      ))}
    </div>
  );
}
