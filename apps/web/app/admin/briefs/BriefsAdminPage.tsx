'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import BriefGenerationPanel from './BriefGenerationPanel';
import ReactMarkdown from 'react-markdown';
import { getContentHref } from '@/utils/contentReferences';
import { getBriefAuthorName } from '@/utils/briefAuthor';
import { publicationIssues, sourceHost } from '@/lib/briefReview';
import { Button } from '@/components/ui/button';
import CongressmanSearchSelect from '@/components/CongressmanSearchSelect';
import { Input } from '@/components/ui/input';
import type { BriefPoint, BriefSource, BriefStatus } from '@/types/brief';
import type { ContentType } from '@/types/content';

type AdminBrief = {
  id: number;
  version: number;
  status: BriefStatus;
  title: string;
  display_title: string | null;
  slug: string | null;
  dek: string | null;
  points: BriefPoint[];
  context_markdown: string | null;
  primary_item_type: ContentType;
  primary_item_id: number;
  contribution_cycle?: number | null;
  policy_areas: string[];
  sources: BriefSource[];
  author_name: string | null;
  editor_notes: string | null;
  published_at: string | null;
  is_featured: boolean;
  featured_until: string | null;
  auto_generated: boolean;
  updated_at: string;
};

type FormState = {
  title: string;
  display_title: string;
  slug: string;
  dek: string;
  points: BriefPoint[];
  context_markdown: string;
  primary_item_type: ContentType;
  primary_item_id: string;
  contribution_cycle: string;
  policy_areas: string;
  source_urls: string;
  author_name: string;
  editor_notes: string;
  status: BriefStatus;
  published_at: string;
  is_featured: boolean;
  featured_until: string;
};

const EMPTY_FORM: FormState = {
  title: '',
  display_title: '',
  slug: '',
  dek: '',
  points: [1, 2, 3].map((index) => ({ id: `point_${index}`, text: '', label: '', source_refs: ['primary'] })),
  context_markdown: '',
  primary_item_type: 'bill',
  primary_item_id: '',
  contribution_cycle: '',
  policy_areas: '',
  source_urls: '',
  author_name: '',
  editor_notes: '',
  status: 'draft',
  published_at: '',
  is_featured: false,
  featured_until: '',
};

const STATUS_LABELS: Record<BriefStatus, string> = {
  draft: 'Draft',
  review: 'In review',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
};

const TYPE_LABELS: Record<ContentType, string> = {
  bill: 'Bill',
  law: 'Law',
  agency_document: 'Agency document',
  executive_order: 'Executive order',
  cluster: 'Supreme Court case',
  campaign_finance: 'Campaign finance',
};

function toLocalDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function buildForm(brief: AdminBrief): FormState {
  return {
    title: brief.title,
    display_title: brief.display_title || '',
    slug: brief.slug || '',
    dek: brief.dek || '',
    points: brief.points.length ? brief.points.map((point) => ({ ...point })) : EMPTY_FORM.points,
    context_markdown: brief.context_markdown || '',
    primary_item_type: brief.primary_item_type,
    primary_item_id: String(brief.primary_item_id),
    contribution_cycle: brief.contribution_cycle ? String(brief.contribution_cycle) : '',
    policy_areas: brief.policy_areas.join(', '),
    source_urls: brief.sources.map((source) => source.url).join('\n'),
    author_name: getBriefAuthorName(brief.author_name) || '',
    editor_notes: brief.editor_notes || '',
    status: brief.status,
    published_at: toLocalDateTime(brief.published_at),
    is_featured: brief.is_featured,
    featured_until: toLocalDateTime(brief.featured_until),
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function BriefsAdminPage({
  initialSource,
}: {
  initialSource: { type: ContentType; id: string; title: string } | null;
}) {
  const initialForm = useMemo<FormState>(() => initialSource
    ? { ...EMPTY_FORM, title: initialSource.title, primary_item_type: initialSource.type, primary_item_id: initialSource.id }
    : EMPTY_FORM, [initialSource]);
  const [briefs, setBriefs] = useState<AdminBrief[]>([]);
  const [selected, setSelected] = useState<AdminBrief | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editing, setEditing] = useState(Boolean(initialSource));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [contributionMember, setContributionMember] = useState<string>('');
  const [contributionCycle, setContributionCycle] = useState(String(Math.ceil(new Date().getFullYear() / 2) * 2));
  const [generating, setGenerating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | BriefStatus>('review');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const editorPanel = useRef<HTMLElement>(null);
  const [sourceIds, setSourceIds] = useState<Record<string, string>>({});
  const [view, setView] = useState<'review' | 'edit'>(initialSource ? 'edit' : 'review');
  const [reviewed, setReviewed] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const baseline = useRef(JSON.stringify(initialForm));
  const dirty = editing && JSON.stringify(form) !== baseline.current;
  const urls = [...new Set(form.source_urls.split('\n').map(url => url.trim()).filter(Boolean))];
  const sources = urls.map((url, index) => selected?.sources.find(source => source.url === url) || { id: sourceIds[url] || `new_source_${index}`, label: `Source ${index + 1}`, url });
  const issues = publicationIssues({ ...form, sources });
  const busy = saving || generating || opening !== null;
  const discardDialog = useRef<HTMLDialogElement>(null);
  const discardDecision = useRef<((discard: boolean) => void) | null>(null);
  const canLeave = async () => {
    if (!dirty) return true;
    return new Promise<boolean>(resolve => {
      discardDecision.current = resolve;
      discardDialog.current?.showModal();
    });
  };
  const finishDiscard = (discard: boolean) => {
    discardDialog.current?.close();
    discardDecision.current?.(discard);
    discardDecision.current = null;
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (editing && window.matchMedia('(max-width: 1279px)').matches) {
      editorPanel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [selected?.id, editing]);

  const loadBriefs = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    const params = new URLSearchParams({ limit: '25', page: String(page) });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());
    try {
      const response = await fetch(`/api/admin/briefs?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to load Briefs');
      if (request !== listRequest.current) return;
      setBriefs(payload.briefs || []);
      setTotal(payload.pagination?.total || 0);
    } catch (error) {
      if (request === listRequest.current) setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load Briefs' });
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [search, statusFilter, page]);

  const invalidateList = useCallback(() => { listRequest.current++; }, []);
  useEffect(() => {
    const timeout = setTimeout(loadBriefs, 250);
    return () => { clearTimeout(timeout); invalidateList(); };
  }, [loadBriefs, invalidateList]);

  const startNew = async () => {
    if (!await canLeave()) return;
    baseline.current = JSON.stringify(EMPTY_FORM);
    setView('edit'); setReviewed(false);
    setSelected(null);
    setForm(EMPTY_FORM);
    setEditing(true);
    setMessage(null);
  };

  const openBrief = async (brief: Pick<AdminBrief, 'id'>) => {
    if (!await canLeave()) return;
    const request = ++detailRequest.current;
    setOpening(brief.id); setMessage(null);
    try {
      const response = await fetch(`/api/admin/briefs?id=${brief.id}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to load Brief');
      if (request !== detailRequest.current) return;
      const next = buildForm(payload.brief);
      baseline.current = JSON.stringify(next);
      setSelected(payload.brief); setForm(next); setEditing(true);
      setView('review'); setReviewed(false);
    } catch (error) {
      if (request === detailRequest.current) setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load Brief' });
    } finally { if (request === detailRequest.current) setOpening(null); }
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setReviewed(false);
    if (key === 'source_urls') {
      const nextUrls = String(value).split('\n').map(url => url.trim()).filter(Boolean);
      setSourceIds(current => {
        const next = { ...current };
        for (const url of nextUrls) if (!next[url]) next[url] = `source_${crypto.randomUUID()}`;
        return next;
      });
    }
    setForm((current) => ({ ...current, [key]: value }));
  };

  const setPoint = (index: number, field: 'text' | 'label', value: string) => {
    setReviewed(false);
    setForm((current) => ({
      ...current,
      points: current.points.map((point, pointIndex) => pointIndex === index ? { ...point, [field]: value } : point),
    }));
  };

  const saveBrief = async (status: BriefStatus = form.status) => {
    const publishing = status === 'published' || status === 'scheduled';
    if (busy) return;
    if (publishing && (issues.length || !reviewed)) {
      setMessage({ type: 'error', text: issues.length ? issues.join(' ') : 'Confirm your source and content review before publishing.' });
      return;
    }
    const primaryItemId = Number(form.primary_item_id);
    if (!Number.isInteger(primaryItemId) || primaryItemId <= 0) {
      setMessage({ type: 'error', text: 'Choose a valid government record ID.' });
      return;
    }

    const payload = {
      ...(selected ? { id: selected.id, version: selected.version } : {}),
      title: form.title,
      display_title: form.display_title || null,
      slug: form.slug || null,
      dek: form.dek || null,
      points: form.points,
      context_markdown: form.context_markdown || null,
      primary_item_type: form.primary_item_type,
      primary_item_id: primaryItemId,
      contribution_cycle: form.primary_item_type === 'campaign_finance' ? Number(form.contribution_cycle) : null,
      policy_areas: form.policy_areas.split(',').map((area) => area.trim()).filter(Boolean),
      sources,
      author_name: form.author_name || null,
      editor_notes: form.editor_notes || null,
      status,
      published_at: status === 'published' && selected?.status !== 'published' ? new Date().toISOString() : toIsoDateTime(form.published_at),
      is_featured: form.is_featured,
      featured_until: toIsoDateTime(form.featured_until),
    };

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/briefs', {
        method: selected ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save Brief');
      setSelected(result.brief);
      const saved = buildForm(result.brief);
      baseline.current = JSON.stringify(saved);
      setForm(saved);
      setReviewed(false);
      setMessage({ type: 'success', text: status === 'published' ? 'Published. Your Brief is now live.' : status === 'scheduled' ? 'Brief scheduled.' : 'Changes saved. This Brief is not public.' });
      await loadBriefs();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save Brief' });
    } finally {
      setSaving(false);
    }
  };

  const generateContributionBrief = async (refresh = false) => {
    if (!await canLeave()) return;
    setGenerating(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/contribution-briefs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: Number(contributionMember), cycle: Number(contributionCycle), refresh }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not generate overview');
      setSelected(payload.brief);
      const next = buildForm(payload.brief);
      baseline.current = JSON.stringify(next);
      setForm(next); setView('review'); setReviewed(false);
      setEditing(true);
      setMessage({ type: 'success', text: payload.refreshed ? 'Draft refreshed and reconciled with the FEC. Review it before publishing.' : payload.existing ? 'Opened the existing overview for this member and period.' : 'Overview drafted from contribution summaries. Review it before publishing.' });
      await loadBriefs();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not generate overview' });
    } finally { setGenerating(false); }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <dialog ref={discardDialog} aria-labelledby="discard-title" className="max-w-md rounded-lg border p-6 shadow-xl backdrop:bg-black/40" onCancel={event => { event.preventDefault(); finishDiscard(false); }}>
        <h2 id="discard-title" className="text-xl font-semibold">Keep your changes?</h2>
        <p className="mt-3 text-sm text-gray-600">This Brief has unsaved edits. Keep editing to save them, or discard them to continue.</p>
        <div className="mt-5 flex gap-3"><Button onClick={() => finishDiscard(false)}>Keep editing</Button><Button variant="outline" onClick={() => finishDiscard(true)}>Discard changes</Button></div>
      </dialog>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-900">← Admin</Link>
          <h1 className="mt-2 text-3xl font-semibold text-gray-900">Review & publish</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">Before publishing, check the original sources, practical significance, affected audience, timing, and exceptions. Add useful context beyond the key points, source links, and an accurate author attribution.</p>
          <p className="mt-2 text-sm text-gray-600">Create, review, schedule, and publish source-linked Briefs.</p>
        </div>
        <Button disabled={busy} onClick={startNew}>New Brief</Button>
      </div>

      <BriefGenerationPanel selected={selected} initialUrl={initialSource ? `https://www.govsrc.com${getContentHref({ type: initialSource.type, id: initialSource.id })}` : undefined} onOpen={id => void openBrief({ id })} />

      <details className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <summary className="cursor-pointer text-lg font-semibold">Draft a contribution overview</summary>
        <p className="mt-1 text-sm text-gray-600">Create an editable, source-linked brief from published contribution summaries. One overview per member and reporting period; existing briefs are opened without being replaced. Refresh replaces an unpublished draft with newly verified figures; published briefs are preserved.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1"><p className="mb-1 text-sm font-medium">Congress member</p><CongressmanSearchSelect onSelect={member => setContributionMember(member ? String(member.id) : '')} selectedId={contributionMember} /></div>
          <label className="text-sm font-medium">Cycle ending year<Input type="number" min="1980" max="2200" step="2" className="mt-1 w-32" value={contributionCycle} onChange={event => setContributionCycle(event.target.value)} /></label>
          <Button disabled={!contributionMember || generating || saving} onClick={() => generateContributionBrief()}>{generating ? 'Drafting…' : 'Draft overview'}</Button>
          <Button variant="outline" disabled={!contributionMember || generating || saving} onClick={() => generateContributionBrief(true)}>Refresh unpublished draft</Button>
        </div>
      </details>

      {message ? (
        <div role={message.type === 'error' ? 'alert' : 'status'} className={`mt-6 rounded-md border px-4 py-3 text-sm ${message.type === 'success' ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section>
          <div className="mb-4 flex gap-3">
            <Input value={search} aria-label="Search Briefs" onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search Briefs" />
            <select aria-label="Filter by status" className="min-w-0 rounded-md border border-gray-300 bg-white px-3 text-sm" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as 'all' | BriefStatus); setPage(1); }}>
              <option value="all">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div aria-busy={loading} className="overflow-hidden rounded-lg border bg-white">
            <div className="border-b bg-gray-50 px-4 py-3 text-sm font-semibold">{STATUS_LABELS[statusFilter as BriefStatus] || 'All Briefs'} · {total}</div>
            {loading ? <p className="p-6 text-sm text-gray-500">Loading Briefs…</p> : briefs.length === 0 ? <p className="p-6 text-sm text-gray-500">{statusFilter === 'review' ? 'You’re caught up. New verified drafts will appear here for review.' : 'No Briefs match this view.'}</p> : <ul className="max-h-80 divide-y overflow-y-auto xl:max-h-[70vh]">{briefs.map(brief => <li key={brief.id}>
              <button disabled={busy} aria-current={selected?.id === brief.id ? 'true' : undefined} onClick={() => void openBrief(brief)} className={`w-full p-4 text-left transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 ${selected?.id === brief.id ? 'border-l-4 border-primary bg-secondary' : ''}`}>
                <span className="text-xs font-semibold text-primary">{STATUS_LABELS[brief.status]} · {TYPE_LABELS[brief.primary_item_type]}</span>
                <span className="mt-2 block font-serif text-lg font-semibold leading-snug">{brief.title}</span>
                <span className="mt-2 block text-xs text-gray-500">{opening === brief.id ? 'Opening…' : `Updated ${formatDate(brief.updated_at)}`}</span>
              </button>
            </li>)}</ul>}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <Button size="sm" variant="outline" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}>Previous</Button>
            <span>Page {page} of {Math.max(1, Math.ceil(total / 25))}</span>
            <Button size="sm" variant="outline" disabled={page * 25 >= total || loading} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </section>

        {editing ? (
          <section ref={editorPanel} className="scroll-mt-28 rounded-lg border bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">{selected ? `Review Brief` : 'New Brief'}</h2>
              {selected?.status === 'published' && selected.slug ? <Link className="text-sm font-medium text-blue-600 hover:underline" href={`/briefs/${selected.slug}`}>View live</Link> : null}
            </div>
            <div className="mt-5 flex gap-2" aria-label="Review mode">
              <Button variant={view === 'review' ? 'default' : 'outline'} onClick={() => setView('review')}>Read & check sources</Button>
              <Button variant={view === 'edit' ? 'default' : 'outline'} onClick={() => setView('edit')}>Edit content</Button>
            </div>
            {view === 'review' ? <div className="mt-6 space-y-6">
              <article className="prose max-w-none prose-headings:font-serif prose-a:text-primary">
                <p className="text-sm text-muted-foreground">{form.author_name || 'Author needed'} · {STATUS_LABELS[form.status]}{dirty ? ' · Unsaved changes' : ''}</p>
                <h2>{form.title || 'Untitled Brief'}</h2><p className="lead">{form.dek}</p>
                <ol>{form.points.filter(point => point.text.trim()).map(point => <li key={point.id}>
                  {point.label ? <strong>{point.label}: </strong> : null}{point.text}
                  <span className="ml-2 text-xs">{point.source_refs.map(ref => {
                    const source = sources.find(item => item.id === ref);
                    const url = ref === 'primary' ? getContentHref({ type: form.primary_item_type, id: form.primary_item_id, cycle: Number(form.contribution_cycle) || null }) : source?.url;
                    return url && /^(https?:\/\/|\/)/.test(url) ? <a key={ref} className="mr-2" href={url} target="_blank" rel="noreferrer">{ref === 'primary' ? 'Record' : source?.label}</a> : <span key={ref} className="text-red-700">Missing citation </span>;
                  })}</span>
                </li>)}</ol>
                <h3>Context</h3><ReactMarkdown>{form.context_markdown || '*Add an explanation beyond the key points before publishing.*'}</ReactMarkdown>
              </article>
              <aside className="rounded-lg border bg-gray-50 p-4" aria-label="Source documents">
                <h3 className="font-semibold">Check the evidence</h3>
                <a className="mt-2 block text-sm text-primary underline" target="_blank" rel="noreferrer" href={getContentHref({ type: form.primary_item_type, id: form.primary_item_id, cycle: Number(form.contribution_cycle) || null })}>Open the government record ↗</a>
                {sources.map(source => sourceHost(source.url) ? <a key={source.url} className="mt-2 block break-words text-sm text-primary underline" target="_blank" rel="noreferrer" href={source.url}>{source.label} · {sourceHost(source.url)} ↗</a> : <p key={source.url} className="text-sm text-red-700">Invalid source URL: {source.url}</p>)}
                <p className="mt-3 text-xs text-gray-600">Automated verification supports your review; it does not establish editorial accuracy or significance.</p>
              </aside>
            </div> : <fieldset disabled={busy} className="mt-6 min-w-0 space-y-5">
              <label className="block text-sm font-medium">Headline<Input className="mt-1" value={form.title} onChange={(event) => setField('title', event.target.value)} /></label>
              <label className="block text-sm font-medium">Dek<textarea className="mt-1 min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={form.dek} onChange={(event) => setField('dek', event.target.value)} maxLength={360} /><span className="mt-1 block text-xs font-normal text-muted-foreground">A concise one- or two-sentence takeaway. Avoid repeating the first point.</span></label>
              <label className="block text-sm font-medium">Display headline (optional)<Input className="mt-1" maxLength={100} value={form.display_title} onChange={(event) => setField('display_title', event.target.value)} placeholder="A short, accurate headline for listings" /><span className="mt-1 block text-xs font-normal text-muted-foreground">{form.display_title.length}/100 characters. Aim for 8–14 words; preserve the proposal or decision’s meaning. The full title remains inside the Brief.</span></label>
              <label className="block text-sm font-medium">Slug<Input className="mt-1" value={form.slug} onChange={(event) => setField('slug', event.target.value)} placeholder="Generated when published if blank" /></label>

              <div>
                <div className="flex items-center justify-between"><span className="text-sm font-medium">Points (3–5 when published)</span>{form.points.length < 5 ? <Button size="sm" variant="outline" onClick={() => setField('points', [...form.points, { id: `point_${crypto.randomUUID()}`, label: '', text: '', source_refs: ['primary'] }])}>Add point</Button> : null}</div>
                <div className="mt-2 space-y-3">{form.points.map((point, index) => (
                  <div key={point.id} className="flex items-start gap-2">
                    <span className="pt-2 text-xs font-bold text-gray-500">{index + 1}</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <label className="block text-xs font-medium">Point label (optional)<Input className="mt-1" maxLength={60} value={point.label || ''} onChange={(event) => setPoint(index, 'label', event.target.value)} placeholder="e.g. 30-day deadline" /></label>
                      <label className="block text-xs font-medium">Explanation<textarea className="mt-1 min-h-24 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={point.text} onChange={(event) => setPoint(index, 'text', event.target.value)} /></label>
                      <fieldset className="flex flex-wrap gap-3"><legend className="mb-1 text-xs font-medium">Supporting sources</legend>{[{ id: 'primary', label: 'Government record' }, ...sources, ...point.source_refs.filter(ref => ref !== 'primary' && !sources.some(source => source.id === ref)).map(id => ({ id, label: 'Missing source (remove or restore)' }))].map(source => <label key={source.id} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={point.source_refs.includes(source.id)} onChange={event => setField('points', form.points.map((item, i) => i === index ? { ...item, source_refs: event.target.checked ? [...item.source_refs, source.id] : item.source_refs.filter(ref => ref !== source.id) } : item))} />{source.label}</label>)}</fieldset>
                    </div>
                    {form.points.length > 3 ? <Button size="sm" variant="ghost" onClick={() => setField('points', form.points.filter((_, pointIndex) => pointIndex !== index))}>Remove</Button> : null}
                  </div>
                ))}</div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">Primary source type<select className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" value={form.primary_item_type} onChange={(event) => setField('primary_item_type', event.target.value as ContentType)}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                {form.primary_item_type === 'campaign_finance' ? <label className="block text-sm font-medium">Cycle ending year<Input className="mt-1" type="number" min="1980" max="2200" step="2" value={form.contribution_cycle} onChange={event => setField('contribution_cycle', event.target.value)} /></label> : null}
                <label className="block text-sm font-medium">Government record ID<Input className="mt-1" type="number" min="1" value={form.primary_item_id} onChange={(event) => setField('primary_item_id', event.target.value)} /></label>
              </div>
              <label className="block text-sm font-medium">Policy areas<Input className="mt-1" value={form.policy_areas} onChange={(event) => setField('policy_areas', event.target.value)} placeholder="Economics, Health, Defense" /></label>
              <label className="block text-sm font-medium">External source URLs<textarea className="mt-1 min-h-24 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={form.source_urls} onChange={(event) => setField('source_urls', event.target.value)} placeholder="One URL per line" /></label>
              <label className="block text-sm font-medium">Deeper context (Markdown)<textarea className="mt-1 min-h-36 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm" value={form.context_markdown} onChange={(event) => setField('context_markdown', event.target.value)} /></label>
              <label className="block text-sm font-medium">Author<Input className="mt-1" value={form.author_name} onChange={(event) => setField('author_name', event.target.value)} /></label>
              <label className="block text-sm font-medium">Editor notes<textarea className="mt-1 min-h-24 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={form.editor_notes} onChange={(event) => setField('editor_notes', event.target.value)} /></label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">Status<select className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" value={form.status} onChange={(event) => setField('status', event.target.value as BriefStatus)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="block text-sm font-medium">Publish at<Input className="mt-1" type="datetime-local" value={form.published_at} onChange={(event) => setField('published_at', event.target.value)} /></label>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.is_featured} onChange={(event) => setField('is_featured', event.target.checked)} />Prefer as an automatic homepage lead</label>
              <p className="text-xs text-muted-foreground">To choose an exact lead or supporting slot on any tab, use <Link href="/admin/front-pages" className="text-primary underline">Customize front pages</Link>. Saved selections take priority over this preference.</p>
              {form.is_featured ? <label className="block text-sm font-medium">Featured until<Input className="mt-1" type="datetime-local" value={form.featured_until} onChange={(event) => setField('featured_until', event.target.value)} /></label> : null}

            </fieldset>}
            <div className="sticky bottom-0 mt-6 space-y-3 border-t bg-white py-4">
              {issues.length > 0 ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-semibold">Before publishing</p><ul className="mt-1 list-disc pl-5">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul><button className="mt-2 text-primary underline" onClick={() => setView('edit')}>Fix in editor</button></div> : <p className="text-sm text-green-800">Required content is complete. Check the sources and explanation before publishing.</p>}
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I checked the sources, legal status, affected audience, and explanation.</label>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" disabled={busy} onClick={async () => { if (await canLeave()) setEditing(false); }}>Close</Button>
                <Button variant="outline" disabled={busy || ((form.status === 'published' || form.status === 'scheduled') && (!reviewed || issues.length > 0))} onClick={() => void saveBrief()}>{saving ? 'Saving…' : selected?.status === 'published' ? 'Save live changes' : form.status === 'scheduled' ? 'Save schedule' : form.status === 'published' ? 'Publish now' : 'Save changes'}</Button>
                {form.status !== 'published' && form.status !== 'scheduled' ? <Button disabled={busy || !reviewed || issues.length > 0} onClick={() => void saveBrief('published')}>Publish now</Button> : null}
                {!dirty && selected?.status === 'published' && briefs.some(brief => brief.id !== selected.id && brief.status === 'review') ? <Button variant="outline" disabled={busy} onClick={() => void openBrief(briefs.find(brief => brief.id !== selected.id && brief.status === 'review')!)}>Review next draft →</Button> : null}
                <span className="text-xs text-gray-500">{dirty ? 'Unsaved changes' : selected ? 'All changes saved' : 'Not saved yet'}</span>
              </div>
            </div>
          </section>
        ) : <section className="rounded-lg border border-dashed p-10 text-center"><h2 className="font-serif text-2xl">Choose a Brief to review</h2><p className="mt-3 text-sm text-muted-foreground">Read the draft, open its sources, make edits, and publish when it is ready.</p></section>}
      </div>
    </div>
  );
}
