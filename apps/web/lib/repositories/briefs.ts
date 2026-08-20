import 'server-only';

import { cache } from 'react';
import { createAdminClient } from '@/utils/supabase/admin';
import { isContentType } from '@/utils/contentReferences';
import type { Brief } from '@/types/brief';
import type { ContentReference } from '@/types/content';

type BriefRow = Omit<Brief, 'id' | 'primary_item_id' | 'related_items'> & {
  id: string | number;
  primary_item_id: string | number;
};

type RelatedItemRow = {
  item_id: string | number;
  item_type: string;
};

function normalizeBrief(row: BriefRow, relatedItems: RelatedItemRow[] = []): Brief {
  const related: ContentReference[] = relatedItems.flatMap((item) =>
    isContentType(item.item_type)
      ? [{ id: String(item.item_id), type: item.item_type }]
      : [],
  );

  return {
    ...row,
    id: String(row.id),
    primary_item_id: String(row.primary_item_id),
    points: Array.isArray(row.points) ? row.points : [],
    policy_areas: row.policy_areas ?? [],
    sources: Array.isArray(row.sources) ? row.sources : [],
    related_items: related,
  };
}

function liveBriefQuery() {
  return createAdminClient()
    .from('brief')
    .select('*')
    .in('status', ['published', 'scheduled'])
    .not('slug', 'is', null)
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString());
}

export const getPublishedBriefs = cache(async (limit = 24): Promise<Brief[]> => {
  const { data, error } = await liveBriefQuery()
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as BriefRow[]).map((brief) => normalizeBrief(brief));
});

export const getPublishedBriefBySlug = cache(async (slug: string): Promise<Brief | null> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('brief')
    .select('*, related_items:brief_related_item(item_type, item_id)')
    .in('status', ['published', 'scheduled'])
    .eq('slug', slug)
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as BriefRow & { related_items?: RelatedItemRow[] };
  return normalizeBrief(row, row.related_items ?? []);
});
