import type { MetadataRoute } from 'next';
import { createAdminClient } from '@/utils/supabase/admin';

// Publication and archival changes must be reflected without another deployment.
export const dynamic = 'force-dynamic';

const origin = 'https://www.govsrc.com';
const sections = ['/', '/about', '/contact', '/privacy', '/editorial-policy', '/briefs',
  '/congress', '/white-house', '/agencies', '/courts', '/campaign-finance', '/topics',
  '/bills', '/laws', '/agency-rules', '/executive-orders', '/supreme-court-cases',
  '/congress-members', '/judges'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const entries: MetadataRoute.Sitemap = sections.map(path => ({ url: `${origin}${path === '/' ? '' : path}` }));
  // Keep the sitemap focused on editorial coverage, topic hubs, and navigation.
  // Raw imported records remain reachable through the relevant browse pages.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('brief')
      .select('id,slug,updated_at,published_at')
      .in('status', ['published', 'scheduled'])
      .not('slug', 'is', null).not('published_at', 'is', null)
      .lte('published_at', now).order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    for (const brief of data ?? []) {
      if (brief.slug) entries.push({ url: `${origin}/briefs/${encodeURIComponent(brief.slug)}`, lastModified: brief.updated_at || brief.published_at });
    }
    if (!data || data.length < 1000) break;
  }
  const { data: topics, error } = await db.from('topic').select('slug,updated_at').order('slug');
  if (error) throw error;
  for (const topic of topics ?? []) entries.push({ url: `${origin}/topics/${encodeURIComponent(topic.slug)}`, lastModified: topic.updated_at });
  return entries;
}
