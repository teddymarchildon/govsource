'use client';

import { useMemo } from 'react';
import { ArrowUpRight, CalendarDays, Globe, Landmark, MapPin, Phone } from 'lucide-react';

import BillCard from '@/components/BillCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import SaveButton from '@/components/SaveButton';
import { getInitials, getMemberRole, getPartyBadgeClass, getPartyLabel } from '@/components/directory/directoryUtils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Bill, Congressman, CongressmanTerm } from '@/types/types';

type Props = { member: Congressman; sponsoredBills: Bill[]; cosponsoredBills: Bill[]; terms: CongressmanTerm[] };
type PolicyAreaStat = { total: number; becameLaw: number };
type YearStat = { total: number; sponsored: number; cosponsored: number; becameLaw: number };

const formatTermYears = (term: CongressmanTerm) => `${term.start_year}–${term.end_year || 'Present'}`;
const formatTermPosition = (term: CongressmanTerm) => getMemberRole({ chamber: term.chamber, state: term.state, district: term.district });
const isDifferentParty = (party: string, other?: string) => Boolean(other) && getPartyLabel(party) !== getPartyLabel(other);

function EmptyState({ children }: { children: string }) {
  return <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">{children}</div>;
}

export default function CongressMemberDetailClient({ member, sponsoredBills, cosponsoredBills, terms }: Props) {
  const stats = useMemo(() => {
    const allBills = [...sponsoredBills, ...cosponsoredBills];
    const policyAreas = allBills.reduce<Record<string, PolicyAreaStat>>((areas, bill) => {
      const area = bill.policy_area || 'Uncategorized';
      areas[area] ??= { total: 0, becameLaw: 0 };
      areas[area].total += 1;
      if (bill.law_enacted_date) areas[area].becameLaw += 1;
      return areas;
    }, {});
    const activityByYear: Record<string, YearStat> = {};
    const addActivity = (bill: Bill, kind: 'sponsored' | 'cosponsored') => {
      const year = bill.introduced_date?.slice(0, 4);
      if (!year) return;
      activityByYear[year] ??= { total: 0, sponsored: 0, cosponsored: 0, becameLaw: 0 };
      activityByYear[year].total += 1;
      activityByYear[year][kind] += 1;
      if (bill.law_enacted_date) activityByYear[year].becameLaw += 1;
    };
    sponsoredBills.forEach((bill) => addActivity(bill, 'sponsored'));
    cosponsoredBills.forEach((bill) => addActivity(bill, 'cosponsored'));

    const crossPartyBills = sponsoredBills.filter((bill) =>
      (bill.cosponsors || []).some(({ congressman }) => isDifferentParty(member.party, congressman?.party)),
    ).length + cosponsoredBills.filter((bill) => isDifferentParty(member.party, bill.sponsor?.congressman?.party)).length;

    return {
      total: allBills.length,
      becameLaw: allBills.filter((bill) => bill.law_enacted_date).length,
      crossPartyBills,
      policyAreas: Object.entries(policyAreas).sort(([, a], [, b]) => b.total - a.total),
      activityByYear: Object.entries(activityByYear).sort(([a], [b]) => Number(b) - Number(a)),
    };
  }, [cosponsoredBills, member.party, sponsoredBills]);

  const currentTerm = terms.find((term) => !term.end_year) || terms[0];

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumbs steps={[{ label: 'Home', href: '/' }, { label: 'Congress members', href: '/congress-members' }, { label: member.full_name }]} />

      <header className="mt-5 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="h-1.5 bg-primary" />
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-start md:justify-between md:p-8">
          <div className="flex min-w-0 items-start gap-4 md:gap-6">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary ring-1 ring-primary/15 md:h-20 md:w-20 md:text-2xl">{getInitials(member.full_name)}</div>
            <div className="min-w-0">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary"><Landmark className="h-4 w-4" /> Member of Congress</p>
              <h1 className="text-balance text-3xl font-bold leading-tight text-foreground md:text-4xl">{member.full_name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline" className={getPartyBadgeClass(member.party)}>{getPartyLabel(member.party)}</Badge>
                <span>{getMemberRole(member)}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {member.phone ? <a href={`tel:${member.phone}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary"><Phone className="h-4 w-4" />{member.phone}</a> : null}
                {member.website ? <a href={member.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><Globe className="h-4 w-4" />Official website<ArrowUpRight className="h-3.5 w-3.5" /></a> : null}
              </div>
            </div>
          </div>
          <SaveButton itemId={member.id} itemType="congressman" />
        </div>
        <div className="grid border-t border-border/70 bg-muted/20 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Sponsored', sponsoredBills.length], ['Cosponsored', cosponsoredBills.length], ['Became law', stats.becameLaw], ['Most recent term', currentTerm ? `${currentTerm.congress}th Congress` : 'Not listed'],
          ].map(([label, value]) => <div key={label} className="border-b border-border/60 px-6 py-4 last:border-b-0 sm:border-l sm:first:border-l-0 lg:border-b-0"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold text-foreground">{value}</p></div>)}
        </div>
      </header>

      <Tabs defaultValue="bills" className="mt-8">
        <TabsList>
          <TabsTrigger value="bills">Bills <Badge variant="outline">{stats.total}</Badge></TabsTrigger>
          <TabsTrigger value="terms">Terms <Badge variant="outline">{terms.length}</Badge></TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value="bills" className="mt-6 space-y-10">
          <BillSection title="Sponsored bills" description="Legislation introduced by this member." bills={sponsoredBills} empty="No sponsored bills are available." />
          <BillSection title="Cosponsored bills" description="Legislation this member formally supported." bills={cosponsoredBills} empty="No cosponsored bills are available." />
        </TabsContent>

        <TabsContent value="terms" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-xl"><CalendarDays className="h-5 w-5 text-primary" />Congressional service</CardTitle></CardHeader>
            <CardContent>
              {terms.length ? <div className="divide-y divide-border">{terms.map((term) => (
                <div key={term.id} className="grid gap-2 py-5 first:pt-0 last:pb-0 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
                  <div><p className="font-semibold">{term.congress}th Congress</p><p className="text-sm text-muted-foreground">{formatTermYears(term)}</p></div>
                  <p className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" />{formatTermPosition(term)}</p>
                  {!term.end_year ? <Badge>Current</Badge> : null}
                </div>
              ))}</div> : <EmptyState>No congressional terms are available.</EmptyState>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statistics" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Total bill activity', stats.total, 'Sponsored and cosponsored'],
              ['Sponsored', sponsoredBills.length, 'Introduced by this member'],
              ['Became law', stats.becameLaw, stats.total ? `${Math.round((stats.becameLaw / stats.total) * 100)}% of listed bills` : 'No listed bills'],
              ['Cross-party bills', stats.crossPartyBills, 'Based on listed sponsors'],
            ].map(([label, value, helper]) => <Card key={label}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{helper}</p></CardContent></Card>)}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-xl">Top policy areas</CardTitle></CardHeader><CardContent className="space-y-4">
              {stats.policyAreas.length ? stats.policyAreas.slice(0, 8).map(([area, data]) => <div key={area}>
                <div className="mb-1.5 flex justify-between gap-4 text-sm"><span className="font-medium">{area}</span><span className="text-muted-foreground">{data.total} bill{data.total === 1 ? '' : 's'}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(5, (data.total / stats.policyAreas[0][1].total) * 100)}%` }} /></div>
                {data.becameLaw ? <p className="mt-1 text-xs text-muted-foreground">{data.becameLaw} became law</p> : null}
              </div>) : <EmptyState>No policy-area data is available.</EmptyState>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-xl">Activity by year</CardTitle></CardHeader><CardContent>
              {stats.activityByYear.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3 font-medium">Year</th><th className="pb-3 text-right font-medium">Sponsored</th><th className="pb-3 text-right font-medium">Cosponsored</th><th className="pb-3 text-right font-medium">Law</th></tr></thead><tbody>{stats.activityByYear.map(([year, data]) => <tr key={year} className="border-b border-border/60 last:border-0"><td className="py-3 font-medium">{year}</td><td className="py-3 text-right">{data.sponsored}</td><td className="py-3 text-right">{data.cosponsored}</td><td className="py-3 text-right">{data.becameLaw}</td></tr>)}</tbody></table></div> : <EmptyState>No dated bill activity is available.</EmptyState>}
            </CardContent></Card>
          </div>
          <p className="text-xs text-muted-foreground">Statistics reflect the bills currently available in GovSource and are descriptive, not an effectiveness rating.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BillSection({ title, description, bills, empty }: { title: string; description: string; bills: Bill[]; empty: string }) {
  return <section><div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><Badge variant="secondary">{bills.length}</Badge></div>{bills.length ? <div className="grid gap-4 lg:grid-cols-2">{bills.map((bill) => <BillCard key={bill.id} bill={bill} />)}</div> : <EmptyState>{empty}</EmptyState>}</section>;
}
