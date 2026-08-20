import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight, Building2, FileText, Network } from 'lucide-react';

import AgencyCard from '@/components/AgencyCard';
import AgencyDocuments from '@/components/AgencyDocuments';
import Breadcrumbs from '@/components/Breadcrumbs';
import SaveButton from '@/components/SaveButton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Agency, AgencyDocument } from '@/types/types';

type Props = { agencyId: string; agency: Agency; childAgencies: Agency[]; documents: AgencyDocument[] };

export default function AgencyDetailClient({ agencyId, agency, childAgencies, documents }: Props) {
  const isTopLevel = agency.parent_id == null;

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumbs steps={[{ label: 'Home', href: '/' }, { label: 'Federal agencies', href: '/agencies' }, { label: agency.name }]} />

      <header className="mt-5 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="h-1.5 bg-primary" />
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-start md:justify-between md:p-8">
          <div className="flex min-w-0 items-start gap-4 md:gap-6">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 md:h-20 md:w-20"><Building2 className="h-8 w-8 md:h-10 md:w-10" /></div>
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Federal agency</p>
                {isTopLevel ? <Badge variant="secondary">Top-level agency</Badge> : null}
              </div>
              <h1 className="text-balance text-3xl font-bold leading-tight text-foreground md:text-4xl">{agency.name}</h1>
              {agency.short_name ? <p className="mt-2 text-lg font-medium text-muted-foreground">{agency.short_name}</p> : null}
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                {agency.parent ? <span className="text-muted-foreground">Part of <Link href={`/agencies/${agency.parent.id}`} className="font-medium text-primary hover:underline">{agency.parent.name}</Link></span> : null}
                {agency.url ? <a href={agency.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Agency source <ArrowUpRight className="h-3.5 w-3.5" /></a> : null}
              </div>
            </div>
          </div>
          <SaveButton itemId={agencyId} itemType="agency" />
        </div>
        <div className="grid border-t border-border/70 bg-muted/20 sm:grid-cols-2">
          <div className="px-6 py-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sub-agencies</p><p className="mt-1 text-xl font-semibold">{childAgencies.length}</p></div>
          <div className="border-t border-border/60 px-6 py-4 sm:border-l sm:border-t-0"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Published documents</p><p className="mt-1 text-xl font-semibold">{documents.length}</p></div>
        </div>
      </header>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-xl">About this agency</CardTitle></CardHeader>
        <CardContent>
          {agency.description ? <p className="max-w-4xl whitespace-pre-line text-sm leading-7 text-muted-foreground md:text-base">{agency.description}</p> : <p className="text-sm italic text-muted-foreground">No agency description is currently available.</p>}
        </CardContent>
      </Card>

      <Tabs defaultValue={childAgencies.length ? 'subagencies' : 'documents'} className="mt-8">
        <TabsList>
          <TabsTrigger value="subagencies"><Network className="h-4 w-4" />Sub-agencies <Badge variant="outline">{childAgencies.length}</Badge></TabsTrigger>
          <TabsTrigger value="documents"><FileText className="h-4 w-4" />Documents <Badge variant="outline">{documents.length}</Badge></TabsTrigger>
        </TabsList>
        <TabsContent value="subagencies" className="mt-6">
          <div className="mb-4"><h2 className="text-xl font-semibold">Agency structure</h2><p className="mt-1 text-sm text-muted-foreground">Offices and agencies directly organized under {agency.short_name || agency.name}.</p></div>
          {childAgencies.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{childAgencies.map((child) => <AgencyCard key={child.id} agency={{ ...child, parent: agency }} />)}</div> : <EmptyAgencyState icon={<Network className="h-6 w-6" />} title="No sub-agencies listed" body="This agency has no directly connected sub-agencies in GovSource." />}
        </TabsContent>
        <TabsContent value="documents" className="mt-6">
          <div className="mb-4"><h2 className="text-xl font-semibold">Published documents</h2><p className="mt-1 text-sm text-muted-foreground">Rules, notices, executive orders, and other records connected to this agency.</p></div>
          <AgencyDocuments documents={documents} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyAgencyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center"><div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">{icon}</div><h3 className="font-semibold">{title}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p></div>;
}
