import type { ContentReference, ContentType } from './content';

export type ArticleStatus = 'draft' | 'review' | 'scheduled' | 'published' | 'archived';

export interface Article {
  id: string;
  created_at: string;
  updated_at: string;
  status: ArticleStatus;
  title: string;
  slug: string | null;
  dek: string | null;
  excerpt: string | null;
  summary: string | null;
  body: unknown;
  body_markdown: string | null;
  reading_time: number | null;
  hero_image_url: string | null;
  source_urls: string[];
  published_at: string | null;
  is_featured: boolean;
  primary_item_type: ContentType;
  primary_item_id: string;
  author: string | null;
  related_items?: ContentReference[];
}

