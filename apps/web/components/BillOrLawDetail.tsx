'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { Download, ExternalLink, FileText, GripVertical, MessageSquareText, PanelRightClose, PanelRightOpen, ScrollText, Users } from 'lucide-react';

import { getPolicyAreaColors } from '@/utils/policyColors';
import type { Congressman } from '@/types/types';
import type { LegislationDetail, LegislationText } from '@/types/legislation';
import AiChat from './AiChat';
import Breadcrumbs from './Breadcrumbs';
import PdfViewer, { type PdfJumpTarget } from './PdfViewer';
import SaveButton from './SaveButton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface BillOrLawDetailProps extends LegislationDetail {
  isLaw?: boolean;
}

type MobileWorkspace = 'details' | 'assistant';

function subscribeToMobileBreakpoint(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia('(max-width: 767px)');
  mediaQuery.addEventListener('change', onStoreChange);
  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function getMobileSnapshot() {
  return window.matchMedia('(max-width: 767px)').matches;
}

function getServerMobileSnapshot() {
  return false;
}

function formatLegislationDate(dateString: string) {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateString) ? `${dateString}T00:00:00Z` : dateString);
  if (Number.isNaN(parsed.getTime())) return dateString;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function personDetail(person: Congressman) {
  const district = person.chamber === 'House' && person.district ? ` · District ${person.district}` : '';
  return `${person.party}-${person.state}${district}`;
}

function personInitials(person: Congressman) {
  return `${person.first_name?.[0] || ''}${person.last_name?.[0] || ''}` || person.full_name.slice(0, 2);
}

