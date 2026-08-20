import type { AgencyDocument, Bill, Cluster, Law } from './types';
import type { Article } from './article';

export type PopularHomepageItem =
  | { id?: string; item_type: 'bill'; data: Bill }
  | { id?: string; item_type: 'law'; data: Law }
  | { id?: string; item_type: 'agency_document' | 'executive_order'; data: AgencyDocument }
  | { id?: string; item_type: 'cluster'; data: Cluster };

export type PersonalizedHomepageItem =
  | { item_type: 'bill'; data: Bill }
  | { item_type: 'law'; data: Law };

export type HomepagePublicData = {
  articles: Article[];
  bills: Bill[];
  popularItems: PopularHomepageItem[];
  recentExecutiveOrders: AgencyDocument[];
};
