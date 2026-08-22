'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  Download,
  ExternalLink,
  FileText,
  GripVertical,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from 'lucide-react';

import AiChat from '@/components/AiChat';
import Breadcrumbs from '@/components/Breadcrumbs';
import PdfViewer, { type PdfJumpTarget } from '@/components/PdfViewer';
import SaveButton from '@/components/SaveButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AgencyDocument } from '@/types/types';
import { formatDate, plainText } from '@/utils/utils';

type MobileWorkspace = 'document' | 'assistant';
type DocumentTab = 'summary' | 'text';

interface AgencyRuleDetailProps {
  rule: AgencyDocument;
}

interface DocumentPanelProps {
  rule: AgencyDocument;
  activeTab: DocumentTab;
  onTabChange: (tab: DocumentTab) => void;
  jumpTarget?: PdfJumpTarget;
}

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

function DocumentPanel({ rule, activeTab, onTabChange, jumpTarget }: DocumentPanelProps) {
  const summary = plainText(rule.abstract);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card" aria-label="Agency document">
      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as DocumentTab)} className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Agency document</h2>
          </div>
          <TabsList className="h-auto w-auto rounded-lg border-0 bg-muted p-0.5">
            {summary ? <TabsTrigger value="summary" className="h-8 rounded-md px-3 text-xs">Summary</TabsTrigger> : null}
            <TabsTrigger value="text" className="h-8 rounded-md px-3 text-xs">Official text</TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {summary ? (
            <TabsContent value="summary" className="m-0 h-full overflow-y-auto">
              <div className="mx-auto max-w-3xl px-5 py-7 md:px-8 md:py-10">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Federal Register summary</p>
                <h3 className="mt-2 text-2xl font-bold text-foreground">What this document covers</h3>
                <p className="mt-5 whitespace-pre-line text-base leading-8 text-foreground/85">{summary}</p>
                <p className="mt-8 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
                  This summary comes from the document&apos;s official record. Open the official text for the complete language.
                </p>
              </div>
            </TabsContent>
          ) : null}

          <TabsContent value="text" className="m-0 h-full bg-white">
            {rule.pdf_file_path ? (
              <PdfViewer storagePath={rule.pdf_file_path} storageBucket="agency-docs" className="h-full" jumpTo={jumpTarget} />
            ) : rule.pdf_url ? (
              <PdfViewer pdfUrl={rule.pdf_url} className="h-full" jumpTo={jumpTarget} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <FileText className="h-7 w-7 text-muted-foreground" />
                <div><p className="font-medium">No PDF is available</p><p className="mt-1 text-sm text-muted-foreground">Use the official source link above when available.</p></div>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

export default function AgencyRuleDetail({ rule }: AgencyRuleDetailProps) {
  const isMobile = useSyncExternalStore(subscribeToMobileBreakpoint, getMobileSnapshot, getServerMobileSnapshot);
  const [mobileWorkspace, setMobileWorkspace] = useState<MobileWorkspace>('document');
  const [documentTab, setDocumentTab] = useState<DocumentTab>(plainText(rule.abstract) ? 'summary' : 'text');
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
    setMobileWorkspace('document');
    setDocumentTab('text');
    setPdfJumpTarget({ page: citation.page, searchText: citation.searchText, token: Date.now() });
  };

  const officialSourceUrl = rule.html_url || rule.pdf_url;
  const documentLabel = rule.subtype || rule.type || 'Agency document';
  const documentPanel = <DocumentPanel rule={rule} activeTab={documentTab} onTabChange={setDocumentTab} jumpTarget={pdfJumpTarget} />;
  const assistantPanel = (
    <AiChat
      documentType="agencyDocument"
      documentId={rule.id}
      documentTitle={rule.title}
      htmlFilePath={rule.html_file_path}
      onCitationClick={handleCitationClick}
      height="100%"
    />
  );

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 md:h-[calc(100dvh-9rem)] md:min-h-[560px]">
      <div className="flex-shrink-0">
        <Breadcrumbs steps={[{ label: 'Home', href: '/' }, { label: 'Agency documents', href: '/agency-rules' }, { label: rule.title }]} />
      </div>

      <header className="flex flex-shrink-0 flex-col gap-3 border-b border-border/80 pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-5xl">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Federal agency document</p>
            <Badge variant="secondary">{documentLabel}</Badge>
          </div>
          <h1 className="text-balance text-2xl font-bold leading-tight text-foreground md:text-3xl">{rule.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {rule.agency ? <Link href={`/agencies/${rule.agency.id}`} className="font-medium text-primary hover:underline">{rule.agency.name}</Link> : null}
            {rule.publication_date ? <><span aria-hidden="true">·</span><span>Published {formatDate(rule.publication_date)}</span></> : null}
            {rule.remote_document_number ? <><span aria-hidden="true">·</span><span>Document {rule.remote_document_number}</span></> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SaveButton itemId={rule.id} itemType="agencyDocument" />
          {officialSourceUrl ? <Button variant="outline" size="sm" asChild><a href={officialSourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />Official source</a></Button> : null}
          {rule.pdf_url ? <Button variant="outline" size="sm" asChild><a href={rule.pdf_url} target="_blank" rel="noopener noreferrer" download><Download className="mr-1.5 h-4 w-4" />Download PDF</a></Button> : null}
          {!isMobile ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setAssistantOpen((open) => !open)} aria-expanded={assistantOpen}>
              {assistantOpen ? <PanelRightClose className="mr-1.5 h-4 w-4" /> : <PanelRightOpen className="mr-1.5 h-4 w-4" />}
              {assistantOpen ? 'Hide assistant' : 'Ask this document'}
            </Button>
          ) : null}
        </div>
      </header>

      {isMobile ? (
        <>
          <div className="sticky top-16 z-30 flex flex-shrink-0 rounded-lg bg-muted p-1 shadow-sm" aria-label="Agency document workspace">
            <button type="button" onClick={() => setMobileWorkspace('document')} className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium ${mobileWorkspace === 'document' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`} aria-pressed={mobileWorkspace === 'document'}><FileText className="h-4 w-4" />Document</button>
            <button type="button" onClick={() => setMobileWorkspace('assistant')} className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium ${mobileWorkspace === 'assistant' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`} aria-pressed={mobileWorkspace === 'assistant'}><MessageSquareText className="h-4 w-4" />Ask this document</button>
          </div>
          <div className="h-[calc(100dvh-7rem)] min-h-[560px]">
            <div className={mobileWorkspace === 'document' ? 'h-full' : 'hidden h-full'}>{documentPanel}</div>
            <div className={mobileWorkspace === 'assistant' ? 'h-full' : 'hidden h-full'}>{assistantPanel}</div>
          </div>
        </>
      ) : (
        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: assistantOpen ? `minmax(0, 1fr) 10px ${assistantWidth}px` : 'minmax(0, 1fr) 0 0' }}>
          {documentPanel}
          <div role="separator" aria-label="Resize assistant" aria-orientation="vertical" aria-valuemin={360} aria-valuemax={600} aria-valuenow={assistantWidth} tabIndex={assistantOpen ? 0 : -1} onPointerDown={handleResizeStart} onKeyDown={handleResizeKeyDown} className={`group flex cursor-col-resize items-center justify-center ${assistantOpen ? '' : 'pointer-events-none opacity-0'}`}>
            <span className="flex h-12 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm group-hover:text-foreground group-focus:text-foreground"><GripVertical className="h-4 w-4" /></span>
          </div>
          <div className={`min-h-0 overflow-hidden transition-opacity ${assistantOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>{assistantPanel}</div>
        </div>
      )}
    </div>
  );
}
