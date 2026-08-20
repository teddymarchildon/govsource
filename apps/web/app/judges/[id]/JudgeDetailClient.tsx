import Link from 'next/link';
import { ArrowRight, CalendarDays, Scale, Users } from 'lucide-react';

import Breadcrumbs from '@/components/Breadcrumbs';
import SaveButton from '@/components/SaveButton';
import { getInitials, getJudgeName, getOpinionTypeLabel } from '@/components/directory/directoryUtils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { CourtOpinion, Judge } from '@/types/types';
import { formatDate } from '@/utils/utils';

export default function JudgeDetailClient({ judge, opinions }: { judge: Judge; opinions: CourtOpinion[] }) {
  const fullName = getJudgeName(judge);

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumbs steps={[{ label: 'Home', href: '/' }, { label: 'Supreme Court justices', href: '/judges' }, { label: fullName }]} />

      <header className="mt-5 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="h-1.5 bg-primary" />
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-start md:justify-between md:p-8">
          <div className="flex min-w-0 items-start gap-4 md:gap-6">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary ring-1 ring-primary/15 md:h-20 md:w-20 md:text-2xl">{getInitials(fullName)}</div>
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary"><Scale className="h-4 w-4" /> Supreme Court justice</p>
              <h1 className="text-balance text-3xl font-bold leading-tight text-foreground md:text-4xl">{fullName}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Explore authored Supreme Court opinions available in GovSource.</p>
            </div>
          </div>
          <SaveButton itemId={judge.id} itemType="judge" />
        </div>
        <div className="border-t border-border/70 bg-muted/20 px-6 py-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent opinions shown</p><p className="mt-1 text-xl font-semibold">{opinions.length}</p></div>
      </header>

      <section className="mt-8">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-2xl font-bold">Authored opinions</h2><p className="mt-1 text-sm text-muted-foreground">The latest opinions in the record, ordered by filing date.</p></div>
          {opinions.length ? <Badge variant="secondary">Latest {opinions.length}</Badge> : null}
        </div>

        {opinions.length ? (
          <div className="space-y-4">
            {opinions.map((opinion) => {
              const court = opinion.court || opinion.cluster?.court;
              const caseName = opinion.cluster?.case_name || opinion.cluster?.case_name_short || opinion.title || 'Unnamed case';
              return (
                <Card key={opinion.id} className="transition-colors hover:border-primary/30">
                  <CardContent className="p-5 md:p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{getOpinionTypeLabel(opinion.type)}</Badge>
                          {court?.full_name ? <Badge variant="outline">{court.full_name}</Badge> : null}
                        </div>
                        <h3 className="text-lg font-semibold leading-snug md:text-xl">
                          {opinion.cluster?.id ? <Link href={`/supreme-court-cases/${opinion.cluster.id}`} className="hover:text-primary hover:underline">{caseName}</Link> : caseName}
                        </h3>
                        {opinion.cluster?.case_name_short && opinion.cluster.case_name_short !== caseName ? <p className="mt-1 text-sm text-muted-foreground">{opinion.cluster.case_name_short}</p> : null}
                      </div>
                      {opinion.date ? <time dateTime={opinion.date} className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" />{formatDate(opinion.date)}</time> : null}
                    </div>

                    {opinion.joined_by?.length ? (
                      <div className="mt-4 flex items-start gap-2 border-t border-border/60 pt-4 text-sm text-muted-foreground">
                        <Users className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Joined by {opinion.joined_by.map((joinedJudge, index) => <span key={joinedJudge.id}><Link href={`/judges/${joinedJudge.id}`} className="font-medium text-foreground hover:text-primary hover:underline">{getJudgeName(joinedJudge)}</Link>{index < opinion.joined_by.length - 1 ? ', ' : ''}</span>)}</span>
                      </div>
                    ) : null}

                    {opinion.cluster?.id ? <Link href={`/supreme-court-cases/${opinion.cluster.id}`} className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Read the case and opinion <ArrowRight className="h-3.5 w-3.5" /></Link> : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center"><div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground"><Scale className="h-6 w-6" /></div><h3 className="font-semibold">No authored opinions listed</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">GovSource does not currently have an authored opinion connected to this justice.</p></div>
        )}
      </section>
    </div>
  );
}
