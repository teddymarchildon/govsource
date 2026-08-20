'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  FileText,
  GripVertical,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Scale,
  Users,
} from 'lucide-react';

import AiChat from '@/components/AiChat';
import Breadcrumbs from '@/components/Breadcrumbs';
import PdfViewer, { type PdfJumpTarget } from '@/components/PdfViewer';
import SaveButton from '@/components/SaveButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Cluster, CourtOpinion, Judge } from '@/types/types';

type MobileWorkspace = 'opinions' | 'assistant';

const OPINION_TYPE_ORDER: Record<string, number> = {
  '010combined': 0,
  combined: 0,
  majority: 1,
  '020lead': 1,
  plurality: 2,
  concurrence: 3,
  '030concurrence': 3,
  'concurring in part and dissenting in part': 4,
  dissent: 5,
  '040dissent': 5,
  'per curiam': 6,
};

const OPINION_TYPE_LABELS: Record<string, string> = {
  '010combined': 'Combined',
  '020lead': 'Lead opinion',
  '030concurrence': 'Concurrence',
  '040dissent': 'Dissent',
};

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

function formatCourtDate(dateString: string) {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateString) ? `${dateString}T00:00:00Z` : dateString);
  if (Number.isNaN(parsed.getTime())) return dateString;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function opinionTypeLabel(type?: string) {
  if (!type) return 'Opinion';
  const normalizedType = type.toLowerCase();
  return OPINION_TYPE_LABELS[normalizedType] || `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

function sortOpinions(opinions: CourtOpinion[]) {
  return [...opinions].sort((a, b) => {
    const typeA = a.type?.toLowerCase() || '';
    const typeB = b.type?.toLowerCase() || '';
    return (OPINION_TYPE_ORDER[typeA] ?? 999) - (OPINION_TYPE_ORDER[typeB] ?? 999);
  });
}

function JusticeLink({ judge }: { judge: Judge }) {
  return (
    <Link href={`/judges/${judge.id}`} className="font-medium text-primary hover:underline">
      {judge.full_name}
    </Link>
  );
}

export default function SupremeCourtCaseClient({ cluster }: { cluster: Cluster }) {
  const isMobile = useSyncExternalStore(subscribeToMobileBreakpoint, getMobileSnapshot, getServerMobileSnapshot);
  const sortedOpinions = useMemo(() => sortOpinions(cluster.opinions || []), [cluster.opinions]);
  const chatOpinion = useMemo(
    () => [...sortedOpinions]
      .filter((opinion) => opinion.html_file_path)
      .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime())[0],
    [sortedOpinions],
  );
  const [activeOpinionId, setActiveOpinionId] = useState(sortedOpinions[0]?.id || '');
  const [mobileWorkspace, setMobileWorkspace] = useState<MobileWorkspace>('opinions');
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [assistantWidth, setAssistantWidth] = useState(420);
  const [pdfJumpTarget, setPdfJumpTarget] = useState<PdfJumpTarget>();
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

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

  const handleCitationClick = (citation: { page?: number; searchText?: string }) => {
    if (chatOpinion) setActiveOpinionId(chatOpinion.id);
    setMobileWorkspace('opinions');
    setPdfJumpTarget({ page: citation.page, searchText: citation.searchText, token: Date.now() });
  };

  const opinionsPanel = (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card" aria-label="Court opinions">
      <Tabs value={activeOpinionId} onValueChange={setActiveOpinionId} className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Court opinions</h2>
            <Badge variant="outline" className="h-5 text-[10px]">{sortedOpinions.length}</Badge>
          </div>
          {sortedOpinions.length > 0 ? (
            <TabsList className="h-auto flex-wrap justify-start rounded-lg bg-muted p-0.5">
              {sortedOpinions.map((opinion) => (
                <TabsTrigger key={opinion.id} value={opinion.id} className="h-8 rounded-md px-2.5 text-xs">
                  {opinionTypeLabel(opinion.type)}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {sortedOpinions.map((opinion) => {
            const joinedBy = opinion.joined_by || [];
            return (
              <TabsContent key={opinion.id} value={opinion.id} className="m-0 h-full">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex flex-shrink-0 flex-col gap-2 border-b border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">{opinionTypeLabel(opinion.type)}</Badge>
                        {opinion.author ? (
                          <span className="text-sm text-muted-foreground">Opinion by <JusticeLink judge={opinion.author} /></span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Author not listed</span>
                        )}
                      </div>
                      {joinedBy.length > 0 ? (
                        <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            Joined by{' '}
                            {joinedBy.map((judge, index) => (
                              <span key={judge.id}>
                                <JusticeLink judge={judge} />{index < joinedBy.length - 1 ? ', ' : ''}
                              </span>
                            ))}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    {opinion.date ? <time dateTime={opinion.date} className="shrink-0 text-xs font-medium text-muted-foreground">Filed {formatCourtDate(opinion.date)}</time> : null}
                  </div>

                  <div className="min-h-0 flex-1 bg-white">
                    {opinion.pdf_file_path ? (
                      <PdfViewer
                        storagePath={opinion.pdf_file_path}
                        storageBucket="opinions"
                        className="h-full"
                        jumpTo={opinion.id === chatOpinion?.id ? pdfJumpTarget : undefined}
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                        <FileText className="h-6 w-6" />
                        No PDF is available for this opinion.
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            );
          })}
          {sortedOpinions.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <FileText className="h-6 w-6" />
              No opinions are available for this case.
            </div>
          ) : null}
        </div>
      </Tabs>
    </section>
  );

  const assistantPanel = (
    <AiChat
      documentType="opinion"
      documentId={String(cluster.id)}
      documentTitle={cluster.case_name}
      htmlFilePath={chatOpinion?.html_file_path}
      onCitationClick={handleCitationClick}
      height="100%"
    />
  );

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 md:h-[calc(100dvh-9rem)] md:min-h-[560px]">
      <div className="flex-shrink-0">
        <Breadcrumbs
          steps={[
            { label: 'Home', href: '/' },
            { label: 'Supreme Court Cases', href: '/supreme-court-cases' },
            { label: cluster.case_name },
          ]}
        />
      </div>

      <header className="flex flex-shrink-0 flex-col gap-3 border-b border-border/80 pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-5xl">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Supreme Court case</p>
          <h1 className="text-balance text-2xl font-bold leading-tight text-foreground md:text-3xl">{cluster.case_name}</h1>
          {cluster.case_name_short && cluster.case_name_short !== cluster.case_name ? (
            <p className="mt-1 text-sm text-muted-foreground">{cluster.case_name_short}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {cluster.court?.full_name ? <Badge variant="outline">{cluster.court.full_name}</Badge> : null}
            {cluster.date_filed ? <><span aria-hidden="true">·</span><span>Filed {formatCourtDate(cluster.date_filed)}</span></> : null}
            <span aria-hidden="true">·</span>
            <span>{sortedOpinions.length} opinion{sortedOpinions.length === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SaveButton itemId={cluster.id} itemType="cluster" />
          {!isMobile ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setAssistantOpen((open) => !open)} aria-expanded={assistantOpen}>
              {assistantOpen ? <PanelRightClose className="mr-1.5 h-4 w-4" /> : <PanelRightOpen className="mr-1.5 h-4 w-4" />}
              {assistantOpen ? 'Hide assistant' : 'Ask this opinion'}
            </Button>
          ) : null}
        </div>
      </header>

      {isMobile ? (
        <>
          <div className="sticky top-16 z-30 flex flex-shrink-0 rounded-lg bg-muted p-1 shadow-sm" aria-label="Court opinion workspace">
            <button type="button" onClick={() => setMobileWorkspace('opinions')} className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium ${mobileWorkspace === 'opinions' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`} aria-pressed={mobileWorkspace === 'opinions'}>
              <Scale className="h-4 w-4" /> Opinions
            </button>
            <button type="button" onClick={() => setMobileWorkspace('assistant')} className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium ${mobileWorkspace === 'assistant' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`} aria-pressed={mobileWorkspace === 'assistant'}>
              <MessageSquareText className="h-4 w-4" /> Ask this opinion
            </button>
          </div>
          <div className="h-[calc(100dvh-7rem)] min-h-[560px]">
            <div className={mobileWorkspace === 'opinions' ? 'h-full' : 'hidden h-full'}>{opinionsPanel}</div>
            <div className={mobileWorkspace === 'assistant' ? 'h-full' : 'hidden h-full'}>{assistantPanel}</div>
          </div>
        </>
      ) : (
        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: assistantOpen ? `minmax(0, 1fr) 10px ${assistantWidth}px` : 'minmax(0, 1fr) 0 0' }}>
          {opinionsPanel}
          <div role="separator" aria-label="Resize assistant" aria-orientation="vertical" aria-valuemin={360} aria-valuemax={600} aria-valuenow={assistantWidth} tabIndex={assistantOpen ? 0 : -1} onPointerDown={handleResizeStart} onKeyDown={handleResizeKeyDown} className={`group flex cursor-col-resize items-center justify-center ${assistantOpen ? '' : 'pointer-events-none opacity-0'}`}>
            <span className="flex h-12 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm group-hover:text-foreground group-focus:text-foreground"><GripVertical className="h-4 w-4" /></span>
          </div>
          <div className={`min-h-0 overflow-hidden transition-opacity ${assistantOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>{assistantPanel}</div>
        </div>
      )}
    </div>
  );
}
