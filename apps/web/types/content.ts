export const CONTENT_TYPES = [
  'bill',
  'law',
  'agency_document',
  'executive_order',
  'cluster',
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export interface ContentReference {
  id: string;
  type: ContentType;
  title?: string | null;
}

