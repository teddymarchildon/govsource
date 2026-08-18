import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import type { Article } from '@/types/article';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContentTypeLabel } from '@/utils/contentReferences';

export default function ArticleCard({ article }: { article: Article }) {
  return (
    <Card className="group h-full transition-colors hover:border-primary/35">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{getContentTypeLabel(article.primary_item_type)}</Badge>
          {article.is_featured ? <Badge>Featured</Badge> : null}
          {article.reading_time ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {article.reading_time} min read
            </span>
          ) : null}
        </div>
        <CardTitle className="text-xl leading-snug">
          <Link href={`/articles/${article.slug}`} className="hover:text-primary">
            {article.title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4">
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
          {article.dek || article.excerpt || article.summary || 'Analysis grounded in the underlying government source material.'}
        </p>
        <Link
          href={`/articles/${article.slug}`}
          className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          Read briefing <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </CardContent>
    </Card>
  );
}

