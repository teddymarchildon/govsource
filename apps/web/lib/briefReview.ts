import type { BriefPoint, BriefSource } from '@/types/brief';

export function sourceHost(url: string) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.hostname : null;
  } catch { return null; }
}

/** Mechanical readiness only; the editor still checks accuracy and significance. */
export function publicationIssues(brief: {
  title: string; dek: string; context_markdown: string; author_name: string;
  primary_item_id: string; points: BriefPoint[]; sources: BriefSource[];
}) {
  const issues: string[] = [];
  if (!brief.title.trim()) issues.push('Add a headline.');
  if (!brief.dek.trim()) issues.push('Add a short takeaway.');
  const points = brief.points.filter(point => point.text.trim());
  if (points.length < 3 || points.length > 5) issues.push('Include three to five complete key points.');
  if (points.some(point => point.text.length > 900)) issues.push('Shorten key points to 900 characters each.');
  if (!brief.context_markdown.trim()) issues.push('Explain the development beyond the key points.');
  if (!brief.author_name.trim()) issues.push('Add an author attribution.');
  if (!Number.isInteger(Number(brief.primary_item_id)) || Number(brief.primary_item_id) <= 0) issues.push('Choose a valid government record.');
  if (!brief.sources.length) issues.push('Add source links.');
  if (brief.sources.some(source => !sourceHost(source.url))) issues.push('Use complete http or https source URLs.');
  const refs = new Set(['primary', ...brief.sources.map(source => source.id)]);
  if (points.some(point => !point.source_refs.length || point.source_refs.some(ref => !refs.has(ref)))) issues.push('Restore missing point citations or select their supporting sources.');
  return issues;
}
