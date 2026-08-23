import type { Brief } from './brief';
import type { AgencyDocument, Bill, Cluster, Law } from './types';

export interface Topic {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  description: string;
  seo_title: string;
  seo_description: string;
  display_order: number;
}

export type TopicRecord =
  | { type: 'bill'; date: string | null; data: Bill }
  | { type: 'law'; date: string | null; data: Law }
  | { type: 'agency_document' | 'executive_order'; date: string | null; data: AgencyDocument }
  | { type: 'cluster'; date: string | null; data: Cluster };

export interface TopicPageData {
  topic: Topic;
  briefs: Brief[];
  records: TopicRecord[];
  counts: {
    briefs: number;
    bills: number;
    laws: number;
    agencyDocuments: number;
    executiveOrders: number;
    courtCases: number;
  };
}
