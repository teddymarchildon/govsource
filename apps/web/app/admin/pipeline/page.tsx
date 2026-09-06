'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Settings = { publication_enabled: boolean; daily_publication_limit: number; daily_budget_usd: number };
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
  async function save() {
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/brief-pipeline', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings && { publication_enabled: settings.publication_enabled, daily_publication_limit: settings.daily_publication_limit, daily_budget_usd: settings.daily_budget_usd }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setNotice('Settings saved. Publication changes apply to the next publication attempt.');
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
  return <main className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
    <Link href="/admin" className="text-sm text-primary underline">Back to admin</Link>
    <div className="flex items-center justify-between gap-4"><div><h1 className="font-serif text-3xl">Brief pipeline</h1><p className="mt-2 text-muted-foreground">Source freshness, automatic verification, and publication controls.</p></div><button className="rounded border px-4 py-2" onClick={() => void load()}>Refresh</button></div>
    {error && <p role="alert" className="rounded border border-red-300 p-4 text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded border p-4">{notice}</p>}
    {!data && !error && <p role="status">Loading pipeline…</p>}
    {data && settings && <>
      <section className="space-y-4 rounded border p-5" aria-labelledby="publication-heading">
        <h2 id="publication-heading" className="text-xl font-semibold">Automatic publication {data.settings.publication_enabled ? 'is enabled' : 'is paused'}</h2>
        <p className="text-sm text-muted-foreground">While paused, processing can continue and passing briefs remain unpublished. Enable publication after benchmark evaluation. Spending uses configured model price ceilings; unresolved calls retain their reservation.</p>
        <div className="flex flex-wrap items-end gap-6">
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.publication_enabled} onChange={e => setSettings({ ...settings, publication_enabled: e.target.checked })} />Enable automatic publication</label>
          <label className="grid gap-1 text-sm">Daily publication limit<input className="w-32 rounded border p-2" type="number" min="0" max="1000" value={settings.daily_publication_limit} onChange={e => setSettings({ ...settings, daily_publication_limit: Number(e.target.value) })} /></label>
          <label className="grid gap-1 text-sm">Daily AI budget (USD)<input className="w-32 rounded border p-2" type="number" min="0" max="1000" step="0.01" value={settings.daily_budget_usd} onChange={e => setSettings({ ...settings, daily_budget_usd: Number(e.target.value) })} /></label>
          <button disabled={saving} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" onClick={() => void save()}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-4" aria-label="Pipeline totals">
        {[['Published', data.counts.published || 0], ['Verified, awaiting publication', data.counts.verified || 0], ['Withheld', data.counts.withheld || 0], ['Source changes waiting', data.pending_sources]].map(([label, value]) => <div key={label} className="rounded border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}
      </section>
      <p className="text-sm">Today: ${Number(data.spending.accounted_usd).toFixed(2)} accounted for ({data.spending.calls} calls), including ${Number(data.spending.reserved_usd).toFixed(2)} in unresolved reservations. Oldest waiting job: {data.oldest_waiting ? date(data.oldest_waiting) : 'None'}.</p>
      <section aria-labelledby="sources-heading"><h2 id="sources-heading" className="mb-3 text-xl font-semibold">Source health</h2><div className="grid gap-3 sm:grid-cols-2">{data.sources.map(source => <div key={source.source} className="rounded border p-4"><h3 className="font-semibold">{source.source.replaceAll('_', ' ')} · {source.status}</h3><p className="mt-1 text-sm">Last success: {date(source.last_success_at)}</p>{source.error && <p className="mt-2 text-sm text-red-700">{source.error}</p>}</div>)}</div></section>
      {data.source_errors.length > 0 && <section><h2 className="mb-3 text-xl font-semibold">Evidence awaiting recovery</h2><ul className="space-y-2">{data.source_errors.map(e => <li key={`${e.item_type}:${e.item_id}`} className="rounded border p-3 text-sm">{e.item_type} #{e.item_id}: {e.error} ({e.attempts} attempts)</li>)}</ul></section>}
      <section><h2 className="mb-3 text-xl font-semibold">Recent work</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Record</th><th className="p-3">Status</th><th className="p-3">Decision / issue</th><th className="p-3">Verification</th></tr></thead><tbody>{data.jobs.map(job => <tr key={job.id} className="border-b align-top"><td className="p-3">{job.title || job.case_name || `Job ${job.id}`}<span className="block text-xs text-muted-foreground">{job.item_type} · priority {job.priority} · {job.attempts} attempts</span></td><td className="p-3">{job.status}</td><td className="max-w-md p-3">{job.last_error || job.reason || 'Waiting to process'}</td><td className="p-3"><button className="text-primary underline" onClick={() => void inspect(job.id)}>Inspect job {job.id}</button></td></tr>)}</tbody></table>{data.jobs.length === 0 && <p className="p-4">No jobs yet. Source changes will appear after ingestion runs.</p>}</div></section>
      {history && <section className="rounded border p-4"><div className="flex justify-between"><h2 className="text-xl font-semibold">Verification history</h2><button className="underline" onClick={() => setHistory(null)}>Close</button></div>{history.length ? history.map((attempt, i) => <details key={i} className="mt-3"><summary className="cursor-pointer">Attempt {String(attempt.id)} · {attempt.passed ? 'Passed' : 'Failed'}</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(attempt, null, 2)}</pre></details>) : <p className="mt-3">No completed verification attempts.</p>}</section>}
    </>}
  </main>;
}
