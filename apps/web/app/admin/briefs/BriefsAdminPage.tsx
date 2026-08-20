'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BriefPoint, BriefSource, BriefStatus } from '@/types/brief';
import type { ContentType } from '@/types/content';

type AdminBrief = {
  id: number;
  version: number;
  status: BriefStatus;
  title: string;
  slug: string | null;
  dek: string | null;
  points: BriefPoint[];
  context_markdown: string | null;
  primary_item_type: ContentType;
  primary_item_id: number;
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
  slug: string;
  dek: string;
  points: string[];
  context_markdown: string;
  primary_item_type: ContentType;
  primary_item_id: string;
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
  slug: '',
  dek: '',
  points: ['', '', ''],
  context_markdown: '',
  primary_item_type: 'bill',
  primary_item_id: '',
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
    slug: brief.slug || '',
    dek: brief.dek || '',
    points: brief.points.length ? brief.points.map((point) => point.text) : ['', '', ''],
    context_markdown: brief.context_markdown || '',
    primary_item_type: brief.primary_item_type,
    primary_item_id: String(brief.primary_item_id),
    policy_areas: brief.policy_areas.join(', '),
    source_urls: brief.sources.map((source) => source.url).join('\n'),
    author_name: brief.author_name || '',
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
  const [statusFilter, setStatusFilter] = useState<'all' | BriefStatus>('all');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadBriefs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());
    try {
      const response = await fetch(`/api/admin/briefs?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to load Briefs');
      setBriefs(payload.briefs || []);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load Briefs' });
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timeout = setTimeout(loadBriefs, 250);
    return () => clearTimeout(timeout);
  }, [loadBriefs]);

  const startNew = () => {
    setSelected(null);
    setForm(EMPTY_FORM);
    setEditing(true);
    setMessage(null);
  };

  const openBrief = async (brief: AdminBrief) => {
    setMessage(null);
    const response = await fetch(`/api/admin/briefs?id=${brief.id}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      setMessage({ type: 'error', text: payload.error || 'Failed to load Brief' });
      return;
    }
    setSelected(payload.brief);
    setForm(buildForm(payload.brief));
    setEditing(true);
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const setPoint = (index: number, value: string) => {
    setForm((current) => ({
      ...current,
      points: current.points.map((point, pointIndex) => pointIndex === index ? value : point),
    }));
  };

  const saveBrief = async () => {
    const primaryItemId = Number(form.primary_item_id);
    if (!Number.isInteger(primaryItemId) || primaryItemId <= 0) {
      setMessage({ type: 'error', text: 'Choose a valid government record ID.' });
      return;
    }

    const urls = form.source_urls.split('\n').map((url) => url.trim()).filter(Boolean);
    const payload = {
      ...(selected ? { id: selected.id, version: selected.version } : {}),
      title: form.title,
      slug: form.slug || null,
      dek: form.dek || null,
      points: form.points.map((text, index) => ({ id: `point_${index + 1}`, text, source_refs: ['primary'] })),
      context_markdown: form.context_markdown || null,
      primary_item_type: form.primary_item_type,
      primary_item_id: primaryItemId,
      policy_areas: form.policy_areas.split(',').map((area) => area.trim()).filter(Boolean),
      sources: urls.map((url, index) => ({ id: `source_${index + 1}`, label: `Source ${index + 1}`, url })),
      author_name: form.author_name || null,
      editor_notes: form.editor_notes || null,
      status: form.status,
      published_at: toIsoDateTime(form.published_at),
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
      setForm(buildForm(result.brief));
      setMessage({ type: 'success', text: selected ? 'Brief updated.' : 'Brief created.' });
      await loadBriefs();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save Brief' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-900">← Admin</Link>
          <h1 className="mt-2 text-3xl font-semibold text-gray-900">Briefs</h1>
          <p className="mt-2 text-sm text-gray-600">Create, review, schedule, and publish source-linked Briefs.</p>
        </div>
        <Button onClick={startNew}>New Brief</Button>
      </div>

      {message ? (
        <div className={`mt-6 rounded-md border px-4 py-3 text-sm ${message.type === 'success' ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
        <section>
          <div className="mb-4 flex gap-3">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Briefs" />
            <select className="rounded-md border border-gray-300 bg-white px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | BriefStatus)}>
              <option value="all">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="overflow-hidden rounded-lg border bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50"><tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Brief</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Updated</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">Loading Briefs…</td></tr> : briefs.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">No Briefs found.</td></tr> : briefs.map((brief) => (
                  <tr key={brief.id}>
                    <td className="max-w-md px-4 py-4"><p className="font-medium text-gray-900">{brief.title}</p><p className="mt-1 text-xs text-gray-500">{TYPE_LABELS[brief.primary_item_type]} #{brief.primary_item_id}</p></td>
                    <td className="px-4 py-4 text-sm text-gray-600">{STATUS_LABELS[brief.status]}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-gray-500">{formatDate(brief.updated_at)}</td>
                    <td className="px-4 py-4 text-right"><Button size="sm" variant="outline" onClick={() => openBrief(brief)}>Edit</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {editing ? (
          <section className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">{selected ? `Edit Brief #${selected.id}` : 'New Brief'}</h2>
              {selected?.status === 'published' && selected.slug ? <Link className="text-sm font-medium text-blue-600 hover:underline" href={`/briefs/${selected.slug}`}>View live</Link> : null}
            </div>
            <div className="mt-6 space-y-5">
              <label className="block text-sm font-medium">Headline<Input className="mt-1" value={form.title} onChange={(event) => setField('title', event.target.value)} /></label>
              <label className="block text-sm font-medium">Dek<textarea className="mt-1 min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={form.dek} onChange={(event) => setField('dek', event.target.value)} maxLength={360} /></label>
              <label className="block text-sm font-medium">Slug<Input className="mt-1" value={form.slug} onChange={(event) => setField('slug', event.target.value)} placeholder="Generated when published if blank" /></label>

              <div>
                <div className="flex items-center justify-between"><span className="text-sm font-medium">Points (3–5 when published)</span>{form.points.length < 5 ? <Button size="sm" variant="outline" onClick={() => setField('points', [...form.points, ''])}>Add point</Button> : null}</div>
                <div className="mt-2 space-y-3">{form.points.map((point, index) => (
                  <div key={index} className="flex gap-2"><span className="pt-2 text-xs font-bold text-gray-500">{index + 1}</span><textarea className="min-h-24 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" value={point} onChange={(event) => setPoint(index, event.target.value)} />{form.points.length > 3 ? <Button size="sm" variant="ghost" onClick={() => setField('points', form.points.filter((_, pointIndex) => pointIndex !== index))}>Remove</Button> : null}</div>
                ))}</div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">Primary source type<select className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" value={form.primary_item_type} onChange={(event) => setField('primary_item_type', event.target.value as ContentType)}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
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
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.is_featured} onChange={(event) => setField('is_featured', event.target.checked)} />Feature on homepage</label>
              {form.is_featured ? <label className="block text-sm font-medium">Featured until<Input className="mt-1" type="datetime-local" value={form.featured_until} onChange={(event) => setField('featured_until', event.target.value)} /></label> : null}

              <div className="flex justify-end gap-3 border-t pt-5"><Button variant="outline" onClick={() => setEditing(false)}>Close</Button><Button onClick={saveBrief} disabled={saving}>{saving ? 'Saving…' : 'Save Brief'}</Button></div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
