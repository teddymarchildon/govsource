import type { ContentReference, ContentType } from './content';

export type BriefStatus = 'draft' | 'review' | 'scheduled' | 'published' | 'archived';

export interface BriefPoint {
  id: string;
  text: string;
  source_refs: string[];
}

export interface BriefSource {
  id: string;
  label: string;
  url: string;
}

export interface Brief {
  id: string;
  created_at: string;
  updated_at: string;
  version: number;
  status: BriefStatus;
  title: string;
  slug: string | null;
  dek: string | null;
  points: BriefPoint[];
  context_markdown: string | null;
  primary_item_type: ContentType;
  primary_item_id: string;
  policy_areas: string[];
  sources: BriefSource[];
  author_name: string | null;
  published_at: string | null;
  is_featured: boolean;
  featured_until: string | null;
  auto_generated: boolean;
  editor_notes?: string | null;
  related_items?: ContentReference[];
}
