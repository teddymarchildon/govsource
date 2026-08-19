import type { Metadata } from 'next';
import ArticleCard from '@/components/articles/ArticleCard';
import { getPublishedArticles } from '@/lib/repositories/articles';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Briefings',
  description: 'Plain-language briefings grounded in federal legislation, executive actions, agency documents, and Supreme Court opinions.',
};

export default async function ArticlesPage() {
  const articles = await getPublishedArticles();

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 max-w-3xl">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">GovSource briefings</p>
        <h1 className="text-3xl font-bold tracking-tight">Understand what changed and why it matters</h1>
        <p className="mt-3 text-muted-foreground">
          Context and analysis connected directly to the government documents behind each development.
        </p>
      </div>

      {articles.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => <ArticleCard key={article.id} article={article} />)}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">No published briefings yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Published analysis will appear here as it becomes available.</p>
        </div>
      )}
    </div>
  );
}