function PersonRow({ person, compact = false }: { person: Congressman; compact?: boolean }) {
  return (
    <Link href={`/congress-members/${person.id}`} className="group flex items-center gap-3 rounded-lg border border-border/80 bg-background/50 p-3 transition-colors hover:border-primary/25 hover:bg-primary/[0.035]">
      <span className={`${compact ? 'h-8 w-8 text-[10px]' : 'h-9 w-9 text-xs'} flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary`}>
        {personInitials(person)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{person.full_name}</span>
        <span className="block truncate text-xs text-muted-foreground">{personDetail(person)}</span>
      </span>
    </Link>
  );
}

function sortLegislationTexts(texts: LegislationText[]) {
  return [...texts].sort((a, b) => {
    const aIsEnrolled = a.type?.toLowerCase() === 'enrolled bill';
    const bIsEnrolled = b.type?.toLowerCase() === 'enrolled bill';
    if (aIsEnrolled && !bIsEnrolled) return -1;
    if (!aIsEnrolled && bIsEnrolled) return 1;

    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return dateB - dateA;
  });
}

export default function BillOrLawDetail({ item, texts, sponsors, cosponsors, actions, summary, isLaw = false }: BillOrLawDetailProps) {
  const isMobile = useSyncExternalStore(subscribeToMobileBreakpoint, getMobileSnapshot, getServerMobileSnapshot);
  const [showFullSummary, setShowFullSummary] = useState(false);
  const [pdfJumpTarget, setPdfJumpTarget] = useState<PdfJumpTarget>();
  const [activeTab, setActiveTab] = useState('text');
  const [mobileWorkspace, setMobileWorkspace] = useState<MobileWorkspace>('details');
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [assistantWidth, setAssistantWidth] = useState(420);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const itemType = isLaw ? 'law' : 'bill';
  const itemNoun = isLaw ? 'law' : 'bill';
  const title = isLaw ? item.law_title || item.title : item.title;
  const number = isLaw ? `Public Law ${item.law_number || `${item.congress}-${item.number}`}` : `${item.type.toUpperCase()}. ${item.number}`;
  const dateLabel = isLaw ? 'Enacted' : 'Introduced';
  const date = isLaw ? item.law_enacted_date : item.introduced_date;

  const sortedTexts = useMemo(() => sortLegislationTexts(texts), [texts]);
  const latestText = sortedTexts[0] ?? null;
  const topTextId = latestText?.id?.toString();
  const [openTextIds, setOpenTextIds] = useState<string[]>(topTextId ? [topTextId] : []);
  const validOpenTextIds = openTextIds.filter((id) => sortedTexts.some((text) => text.id.toString() === id));
  const resolvedOpenTextIds = validOpenTextIds.length > 0 ? validOpenTextIds : topTextId ? [topTextId] : [];
  const diffHtmlFilePaths = useMemo(() => sortedTexts.length > 1 ? sortedTexts.slice(0, 2).map((text) => text.html_file_path) : undefined, [sortedTexts]);

  const summaryText = summary?.text || '';
  const needsTruncation = summaryText.length > 1000;
  const displayedSummary = !showFullSummary && needsTruncation ? `${summaryText.slice(0, 1000)}…` : summaryText;

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;
      const maxWidth = Math.min(600, window.innerWidth * 0.48);
      setAssistantWidth(Math.max(360, Math.min(maxWidth, resizeState.startWidth + resizeState.startX - event.clientX)));
    };
    const handlePointerUp = () => {
      resizeStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    resizeStateRef.current = { startX: event.clientX, startWidth: assistantWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setAssistantWidth((width) => Math.max(360, Math.min(600, width + (event.key === 'ArrowLeft' ? 24 : -24))));
  };

  const handleCitationJump = (citation: { page?: number; searchText?: string }) => {
    setActiveTab('text');
    setMobileWorkspace('details');
    if (topTextId) setOpenTextIds([topTextId]);
    setPdfJumpTarget({ page: citation.page, searchText: citation.searchText, token: Date.now() });
  };

  const detailsPanel = (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card" aria-label={`${isLaw ? 'Law' : 'Bill'} details`}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">{isLaw ? 'Law details' : 'Bill details'}</h2>
          </div>
          <TabsList className="h-auto flex-wrap justify-start rounded-lg bg-muted p-0.5">
            <TabsTrigger value="text" className="h-8 rounded-md px-2.5 text-xs">Text <span className="ml-1 text-[10px] text-muted-foreground">{texts.length}</span></TabsTrigger>
            <TabsTrigger value="summary" className="h-8 rounded-md px-2.5 text-xs">Summary</TabsTrigger>
            <TabsTrigger value="sponsors" className="h-8 rounded-md px-2.5 text-xs">Sponsors <span className="ml-1 text-[10px] text-muted-foreground">{sponsors.length + cosponsors.length}</span></TabsTrigger>
            <TabsTrigger value="actions" className="h-8 rounded-md px-2.5 text-xs">Actions <span className="ml-1 text-[10px] text-muted-foreground">{actions.length}</span></TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <TabsContent value="text" className="m-0 h-full overflow-y-auto p-3 md:p-4">
            {sortedTexts.length > 0 ? (
              <Accordion type="multiple" className="w-full" value={resolvedOpenTextIds} onValueChange={setOpenTextIds}>
                {sortedTexts.map((text, index) => (
                  <AccordionItem key={text.id} value={text.id.toString()} className="mb-2 overflow-hidden rounded-lg border border-border px-3 last:mb-0">
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <div className="flex min-w-0 items-center gap-3 text-left">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{text.type?.trim() || `Version ${index + 1}`}</span>
                          <span className="block text-xs font-normal text-muted-foreground">{text.date ? formatLegislationDate(text.date) : 'Date unavailable'}{index === 0 ? ' · Current version' : ''}</span>
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="h-[600px] min-h-[420px] overflow-hidden rounded-lg border bg-white md:h-[calc(100dvh-22rem)]">
                        {text.pdf_file_path ? (
                          <PdfViewer storagePath={text.pdf_file_path} storageBucket="bill-pdfs" className="h-full" jumpTo={text.id.toString() === topTextId ? pdfJumpTarget : undefined} />
                        ) : text.pdf_url ? (
                          <PdfViewer pdfUrl={text.pdf_url} className="h-full" jumpTo={text.id.toString() === topTextId ? pdfJumpTarget : undefined} />
                        ) : (
                          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">No PDF is available for this version.</div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No official text is available.</div>
            )}
          </TabsContent>

          <TabsContent value="summary" className="m-0 h-full overflow-y-auto p-5 md:p-7">
            {summaryText ? (
              <article className="mx-auto max-w-3xl">
                <div className="mb-5 flex items-center gap-2"><ScrollText className="h-5 w-5 text-primary" /><h3 className="text-lg font-semibold">Legislative summary</h3></div>
                <div className="prose prose-sm prose-gray max-w-none whitespace-pre-line prose-headings:font-semibold prose-a:text-primary"><ReactMarkdown>{displayedSummary}</ReactMarkdown></div>
                {needsTruncation ? <Button variant="link" onClick={() => setShowFullSummary((show) => !show)} className="mt-3 h-auto px-0 text-sm">{showFullSummary ? 'Show less' : 'Read full summary'}</Button> : null}
              </article>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No summary is available for this {itemNoun}.</div>
            )}
          </TabsContent>

          <TabsContent value="sponsors" className="m-0 h-full overflow-y-auto p-4 md:p-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.6fr)]">
              <section>
                <div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Primary sponsor</h3><Badge variant="outline" className="h-5 text-[10px]">{sponsors.length}</Badge></div>
                <div className="space-y-2">{sponsors.length > 0 ? sponsors.map((sponsor) => <PersonRow key={sponsor.id} person={sponsor} />) : <p className="text-sm text-muted-foreground">No sponsor found.</p>}</div>
              </section>
              <section>
                <div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Cosponsors</h3><Badge variant="outline" className="h-5 text-[10px]">{cosponsors.length}</Badge></div>
                {cosponsors.length > 0 ? <div className="grid gap-2 sm:grid-cols-2">{cosponsors.map((cosponsor) => <PersonRow key={cosponsor.id} person={cosponsor} compact />)}</div> : <p className="text-sm text-muted-foreground">No cosponsors found.</p>}
              </section>
            </div>
          </TabsContent>

          <TabsContent value="actions" className="m-0 h-full overflow-y-auto p-5 md:p-7">
            {actions.length > 0 ? (
              <div className="mx-auto max-w-3xl border-l border-border pl-5">
                {actions.map((action, index) => (
                  <article key={action.id} className="relative pb-7 last:pb-0">
                    <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card ${index === 0 ? 'bg-primary ring-4 ring-primary/10' : 'bg-muted-foreground/35'}`} />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <time dateTime={action.date} className="font-medium text-foreground">{formatLegislationDate(action.date)}</time><span aria-hidden="true">·</span><span>{action.type}</span>
                      {index === 0 ? <Badge variant="secondary" className="h-5 text-[10px]">Latest</Badge> : null}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground">{action.text}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No legislative actions found.</div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );

  const assistantPanel = <AiChat documentType={itemType} documentId={item.id} documentTitle={title} htmlFilePath={latestText?.html_file_path} onCitationClick={handleCitationJump} diffHtmlFilePaths={diffHtmlFilePaths} height="100%" />;
  const officialSourceUrl = latestText?.html_url || latestText?.pdf_url;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 md:h-[calc(100dvh-9rem)] md:min-h-[560px]">
      <div className="flex-shrink-0">
        <Breadcrumbs steps={[{ label: 'Home', href: '/' }, { label: isLaw ? 'Laws' : 'Bills', href: isLaw ? '/laws' : '/bills' }, { label: number }]} />
      </div>

      <header className="flex flex-shrink-0 flex-col gap-3 border-b border-border/80 pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-5xl">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">{isLaw ? 'Federal law' : 'Federal bill'} · {number}</p>
          <h1 className="text-balance text-2xl font-bold leading-tight text-foreground md:text-3xl">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Badge variant="outline" className={item.policy_area ? getPolicyAreaColors(item.policy_area) : ''}>{item.policy_area || 'Uncategorized'}</Badge>
            {date ? <><span aria-hidden="true">·</span><span>{dateLabel} {formatLegislationDate(date)}</span></> : null}
            <span aria-hidden="true">·</span><span>{item.congress}th Congress</span>
            {sponsors[0] ? <><span aria-hidden="true">·</span><span>Sponsored by <Link href={`/congress-members/${sponsors[0].id}`} className="font-medium text-primary hover:underline">{sponsors[0].full_name}</Link></span></> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isLaw ? <SaveButton itemId={item.id} itemType="bill" /> : null}
          {officialSourceUrl ? <Button variant="outline" size="sm" asChild><a href={officialSourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" /> Official source</a></Button> : null}
          {latestText?.pdf_url ? <Button variant="outline" size="sm" asChild><a href={latestText.pdf_url} target="_blank" rel="noopener noreferrer" download><Download className="mr-1.5 h-4 w-4" /> Download PDF</a></Button> : null}
          {!isMobile ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setAssistantOpen((open) => !open)} aria-expanded={assistantOpen}>
              {assistantOpen ? <PanelRightClose className="mr-1.5 h-4 w-4" /> : <PanelRightOpen className="mr-1.5 h-4 w-4" />}{assistantOpen ? 'Hide assistant' : `Ask this ${itemNoun}`}
            </Button>
          ) : null}
        </div>
      </header>

      {isMobile ? (
        <>
          <div className="sticky top-16 z-30 flex flex-shrink-0 rounded-lg bg-muted p-1 shadow-sm" aria-label={`${isLaw ? 'Law' : 'Bill'} workspace`}>
            <button type="button" onClick={() => setMobileWorkspace('details')} className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium ${mobileWorkspace === 'details' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`} aria-pressed={mobileWorkspace === 'details'}><ScrollText className="h-4 w-4" /> Details</button>
            <button type="button" onClick={() => setMobileWorkspace('assistant')} className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium ${mobileWorkspace === 'assistant' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`} aria-pressed={mobileWorkspace === 'assistant'}><MessageSquareText className="h-4 w-4" /> Ask this {itemNoun}</button>
          </div>
          <div className="h-[calc(100dvh-7rem)] min-h-[560px]">
            <div className={mobileWorkspace === 'details' ? 'h-full' : 'hidden h-full'}>{detailsPanel}</div>
            <div className={mobileWorkspace === 'assistant' ? 'h-full' : 'hidden h-full'}>{assistantPanel}</div>
          </div>
        </>
      ) : (
        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: assistantOpen ? `minmax(0, 1fr) 10px ${assistantWidth}px` : 'minmax(0, 1fr) 0 0' }}>
          {detailsPanel}
          <div role="separator" aria-label="Resize assistant" aria-orientation="vertical" aria-valuemin={360} aria-valuemax={600} aria-valuenow={assistantWidth} tabIndex={assistantOpen ? 0 : -1} onPointerDown={handleResizeStart} onKeyDown={handleResizeKeyDown} className={`group flex cursor-col-resize items-center justify-center ${assistantOpen ? '' : 'pointer-events-none opacity-0'}`}>
            <span className="flex h-12 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm group-hover:text-foreground group-focus:text-foreground"><GripVertical className="h-4 w-4" /></span>
          </div>
          <div className={`min-h-0 overflow-hidden transition-opacity ${assistantOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>{assistantPanel}</div>
        </div>
      )}
    </div>
  );
}
