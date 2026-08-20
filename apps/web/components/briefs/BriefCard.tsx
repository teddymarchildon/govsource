import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Brief } from '@/types/brief';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContentTypeLabel } from '@/utils/contentReferences';

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}

export default function BriefCard({ brief }: { brief: Brief }) {
  return (
    <Card className="group flex h-full flex-col transition-colors hover:border-primary/35">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{getContentTypeLabel(brief.primary_item_type)}</Badge>
          {brief.is_featured ? <Badge>Featured</Badge> : null}
          {formatDate(brief.published_at) ? <span>{formatDate(brief.published_at)}</span> : null}
        </div>
        <CardTitle className="font-serif text-2xl leading-tight">
          <Link href={`/briefs/${brief.slug}`} className="hover:text-primary">{brief.title}</Link>
        </CardTitle>
        {brief.dek ? <p className="text-sm leading-6 text-muted-foreground">{brief.dek}</p> : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <ol className="space-y-3 border-t pt-4">
          {brief.points.slice(0, 3).map((point, index) => (
            <li key={point.id} className="flex gap-3 text-sm leading-6">
              <span className="font-mono text-xs font-bold text-primary">0{index + 1}</span>
              <span className="line-clamp-2">{point.text}</span>
            </li>
          ))}
        </ol>
        <Link href={`/briefs/${brief.slug}`} className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary">
          Read full Brief <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </CardContent>
    </Card>
  );
}
