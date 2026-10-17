export const FRONT_PAGES = ['home', 'campaign-finance', 'congress', 'white-house', 'agencies', 'courts'] as const;
export type FrontPage = (typeof FRONT_PAGES)[number];
export const FRONT_PAGE_LABELS: Record<FrontPage, string> = {
  home: 'Today / Homepage',
  'campaign-finance': 'Campaign Finance',
  congress: 'Congress',
  'white-house': 'White House',
  agencies: 'Agencies',
  courts: 'Courts',
};
export const FRONT_PAGE_SLOTS = ['lead_brief_id', 'supporting_brief_id', 'secondary_brief_id'] as const;
export type FrontPageSlot = (typeof FRONT_PAGE_SLOTS)[number];
export type FrontPageSettings = Record<FrontPageSlot, string | null> & { section: FrontPage; version: number };
