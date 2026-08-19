import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, Clock, ExternalLink, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getPublishedArticleBySlug } from '@/lib/repositories/articles';
import { getContentHref, getContentTypeLabel } from '@/utils/contentReferences';

export const dynamic = 'force-dynamic';

type ArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) return { title: 'Briefing not found' };

  return {
    title: article.title,
    description: article.dek || article.excerpt || article.summary?.slice(0, 160),
  };
}

function formatPublishedDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(value));
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) notFound();

  const primaryReference = { id: article.primary_item_id, type: article.primary_item_type };
  const body = article.body_markdown || article.summary || article.excerpt || '';

  return (
    <article className="container mx-auto max-w-6xl px-4 py-8">
      <Link href="/articles" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to briefings
      </Link>

      <header className="max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge>{getContentTypeLabel(article.primary_item_type)}</Badge>
          {article.reading_time ? (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" /> {article.reading_time} min read
            </span>
          ) : null}
          {formatPublishedDate(article.published_at) ? (
            <span className="text-sm text-muted-foreground">{formatPublishedDate(article.published_at)}</span>
          ) : null}
        </div>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{article.title}</h1>
        {article.dek ? <p className="mt-5 text-xl leading-8 text-muted-foreground">{article.dek}</p> : null}
        {article.author ? <p className="mt-4 text-sm font-medium">By {article.author}</p> : null}
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="prose prose-gray max-w-none prose-a:text-primary prose-headings:tracking-tight">
          <ReactMarkdown>{body}</ReactMarkdown>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="font-semibold">Primary source</h2>
              <Link
                href={getContentHref(primaryReference)}
                className="inline-flex items-start gap-2 text-sm font-medium text-primary hover:underline"
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                View the {getContentTypeLabel(article.primary_item_type).toLowerCase()}
              </Link>
            </CardContent>
          </Card>

          {article.related_items && article.related_items.length > 0 ? (
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="font-semibold">Related government sources</h2>
                {article.related_items.map((item) => (
                  <Link key={`${item.type}-${item.id}`} href={getContentHref(item)} className="block text-sm text-primary hover:underline">
                    {getContentTypeLabel(item.type)} #{item.id}
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {article.source_urls.length > 0 ? (
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="font-semibold">External sources</h2>
                {article.source_urls.map((url, index) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="flex items-start gap-2 break-all text-sm text-primary hover:underline">
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" /> Source {index + 1}
                  </a>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </article>
  );
}
