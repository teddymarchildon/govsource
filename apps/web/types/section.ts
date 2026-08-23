import type { ContentType } from './content';

export const GOVERNMENT_SECTIONS = [
  'congress',
  'white-house',
  'agencies',
  'courts',
] as const;

export type GovernmentSection = (typeof GOVERNMENT_SECTIONS)[number];

export const SECTION_CONTENT_TYPES: Record<GovernmentSection, readonly ContentType[]> = {
  congress: ['bill', 'law'],
  'white-house': ['executive_order'],
  agencies: ['agency_document'],
  courts: ['cluster'],
};
