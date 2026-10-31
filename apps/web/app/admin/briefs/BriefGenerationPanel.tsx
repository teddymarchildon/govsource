'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type GenerationRequest = {
  id: number; source_type: string; item_id: number; original_brief_id: number | null;
  status: string; error: string | null;
  job: { status: string; reason: string | null; last_error: string | null; brief_id: number | null; next_attempt_at: string; title?: string } | null;
};
const sourcePaths: Record<string, string> = { bill: 'bills', agency_document: 'agency-rules', cluster: 'supreme-court-cases' };

export default function BriefGenerationPanel({ selected, initialUrl, onOpen }: {
  selected: { id: number; title: string; primary_item_type: string } | null;
  initialUrl?: string;
  onOpen: (id: number) => void;
}) {
  const [url, setUrl] = useState(initialUrl || '');
  const [requests, setRequests] = useState<GenerationRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/brief-requests', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load requests.');
      setRequests(data.requests); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load requests.'); }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function queue(input: { briefId: number } | { url: string }) {
    if (busy) return;
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/brief-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not request a draft.');
      await refresh();
      setMessage(`Request #${data.requestId} saved. Any existing active request or review draft is reused. Your published brief is unchanged.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not request a draft.'); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5" aria-labelledby="generate-brief-title">
    <h2 id="generate-brief-title" className="text-lg font-semibold">Generate from a document</h2>
    <p className="mt-1 text-sm text-gray-600">Paste a GovSource document link, including older records. Requests run in the background on the next pipeline run, usually within about 30 minutes. Daily draft and spending limits still apply; requests may wait until the next day. Quality checks must pass before a separate review draft appears.</p>
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void queue({ url }); }}>
      <label className="min-w-0 flex-1 text-sm font-medium">GovSource document link<Input className="mt-1" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://www.govsrc.com/agency-rules/123" required /></label>
      <Button disabled={busy || !url.trim()} type="submit">{busy ? 'Requesting…' : 'Request draft'}</Button>
    </form>
    {selected && selected.primary_item_type !== 'campaign_finance' ? <div className="mt-4 border-t pt-4">
      <p className="mb-2 text-sm">Selected brief: <strong>{selected.title}</strong></p>
      <Button variant="outline" disabled={busy} onClick={() => void queue({ briefId: selected.id })}>Regenerate as a separate review draft</Button>
      <p className="mt-2 text-xs text-gray-600">Uses the stored source document. Current content and unsaved edits are not changed. If you publish the new draft, archive the older version when appropriate.</p>
    </div> : null}
    {message ? <p role="status" className="mt-3 text-sm text-green-800">{message}</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    <div className="mt-4 flex items-center justify-between"><h3 className="text-sm font-semibold">Recent generation requests</h3><Button size="sm" variant="outline" onClick={() => void refresh()}>Refresh</Button></div>
    {requests.length ? <ul className="mt-2 max-h-80 divide-y overflow-auto">{requests.map(request => {
      const job = request.job;
      const failed = request.status === 'failed' || ['withheld', 'skipped', 'superseded'].includes(job?.status || '');
      const label = job?.brief_id ? 'Draft created' : failed ? 'Needs attention' : job?.status === 'processing' ? 'Generating and checking' : job?.status === 'verified' ? 'Waiting to enter review' : job?.status === 'retry' ? 'Waiting to retry' : 'Queued';
      return <li key={request.id} className="py-3 text-sm">
        <p className="font-medium">{job?.title || `${request.source_type.replaceAll('_', ' ')} #${request.item_id}`}</p>
        <p className="mt-1 text-gray-600">Request #{request.id} · {label}</p>
        {!job?.brief_id && (request.error || job?.last_error || job?.reason) ? <p className="mt-1 text-gray-600">{request.error || job?.last_error || job?.reason}</p> : null}
        {job?.status === 'retry' ? <p className="mt-1 text-xs text-gray-600">Next eligible attempt: {new Date(job.next_attempt_at).toLocaleString()}</p> : null}
        {job?.brief_id ? <Button className="mt-2" size="sm" variant="outline" onClick={() => onOpen(job.brief_id!)}>Open draft</Button> : failed ? <Button className="mt-2" size="sm" variant="outline" disabled={busy} onClick={() => void queue(request.original_brief_id ? { briefId: request.original_brief_id } : { url: `https://www.govsrc.com/${sourcePaths[request.source_type]}/${request.item_id}` })}>Try again</Button> : null}
      </li>;
    })}</ul> : <p className="mt-2 text-sm text-gray-500">No generation requests yet.</p>}
  </section>;
}
