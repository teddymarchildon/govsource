import type { Brief } from '@/types/brief';
import BriefTeaser from './BriefTeaser';

export default function BriefCard({ brief }: { brief: Brief }) {
  return <div className="border-t border-border pt-4"><BriefTeaser brief={brief} heading="h2" placement="archive" /></div>;
}
