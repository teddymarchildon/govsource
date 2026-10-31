'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Settings = { publication_enabled: boolean; daily_publication_limit: number; daily_budget_usd: number; daily_draft_limit?: number; editorial_review_required?: boolean };
type Job = { id: number; title: string | null; case_name: string | null; item_type: string; status: string; priority: number; reason: string; last_error: string | null; attempts: number };
type Overview = {
  settings: Settings;
  sources: { source: string; status: string; last_success_at: string | null; error: string | null }[];
  counts: Record<string, number>; pending_sources: number; oldest_waiting: string | null;
  spending: { accounted_usd: number; reserved_usd: number; calls: number };
  jobs: Job[];
  source_errors: { item_type: string; item_id: number; error: string; attempts: number }[];
};

function date(value: string | null) { return value ? new Date(value).toLocaleString() : 'No successful run yet'; }

export default function PipelinePage() {
  const [data, setData] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<Record<string, unknown>[] | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/brief-pipeline', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body); setSettings(body.settings); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load pipeline'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const dirty = Boolean(data && JSON.stringify(settings) !== JSON.stringify(data.settings));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function save() {
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/brief-pipeline', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings && { publication_enabled: settings.publication_enabled, daily_publication_limit: settings.daily_publication_limit, daily_budget_usd: settings.daily_budget_usd, daily_draft_limit: settings.daily_draft_limit }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setNotice('Daily limits saved. They apply to upcoming generation attempts.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save settings'); }
    finally { setSaving(false); }
  }
  async function inspect(id: number) {
    try {
      const response = await fetch(`/api/admin/brief-pipeline?job=${id}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setHistory(body.attempts);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load verification'); }
  }
  return <div className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
    <div className="flex items-center justify-between gap-4"><div><h1 className="font-serif text-3xl">Pipeline & limits</h1><p className="mt-2 text-muted-foreground">Check that source collection is running and manage daily generation limits.</p></div><button className="rounded border px-4 py-2 disabled:opacity-50" disabled={dirty || saving} onClick={() => void load()}>Refresh</button></div>
    {error && <p role="alert" className="rounded border border-red-300 p-4 text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded border p-4">{notice}</p>}
    {!data && !error && <p role="status">Loading pipeline…</p>}
    {data && settings && <>
      <section className="space-y-4 rounded-xl border bg-white p-5" aria-labelledby="limits-heading">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="limits-heading" className="text-xl font-semibold">Generation limits</h2><span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{data.settings.editorial_review_required ? 'Editor approval required' : data.settings.publication_enabled ? 'Automatic publication enabled' : 'Automatic publication paused'}</span></div>
        <p className="text-sm text-muted-foreground">Automatic and requested drafts share these limits. Reaching a limit pauses eligible work until the next budget day (midnight UTC). Drafts still need to pass the quality checks.</p>
        <div className="flex flex-wrap items-end gap-5">
          {settings.daily_draft_limit !== undefined && <label className="grid gap-1 text-sm font-medium">Maximum drafts per day<input className="w-36 rounded border p-2" type="number" min="0" max="100" value={settings.daily_draft_limit} onChange={e => setSettings({ ...settings, daily_draft_limit: Number(e.target.value) })} /></label>}
          <label className="grid gap-1 text-sm font-medium">Daily AI budget (USD)<input className="w-36 rounded border p-2" type="number" min="0" max="1000" step="0.01" value={settings.daily_budget_usd} onChange={e => setSettings({ ...settings, daily_budget_usd: Number(e.target.value) })} /></label>
          <button disabled={saving || !dirty} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" onClick={() => void save()}>{saving ? 'Saving…' : 'Save limits'}</button>
          {dirty ? <button className="text-sm underline" onClick={() => setSettings(data.settings)}>Discard changes</button> : null}
        </div>
        <div className="border-t pt-4"><p className="text-sm"><strong>${Number(data.spending.accounted_usd).toFixed(2)}</strong> of ${Number(data.settings.daily_budget_usd).toFixed(2)} accounted for today.</p><p className="mt-1 text-xs text-muted-foreground">Includes pending call reservations. New drafts appear in <Link href="/admin/briefs" className="text-primary underline">Review briefs</Link>; requested drafts can be tracked in <Link href="/admin/briefs?view=generate" className="text-primary underline">Generate drafts</Link>.</p></div>
      </section>
      <section aria-labelledby="sources-heading"><h2 id="sources-heading" className="mb-3 text-xl font-semibold">Source health</h2><div className="grid gap-3 sm:grid-cols-2">{data.sources.map(source => <div key={source.source} className="rounded border p-4"><h3 className="font-semibold">{source.source.replaceAll('_', ' ')} · {source.status}</h3><p className="mt-1 text-sm">Last success: {date(source.last_success_at)}</p>{source.error && <p className="mt-2 text-sm text-red-700">{source.error}</p>}</div>)}</div></section>
      <details className="rounded-xl border p-5"><summary className="cursor-pointer font-semibold">Detailed processing history & diagnostics</summary>
      <p className="my-4 text-sm text-muted-foreground">{data.pending_sources} source changes waiting · {data.spending.calls} AI calls today · ${Number(data.spending.reserved_usd).toFixed(2)} in pending reservations. Oldest waiting job: {data.oldest_waiting ? date(data.oldest_waiting) : 'None'}.</p>
      {data.source_errors.length > 0 && <section><h2 className="mb-3 text-xl font-semibold">Evidence awaiting recovery</h2><ul className="space-y-2">{data.source_errors.map(e => <li key={`${e.item_type}:${e.item_id}`} className="rounded border p-3 text-sm">{e.item_type} #{e.item_id}: {e.error} ({e.attempts} attempts)</li>)}</ul></section>}
      <section><h2 className="mb-3 text-xl font-semibold">Recent work</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Record</th><th className="p-3">Status</th><th className="p-3">Decision / issue</th><th className="p-3">Verification</th></tr></thead><tbody>{data.jobs.map(job => <tr key={job.id} className="border-b align-top"><td className="p-3">{job.title || job.case_name || `Job ${job.id}`}<span className="block text-xs text-muted-foreground">{job.item_type} · priority {job.priority} · {job.attempts} attempts</span></td><td className="p-3">{job.status}</td><td className="max-w-md p-3">{job.last_error || job.reason || 'Waiting to process'}</td><td className="p-3"><button className="text-primary underline" onClick={() => void inspect(job.id)}>Inspect job {job.id}</button></td></tr>)}</tbody></table>{data.jobs.length === 0 && <p className="p-4">No jobs yet. Source changes will appear after ingestion runs.</p>}</div></section>
      {history && <section className="rounded border p-4"><div className="flex justify-between"><h2 className="text-xl font-semibold">Verification history</h2><button className="underline" onClick={() => setHistory(null)}>Close</button></div>{history.length ? history.map((attempt, i) => <details key={i} className="mt-3"><summary className="cursor-pointer">Attempt {String(attempt.id)} · {attempt.passed ? 'Passed' : 'Failed'}</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(attempt, null, 2)}</pre></details>) : <p className="mt-3">No completed verification attempts.</p>}</section>}
      </details>
      <details className="rounded-xl border p-5"><summary className="cursor-pointer text-sm font-semibold">Additional tools</summary><div className="mt-4 flex flex-wrap gap-5 text-sm"><Link className="text-primary underline" href="/admin/records">Browse imported records</Link><Link className="text-primary underline" href="/admin/popular">Legacy record rankings</Link></div><p className="mt-3 text-xs text-muted-foreground">Use Front pages to choose the published briefs readers see first. Legacy record rankings are retained for older record-based placements.</p></details>
    </>}
  </div>;
}
