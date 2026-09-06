import type { Brief } from '@/types/brief';
import BriefTeaser from './BriefTeaser';

export { BriefMeta } from './BriefTeaser';
export function LeadBrief({ brief }: { brief: Brief }) {
  return <BriefTeaser brief={brief} variant="lead" heading="h2" />;
}
export function SecondaryBrief({ brief }: { brief: Brief }) {
  return <BriefTeaser brief={brief} />;
}
