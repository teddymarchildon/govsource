import Link from 'next/link';
import { Agency } from '../types/types';
import { ArrowRight, ArrowUpRight, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface AgencyCardProps {
  agency: Agency;
}

export default function AgencyCard({ agency }: AgencyCardProps) {
  return (
    <Card className="group relative flex h-full overflow-hidden border-border/80 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg focus-within:ring-2 focus-within:ring-primary/30">
      <CardContent className="flex w-full flex-col p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Federal agency</span>
              {agency.parent_id == null ? <Badge variant="secondary">Top-level</Badge> : null}
            </div>
            <h2 className="text-lg font-semibold leading-snug text-foreground">
              <Link href={`/agencies/${agency.id}`} className="after:absolute after:inset-0 group-hover:text-primary">
                {agency.name}
              </Link>
            </h2>
            {agency.short_name ? <p className="mt-1 text-sm font-medium text-muted-foreground">{agency.short_name}</p> : null}
          </div>
        </div>

        {agency.parent ? <p className="mt-4 text-xs text-muted-foreground">Part of <span className="font-medium text-foreground">{agency.parent.short_name || agency.parent.name}</span></p> : null}
        {agency.description ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{agency.description}</p> : null}

        <div className="mt-auto flex items-center gap-3 border-t border-border/60 pt-4 text-sm font-medium text-primary">
          <span className="inline-flex items-center gap-1">Explore agency <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
          {agency.url ? (
            <a href={agency.url} target="_blank" rel="noopener noreferrer" className="relative z-10 ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-primary hover:underline">
              Agency source <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
