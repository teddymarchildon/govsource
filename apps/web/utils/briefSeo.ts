import type { Brief } from '../types/brief';
import { getBriefAuthorName } from './briefAuthor';

const origin = 'https://www.govsrc.com';

export function getBriefCanonicalUrl(slug: string) {
  return `${origin}/briefs/${encodeURIComponent(slug)}`;
}

function isoDate(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function getBriefArticleSchema(brief: Brief) {
  const url = getBriefCanonicalUrl(brief.slug!);
  const author = getBriefAuthorName(brief.author_name);
  const organizationAuthor = author === 'GovSource Briefs' || author === 'GovSource';
  const published = isoDate(brief.published_at);
  const updated = brief.version > 1 ? isoDate(brief.updated_at) : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: brief.title,
    description: brief.dek || brief.points[0]?.text.slice(0, 160),
    datePublished: published,
    // Match the visible updated date; never imply an update before publication.
    dateModified: updated && published && updated >= published ? updated : undefined,
    author: author ? {
      '@type': organizationAuthor ? 'Organization' : 'Person',
      name: author,
      ...(organizationAuthor ? { url: `${origin}/editorial-policy#how-we-use-ai` } : {}),
    } : undefined,
    publisher: { '@type': 'Organization', name: 'GovSource', url: origin },
    inLanguage: 'en-US',
    isAccessibleForFree: true,
  };
}

export function serializeBriefArticleSchema(brief: Brief) {
  // Editorial text must not be able to terminate the JSON-LD script element.
  return JSON.stringify(getBriefArticleSchema(brief)).replace(/</g, '\\u003c');
}
