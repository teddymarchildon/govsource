import { FileText, PenLine } from 'lucide-react';

import { PublicRecordCard } from '@/components/listing/PublicRecordCard';
import { Badge } from '@/components/ui/badge';
import type { Agency, AgencyDocument } from '@/types/types';
import { formatDate, plainText } from '@/utils/utils';

interface ExecutiveOrderCardProps {
  order: AgencyDocument & {
    agency?: Agency | null;
    president?: string | null;
  };
}

export default function ExecutiveOrderCard({ order }: ExecutiveOrderCardProps) {
  const abstract = plainText(order.abstract);

  return (
    <PublicRecordCard
      href={`/executive-orders/${order.id}`}
      eyebrow="Executive order"
      title={order.title}
      badge={order.president ? <Badge variant="secondary" className="max-w-[150px] truncate text-[10px]">{order.president}</Badge> : null}
      footer={(
        <div className="space-y-1 text-xs leading-5 text-muted-foreground">
          <div className="flex items-center gap-2">
            <PenLine className="h-3.5 w-3.5 shrink-0" />
            <span>{order.signing_date ? `Signed ${formatDate(order.signing_date)}` : 'Signing date unavailable'}</span>
          </div>
          {order.remote_document_number ? (
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span>Federal Register document {order.remote_document_number}</span>
            </div>
          ) : null}
        </div>
      )}
    >
      {abstract ? (
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{abstract}</p>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">Review the signed order and its official source record.</p>
      )}
    </PublicRecordCard>
  );
}
