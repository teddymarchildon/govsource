import type { BillSummary, BillText, Congressman } from './types';

export interface LegislationItem {
  id: string;
  congress: number;
  type: string;
  number: string;
  title: string;
  policy_area: string;
  introduced_date: string;
  law_enacted_date?: string;
  law_number?: string;
  law_type?: string;
  law_unique_id?: string;
  law_title?: string;
}

export interface LegislationText extends BillText {
  type?: string;
}

export interface LegislationAction {
  id: string;
  bill_id: string;
  date: string;
  text: string;
  type: string;
}

export interface LegislationDetail {
  item: LegislationItem;
  texts: LegislationText[];
  sponsors: Congressman[];
  cosponsors: Congressman[];
  actions: LegislationAction[];
  summary: BillSummary | null;
}

