import 'server-only';

import { cache } from 'react';
import { createAdminClient } from '@/utils/supabase/admin';
import { isContentType } from '@/utils/contentReferences';
import type { Brief } from '@/types/brief';
import type { ContentReference } from '@/types/content';
import { SECTION_CONTENT_TYPES, type GovernmentSection } from '@/types/section';

type BriefRow = Omit<Brief, 'id' | 'primary_item_id' | 'related_items'> & {
  id: string | number;
  primary_item_id: string | number;
};

type RelatedItemRow = {
  item_id: string | number;
  item_type: string;
};

const COMPLETE_SENTENCE_END = /[.!?]["'’”)\]]*$/;

function normalizeDek(dek: string | null, points: Brief['points']): string | null {
  const value = dek?.trim() || null;
  if (!value || COMPLETE_SENTENCE_END.test(value)) return value;

  return points.find((point) => {
    const text = point.text.trim();
    return text.length <= 360 && COMPLETE_SENTENCE_END.test(text);
  })?.text.trim() ?? value;
}

function normalizeBrief(row: BriefRow, relatedItems: RelatedItemRow[] = []): Brief {
  const related: ContentReference[] = relatedItems.flatMap((item) =>
    isContentType(item.item_type)
      ? [{ id: String(item.item_id), type: item.item_type }]
      : [],
  );
  const points = Array.isArray(row.points) ? row.points : [];

  return {
    ...row,
    id: String(row.id),
    primary_item_id: String(row.primary_item_id),
    dek: normalizeDek(row.dek, points),
    points,
    policy_areas: row.policy_areas ?? [],
    sources: Array.isArray(row.sources) ? row.sources : [],
    related_items: related,
  };
}

function liveBriefWithRelationsQuery() {
  return createAdminClient()
    .from('brief')
    .select('*, related_items:brief_related_item(item_type, item_id)')
    .in('status', ['published', 'scheduled'])
    .not('slug', 'is', null)
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString());
}

export const getPublishedBriefs = cache(async (limit = 24): Promise<Brief[]> => {
  const { data, error } = await liveBriefWithRelationsQuery()
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as unknown as Array<BriefRow & { related_items?: RelatedItemRow[] }>)
    .map((brief) => normalizeBrief(brief, brief.related_items ?? []));
});

export const getPublishedBriefsBySection = cache(async (
  section: GovernmentSection,
  limit = 12,
): Promise<Brief[]> => {
  const supabase = createAdminClient();
  const contentTypes = SECTION_CONTENT_TYPES[section];

  const [primaryResult, relatedResult] = await Promise.all([
    liveBriefWithRelationsQuery()
      .in('primary_item_type', contentTypes)
      .order('published_at', { ascending: false })
      .limit(limit),
    supabase
      .from('brief_related_item')
      .select('brief_id')
      .in('item_type', contentTypes)
      .limit(1000),
  ]);

  const firstError = primaryResult.error || relatedResult.error;
  if (firstError) throw firstError;

  const relatedBriefIds = [...new Set(
    (relatedResult.data ?? []).map((item: { brief_id: string | number }) => String(item.brief_id)),
  )];
  const relatedBriefsResult = relatedBriefIds.length
    ? await liveBriefWithRelationsQuery()
        .in('id', relatedBriefIds)
        .order('published_at', { ascending: false })
        .limit(limit)
    : { data: [], error: null };

  if (relatedBriefsResult.error) throw relatedBriefsResult.error;

  const briefs = new Map<string, Brief>();
  [...(primaryResult.data ?? []), ...(relatedBriefsResult.data ?? [])].forEach((row) => {
    const typedRow = row as unknown as BriefRow & { related_items?: RelatedItemRow[] };
    const brief = normalizeBrief(typedRow, typedRow.related_items ?? []);
    briefs.set(brief.id, brief);
  });

  return [...briefs.values()]
    .sort((a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime())
    .slice(0, limit);
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
