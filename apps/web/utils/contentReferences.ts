import type { ContentReference, ContentType } from '@/types/content';

const CONTENT_ROUTES: Record<ContentType, string> = {
  bill: '/bills',
  law: '/laws',
  agency_document: '/agency-rules',
  executive_order: '/executive-orders',
  cluster: '/supreme-court-cases',
};

const CONTENT_LABELS: Record<ContentType, string> = {
  bill: 'Bill',
  law: 'Law',
  agency_document: 'Agency document',
  executive_order: 'Executive order',
  cluster: 'Supreme Court case',
};

export function getContentHref(reference: Pick<ContentReference, 'id' | 'type'>) {
  return `${CONTENT_ROUTES[reference.type]}/${reference.id}`;
}

export function getContentTypeLabel(type: ContentType) {
  return CONTENT_LABELS[type];
}

export function isContentType(value: string): value is ContentType {
  return value in CONTENT_ROUTES;
}

