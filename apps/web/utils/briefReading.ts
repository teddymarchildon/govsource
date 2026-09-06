import type { Brief } from '../types/brief';

export function getBriefReadingMinutes(brief: Pick<Brief, 'dek' | 'points' | 'context_markdown'>) {
  const text = [brief.dek, ...brief.points.map((point) => `${point.label || ''} ${point.text}`), brief.context_markdown].filter(Boolean).join(' ');
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 220));
}
