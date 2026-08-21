import Link from 'next/link';
import { ArrowRight, CalendarDays, Scale } from 'lucide-react';

import { getJudgeName, getOpinionTypeLabel } from '@/components/directory/directoryUtils';
import { PublicRecordCard } from '@/components/listing/PublicRecordCard';
import { Badge } from '@/components/ui/badge';
import type { Cluster, CourtOpinion } from '@/types/types';
import { formatDate } from '@/utils/utils';

interface CourtCaseCardProps {
  cluster: Cluster;
}

const PRIMARY_OPINION_ORDER = ['majority', '020lead', '010combined', 'combined', 'plurality', 'per curiam'];

function getPrimaryOpinion(opinions: CourtOpinion[]) {
  for (const type of PRIMARY_OPINION_ORDER) {
    const opinion = opinions.find((candidate) => candidate.type?.toLowerCase() === type);
    if (opinion) return opinion;
  }
  return opinions.find((opinion) => opinion.author) || opinions[0];
}

function getOpinionCounts(opinions: CourtOpinion[]) {
  const counts = new Map<string, number>();
  opinions.forEach((opinion) => {
    const label = getOpinionTypeLabel(opinion.type);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()].slice(0, 3);
}

export default function CourtCaseCard({ cluster }: CourtCaseCardProps) {
  const opinions = cluster.opinions || [];
  const primaryOpinion = getPrimaryOpinion(opinions);
  const opinionCounts = getOpinionCounts(opinions);
  const courtName = cluster.court?.short_name || cluster.court?.full_name || 'Supreme Court';

  return (
    <PublicRecordCard
      href={`/supreme-court-cases/${cluster.id}`}
      eyebrow="Supreme Court case"
      title={cluster.case_name}
      badge={cluster.date_filed ? <Badge variant="outline" className="gap-1 whitespace-nowrap font-normal text-muted-foreground"><CalendarDays className="h-3 w-3" />{formatDate(cluster.date_filed)}</Badge> : undefined}
      footer={<div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Scale className="h-3.5 w-3.5" />{courtName}</span><span aria-hidden="true">·</span><span>{opinions.length} opinion{opinions.length === 1 ? '' : 's'}</span><span className="ml-auto inline-flex items-center gap-1 font-medium text-primary">Open case <ArrowRight className="h-3.5 w-3.5" /></span></div>}
    >
      <div className="space-y-3">
        {cluster.case_name_short && cluster.case_name_short !== cluster.case_name ? <p className="line-clamp-1 text-sm text-muted-foreground">{cluster.case_name_short}</p> : null}
        {primaryOpinion?.author ? <p className="text-sm text-muted-foreground">{getOpinionTypeLabel(primaryOpinion.type)} by{' '}<Link href={`/judges/${primaryOpinion.author.id}`} className="relative z-10 font-medium text-foreground hover:text-primary hover:underline">{getJudgeName(primaryOpinion.author)}</Link></p> : null}
        {opinionCounts.length ? <div className="flex flex-wrap gap-1.5">{opinionCounts.map(([label, count]) => <Badge key={label} variant="secondary" className="font-normal">{count} {label}</Badge>)}</div> : <p className="text-sm text-muted-foreground">No opinions are currently listed.</p>}
      </div>
    </PublicRecordCard>
  );
}
