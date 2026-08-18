import 'server-only';

import { cache } from 'react';
import { createAdminClient } from '@/utils/supabase/admin';
import { isContentType } from '@/utils/contentReferences';
import type { Article } from '@/types/article';
import type { ContentReference } from '@/types/content';

type ArticleRow = Omit<Article, 'id' | 'primary_item_id' | 'related_items'> & {
  id: string | number;
  primary_item_id: string | number;
};

type RelatedItemRow = {
  item_id: string | number;
  item_type: string;
};

function normalizeArticle(row: ArticleRow, relatedItems: RelatedItemRow[] = []): Article {
  const related: ContentReference[] = relatedItems.flatMap((item) =>
    isContentType(item.item_type)
      ? [{ id: String(item.item_id), type: item.item_type }]
      : []
  );

  return {
    ...row,
    id: String(row.id),
    primary_item_id: String(row.primary_item_id),
    source_urls: row.source_urls ?? [],
    related_items: related,
  };
}

export const getPublishedArticles = cache(async (limit = 24): Promise<Article[]> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('article')
    .select('*')
    .eq('status', 'published')
    .not('slug', 'is', null)
    .lte('published_at', new Date().toISOString())
    .order('is_featured', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as ArticleRow[]).map((article) => normalizeArticle(article));
});

export const getPublishedArticleBySlug = cache(async (slug: string): Promise<Article | null> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('article')
    .select('*, related_items:article_related_item(item_type, item_id)')
    .eq('status', 'published')
    .eq('slug', slug)
    .lte('published_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as ArticleRow & { related_items?: RelatedItemRow[] };
  return normalizeArticle(row, row.related_items ?? []);
});

