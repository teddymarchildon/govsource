import type { Brief } from '@/types/brief';
import BriefTeaser from './BriefTeaser';
import { cn } from '@/lib/utils';
import { selectFrontPageBriefs } from '@/utils/briefSelection';

export default function BriefFrontPage({ briefs, placement, home = false }: { briefs: Brief[]; placement: string; home?: boolean }) {
  const { lead, supporting, latest } = selectFrontPageBriefs(briefs);
  if (!lead) return null;
  return (
    <div className={cn("grid gap-5 lg:gap-6", supporting.length > 0 && "md:grid-cols-2", latest.length > 0 && "lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]")}>
      <div className={cn(supporting.length > 0 ? "md:border-r md:border-border md:pr-6" : "max-w-2xl")}>
        <BriefTeaser brief={lead} variant="lead" heading={home ? 'h1' : 'h2'} placement={`${placement}:lead`} />
      </div>
      {supporting.length > 0 ? <div className="divide-y divide-border border-t border-border md:border-t-0 lg:border-r lg:pr-6">
        {supporting.map((brief) => <div key={brief.id} className="py-4 first:pt-4 last:pb-0 md:first:pt-0"><BriefTeaser brief={brief} heading="h2" placement={`${placement}:supporting`} /></div>)}
      </div> : null}
      {latest.length > 0 ? <aside aria-label="Latest Briefs" className="border-t border-border pt-4 md:col-span-2 lg:col-span-1 lg:border-t-0 lg:pt-0">
        <h2 className="mb-3 border-b-2 border-foreground pb-2 text-xs font-bold uppercase tracking-[0.14em]">Latest Briefs</h2>
        <div className="divide-y divide-border md:grid md:grid-cols-2 md:gap-x-6 lg:block">
          {latest.map((brief) => <div key={brief.id} className="py-3 first:pt-0"><BriefTeaser brief={brief} variant="headline" placement={`${placement}:latest`} /></div>)}
        </div>
      </aside> : null}
    </div>
  );
}
