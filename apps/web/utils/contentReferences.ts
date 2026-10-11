import type { ContentReference, ContentType } from '@/types/content';

const CONTENT_ROUTES: Record<ContentType, string> = {
  bill: '/bills',
  law: '/laws',
  agency_document: '/agency-rules',
  executive_order: '/executive-orders',
  cluster: '/supreme-court-cases',
  campaign_finance: '/congress-members',
};

const CONTENT_LABELS: Record<ContentType, string> = {
  bill: 'Bill',
  law: 'Law',
  agency_document: 'Agency document',
  executive_order: 'Executive order',
  cluster: 'Supreme Court case',
  campaign_finance: 'Campaign finance',
};

export function getContentHref(reference: Pick<ContentReference, 'id' | 'type'> & { cycle?: number | null }) {
  const path = `${CONTENT_ROUTES[reference.type]}/${reference.id}`;
  return reference.type === 'campaign_finance' ? `${path}?tab=contributions&contributionKind=overview${reference.cycle ? `&cycle=${reference.cycle}` : ''}` : path;
}

export function getContentTypeLabel(type: ContentType) {
  return CONTENT_LABELS[type];
}

export function isContentType(value: string): value is ContentType {
  return value in CONTENT_ROUTES;
}

