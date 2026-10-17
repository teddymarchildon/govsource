'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FRONT_PAGES, FRONT_PAGE_LABELS, FRONT_PAGE_SLOTS, type FrontPage, type FrontPageSettings, type FrontPageSlot } from '@/types/frontPage';

type Story = { id: string; title: string; slug: string | null; status: string; published_at: string | null; primary_item_type: string };
const SLOT_LABELS = ['Lead story', 'Supporting story 1', 'Supporting story 2'];
function normalize(row: FrontPageSettings): FrontPageSettings {
  return { ...row, ...Object.fromEntries(FRONT_PAGE_SLOTS.map(slot => [slot, row[slot] == null ? null : String(row[slot])])) };
}
function available(story: Story) {
  return ['published', 'scheduled'].includes(story.status) && story.slug && story.published_at && Date.parse(story.published_at) <= Date.now();
}

export default function FrontPagesAdmin() {
  const [section, setSection] = useState<FrontPage>('home');
  const [settings, setSettings] = useState<FrontPageSettings[]>([]);
  const [saved, setSaved] = useState<FrontPageSettings[]>([]);
  const [stories, setStories] = useState<Record<string, Story>>({});
  const [slot, setSlot] = useState<FrontPageSlot>('lead_brief_id');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [results, setResults] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const current = settings.find(row => row.section === section);
  const dirty = JSON.stringify(current) !== JSON.stringify(saved.find(row => row.section === section));
  const anyDirty = JSON.stringify(settings) !== JSON.stringify(saved);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/front-pages', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setSettings(body.settings.map(normalize)); setSaved(body.settings.map(normalize));
        setStories(previous => ({ ...previous, ...Object.fromEntries(body.briefs.map((story: Story) => [String(story.id), { ...story, id: String(story.id) }])) }));
        setError('');
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setSearchError('');
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ live: 'true', search, page: String(page), limit: '12' });
        const response = await fetch(`/api/admin/briefs?${params}`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        const rows: Story[] = body.briefs.map((story: Story) => ({ ...story, id: String(story.id) }));
        setResults(rows); setTotalPages(body.pagination.totalPages);
        setStories(previous => ({ ...previous, ...Object.fromEntries(rows.map(story => [story.id, story])) }));
      } catch (e) { if (!controller.signal.aborted) setSearchError(e instanceof Error ? e.message : 'Could not search briefs.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, page]);

  useEffect(() => {
    if (!anyDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [anyDirty]);

  function assign(id: string | null) {
    setSettings(rows => rows.map(row => row.section !== section ? row : {
      ...row, ...Object.fromEntries(FRONT_PAGE_SLOTS.map(key => [key, key === slot ? id : id && row[key] === id ? null : row[key]])),
    }));
    setNotice('');
  }
  function move(index: number, direction: number) {
    setSettings(rows => rows.map(row => {
      if (row.section !== section) return row;
      const a = FRONT_PAGE_SLOTS[index], b = FRONT_PAGE_SLOTS[index + direction];
      return { ...row, [a]: row[b], [b]: row[a] };
    }));
    setNotice('');
  }
  async function save() {
    if (!current) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/front-pages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(current) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const row = normalize(body.settings);
      setSettings(rows => rows.map(item => item.section === section ? row : item));
      setSaved(rows => rows.map(item => item.section === section ? row : item));
      setNotice(`${FRONT_PAGE_LABELS[section]} saved. New page loads will use this selection.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
    finally { setSaving(false); }
  }

  return <main className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
    <Link href="/admin" className="text-sm text-primary underline" onClick={event => { if (anyDirty && !window.confirm('Leave without saving your selections?')) event.preventDefault(); }}>Back to admin</Link>
    <header><h1 className="font-serif text-3xl font-semibold">Customize front pages</h1><p className="mt-2 max-w-3xl text-muted-foreground">Choose the lead and supporting Briefs for each tab. Empty slots fill automatically with recent stories. Selections stay in place until you change them or the Brief is unpublished.</p></header>
    <nav aria-label="Choose a front page" className="flex flex-wrap gap-2">{FRONT_PAGES.map(key => <Button key={key} disabled={saving} variant={key === section ? 'default' : 'outline'} aria-pressed={key === section} onClick={() => { setSection(key); setNotice(''); }}>{FRONT_PAGE_LABELS[key]}{JSON.stringify(settings.find(row => row.section === key)) !== JSON.stringify(saved.find(row => row.section === key)) ? ' *' : ''}</Button>)}</nav>
    {error && <div role="alert" className="rounded border border-red-300 p-4 text-red-700">{error}<Button className="ml-3" variant="outline" disabled={saving} onClick={() => { if (!anyDirty || window.confirm('Reload and discard all unsaved selections?')) setReload(value => value + 1); }}>Reload selections</Button></div>}
    {notice && <p role="status" className="rounded border p-4">{notice}</p>}
    {!current && !error && <p role="status">Loading selections…</p>}
    {current && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl">{FRONT_PAGE_LABELS[section]}</h2><div className="flex items-center gap-4"><Link href={section === 'home' ? '/' : `/${section}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">View page ↗</Link><Button disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save this page'}</Button></div></div>
      <div className="grid gap-4 md:grid-cols-3">{FRONT_PAGE_SLOTS.map((key, index) => {
        const story = current[key] ? stories[current[key]] : null;
        return <section key={key} className={`space-y-3 rounded-lg border p-5 ${slot === key ? 'border-primary bg-primary/5' : 'border-border'}`}>
          <button className="text-left text-sm font-semibold text-primary underline" disabled={saving} aria-pressed={slot === key} onClick={() => setSlot(key)}>{SLOT_LABELS[index]}</button>
          <h3 className="min-h-16 font-serif text-lg font-semibold">{story?.title || (current[key] ? `Brief #${current[key]}` : 'Automatic selection')}</h3>
          <p className="text-xs text-muted-foreground">{story ? available(story) ? 'Published · pinned to this slot' : 'Unavailable · recent stories will fill this slot' : 'A recent eligible Brief will appear here.'}</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={saving} onClick={() => setSlot(key)}>Choose brief</Button><Button variant="ghost" size="sm" disabled={saving || !current[key]} onClick={() => { setSettings(rows => rows.map(row => row.section === section ? { ...row, [key]: null } : row)); setNotice(''); }}>Clear</Button></div>
          <div className="flex gap-2"><Button variant="ghost" size="sm" aria-label={`Move ${SLOT_LABELS[index]} earlier`} disabled={saving || index === 0} onClick={() => move(index, -1)}>← Earlier</Button><Button variant="ghost" size="sm" aria-label={`Move ${SLOT_LABELS[index]} later`} disabled={saving || index === 2} onClick={() => move(index, 1)}>Later →</Button></div>
        </section>;
      })}</div>
      <section className="space-y-4 rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Choose a Brief for {SLOT_LABELS[FRONT_PAGE_SLOTS.indexOf(slot)].toLowerCase()}</h2>
        <p className="text-sm text-muted-foreground">Search all published Briefs. You can highlight a story on more than one tab. Choosing a story already on this page moves it to the selected slot.</p>
        <label className="block text-sm font-medium">Search Briefs<Input className="mt-2" type="search" value={search} placeholder="Search by headline or summary" onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
        {searchError ? <p role="alert" className="text-red-700">{searchError}</p> : loading ? <p role="status">Searching…</p> : <ul className="divide-y">{results.map(story => <li key={story.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0 flex-1"><h3 className="font-medium">{story.title}</h3><p className="mt-1 text-xs text-muted-foreground">{story.primary_item_type.replaceAll('_', ' ')} · {story.published_at ? new Date(story.published_at).toLocaleDateString() : ''}{FRONT_PAGE_SLOTS.some(key => current[key] === story.id) ? ' · Selected on this page' : ''}</p></div><Link href={`/briefs/${story.slug}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Read ↗</Link><Button variant="outline" disabled={saving || current[slot] === story.id} onClick={() => assign(story.id)}>Select</Button></li>)}</ul>}
        {!loading && !searchError && results.length === 0 && <p>No published Briefs match this search.</p>}
        <div className="flex items-center justify-between"><Button variant="outline" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button><span className="text-sm">Page {page} of {totalPages}</span><Button variant="outline" disabled={loading || page >= totalPages} onClick={() => setPage(value => value + 1)}>Next</Button></div>
      </section>
    </>}
  </main>;
}
