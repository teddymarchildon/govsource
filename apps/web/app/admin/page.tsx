import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCurrentUserAndAdminStatus } from '@/utils/adminAuth';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const { user, isAdmin } = await getCurrentUserAndAdminStatus();
  if (!user || !isAdmin) redirect('/');
  const db = createAdminClient();
  const [review, drafts, live, settings] = await Promise.all([
    db.from('brief').select('id', { count: 'exact', head: true }).eq('status', 'review'),
    db.from('brief').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    db.from('brief').select('id', { count: 'exact', head: true }).eq('status', 'published').not('slug', 'is', null).lte('published_at', new Date().toISOString()),
    db.from('brief_pipeline_settings').select('daily_draft_limit,daily_budget_usd,editorial_review_required,publication_enabled').eq('id', true).single(),
  ]);
  const unavailable = review.error || drafts.error || live.error || settings.error;
  return <div className="container mx-auto max-w-6xl space-y-8 px-4 py-8">
    <header><p className="text-xs font-bold uppercase tracking-widest text-primary">GovSource admin</p><h1 className="mt-2 font-serif text-4xl font-semibold">Your editorial desk</h1><p className="mt-3 max-w-2xl text-muted-foreground">Review useful explanations, publish with confidence, and choose what readers see first.</p></header>
    {unavailable ? <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Some counts are unavailable. You can still open the tools below. Refresh this page to try again.</p> : null}
    <section className="grid gap-6 rounded-xl border border-primary/20 bg-white p-6 md:grid-cols-[1.4fr_1fr] md:p-8" aria-labelledby="review-heading">
      <div><p className="text-sm font-semibold text-primary">Start here</p><h2 id="review-heading" className="mt-2 font-serif text-3xl font-semibold">Review & publish</h2><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Read each draft, check its sources and practical value, then edit, publish, or archive it.</p><Link href="/admin/briefs" className="mt-5 inline-flex rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">Open review queue →</Link></div>
      <div className="grid grid-cols-3 items-center gap-3 border-t pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
        {[['Ready for review', review.error ? null : review.count, '/admin/briefs'], ['Drafts', drafts.error ? null : drafts.count, '/admin/briefs?status=draft'], ['Published', live.error ? null : live.count, '/admin/briefs?status=published']].map(([label, count, href]) => <Link href={String(href)} key={String(label)} className="rounded-md p-2 hover:bg-secondary"><span className="block font-serif text-3xl font-semibold">{count ?? '—'}</span><span className="mt-2 block text-xs text-muted-foreground">{label}</span></Link>)}
      </div>
    </section>
    <div className="grid gap-5 md:grid-cols-2">
      <Link href="/admin/briefs?view=generate" className="rounded-xl border bg-white p-6 transition hover:border-primary"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Find the next story</p><h2 className="mt-3 font-serif text-2xl font-semibold">Generate a draft →</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Request coverage from a document link, track requests, or draft a campaign-finance overview. To regenerate a brief, open it in the review workspace.</p></Link>
      <Link href="/admin/front-pages" className="rounded-xl border bg-white p-6 transition hover:border-primary"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Shape the front page</p><h2 className="mt-3 font-serif text-2xl font-semibold">Choose lead stories →</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Select the lead and supporting briefs on the homepage and section pages. Leave a slot empty for automatic selection.</p></Link>
    </div>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5" aria-labelledby="automation-heading"><div><h2 id="automation-heading" className="font-semibold">Background pipeline</h2><p className="mt-2 text-sm text-muted-foreground">{settings.data ? `${settings.data.editorial_review_required ? 'Manual review before publication' : settings.data.publication_enabled ? 'Automatic publication enabled' : 'Automatic publication paused'} · Up to ${settings.data.daily_draft_limit} drafts per day · $${Number(settings.data.daily_budget_usd).toFixed(2)} daily AI budget` : 'Check source freshness, generation progress, and daily limits.'}</p></div><Link href="/admin/pipeline" className="text-sm font-semibold text-primary underline underline-offset-4">Check pipeline & limits</Link></section>
    <p className="text-xs text-muted-foreground">Looking for source material? Browse <Link className="text-primary underline" href="/congress">Congress</Link>, <Link className="text-primary underline" href="/agencies">agencies</Link>, or <Link className="text-primary underline" href="/courts">courts</Link>, then copy a document link to request coverage.</p>
  </div>;
}
