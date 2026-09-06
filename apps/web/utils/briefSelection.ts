import type { Brief } from '../types/brief';

// Use the primary institution so a cross-linked story occupies only one slot.
export function briefInstitution(brief: Brief) {
  switch (brief.primary_item_type) {
    case 'bill':
    case 'law': return 'congress';
    case 'executive_order': return 'white-house';
    case 'agency_document': return 'agencies';
    case 'cluster': return 'courts';
  }
}

export function selectFrontPageBriefs(input: Brief[], now = Date.now()) {
  const briefs = [...new Map(input.filter((brief) => brief.slug).map((brief) => [brief.id, brief])).values()]
    .sort((a, b) => Date.parse(b.published_at || '') - Date.parse(a.published_at || '') || b.id.localeCompare(a.id, undefined, { numeric: true }));
  const lead = briefs.find((brief) => brief.is_featured && (!brief.featured_until || Date.parse(brief.featured_until) > now)) || briefs[0];
  if (!lead) return { lead: undefined, supporting: [], latest: [], remaining: [] };

  const chosen = new Set([lead.id]);
  const institutions = new Set([briefInstitution(lead)]);
  const supporting: Brief[] = [];
  for (let slot = 0; slot < 2; slot++) {
    const candidates = briefs.filter((brief) => !chosen.has(brief.id));
    const next = candidates.find((brief) => !institutions.has(briefInstitution(brief))) || candidates[0];
    if (!next) break;
    supporting.push(next);
    chosen.add(next.id);
    institutions.add(briefInstitution(next));
  }
  const remaining = briefs.filter((brief) => !chosen.has(brief.id));
  return { lead, supporting, latest: remaining.slice(0, 4), remaining: remaining.slice(4) };
}
