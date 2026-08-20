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
} from 'lucide-react';

import type { AgencyDocument } from '@/types/types';
import AiChat from '@/components/AiChat';
import Breadcrumbs from '@/components/Breadcrumbs';
import PdfViewer, { type PdfJumpTarget } from '@/components/PdfViewer';
import SaveButton from '@/components/SaveButton';
import { Button } from '@/components/ui/button';

type MobileWorkspace = 'source' | 'assistant';

interface ExecutiveOrderDetailProps {
  order: AgencyDocument;
}

interface SourceViewerProps {
  order: AgencyDocument;
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

function formatOrderDate(dateString: string) {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateString) ? `${dateString}T00:00:00Z` : dateString);
  if (Number.isNaN(parsed.getTime())) return dateString;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function SourceViewer({ order, jumpTarget }: SourceViewerProps) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card" aria-label="Official executive order source">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Official text</h2>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-white">
        {order.pdf_file_path ? (
          <PdfViewer storagePath={order.pdf_file_path} storageBucket="agency-docs" className="h-full" jumpTo={jumpTarget} />
        ) : order.pdf_url ? (
          <PdfViewer pdfUrl={order.pdf_url} className="h-full" jumpTo={jumpTarget} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">No PDF is available.</div>
        )}
      </div>
    </section>
  );
}

export default function ExecutiveOrderDetail({ order }: ExecutiveOrderDetailProps) {
  const isMobile = useSyncExternalStore(subscribeToMobileBreakpoint, getMobileSnapshot, getServerMobileSnapshot);
  const [mobileWorkspace, setMobileWorkspace] = useState<MobileWorkspace>('source');
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
    setMobileWorkspace('source');
    setPdfJumpTarget({ page: citation.page, searchText: citation.searchText, token: Date.now() });
  };

  const officialSourceUrl = order.html_url || order.pdf_url;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 md:h-[calc(100dvh-9rem)] md:min-h-[560px]">
      <div className="flex-shrink-0">
        <Breadcrumbs
          steps={[
            { label: 'Home', href: '/' },
            { label: 'Executive Orders', href: '/executive-orders' },
            { label: order.title },
          ]}
        />
      </div>

      <header className="flex flex-shrink-0 flex-col gap-3 border-b border-border/80 pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-5xl">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Executive Order</p>
          <h1 className="text-balance text-2xl font-bold leading-tight text-foreground md:text-3xl">{order.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {order.president ? <span className="font-medium text-foreground">President {order.president}</span> : null}
            {order.signing_date ? <><span aria-hidden="true">·</span><span>Signed {formatOrderDate(order.signing_date)}</span></> : null}
            {order.publication_date ? <><span aria-hidden="true">·</span><span>Published {formatOrderDate(order.publication_date)}</span></> : null}
            {order.remote_document_number ? <><span aria-hidden="true">·</span><span>Federal Register document {order.remote_document_number}</span></> : null}
            {order.agency ? (
              <><span aria-hidden="true">·</span><Link href={`/agencies/${order.agency.id}`} className="text-primary hover:underline">{order.agency.name}</Link></>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SaveButton itemId={order.id} itemType="agencyDocument" />
          {officialSourceUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a href={officialSourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-4 w-4" /> Official source
              </a>
            </Button>
          ) : null}
          {order.pdf_url ? (
            <Button variant="outline" size="sm" asChild>
              <a href={order.pdf_url} target="_blank" rel="noopener noreferrer" download>
                <Download className="mr-1.5 h-4 w-4" /> Download PDF
              </a>
            </Button>
          ) : null}
          {!isMobile ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAssistantOpen((open) => !open)}
              aria-expanded={assistantOpen}
            >
              {assistantOpen ? <PanelRightClose className="mr-1.5 h-4 w-4" /> : <PanelRightOpen className="mr-1.5 h-4 w-4" />}
              {assistantOpen ? 'Hide assistant' : 'Ask this order'}
            </Button>
          ) : null}
        </div>
      </header>

      {isMobile ? (
        <>
          <div className="sticky top-16 z-30 flex flex-shrink-0 rounded-lg bg-muted p-1 shadow-sm" aria-label="Executive order workspace">
            <button
              type="button"
              onClick={() => setMobileWorkspace('source')}
              className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium ${mobileWorkspace === 'source' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
              aria-pressed={mobileWorkspace === 'source'}
            >
              <FileText className="h-4 w-4" /> Official text
            </button>
            <button
              type="button"
              onClick={() => setMobileWorkspace('assistant')}
              className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium ${mobileWorkspace === 'assistant' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
              aria-pressed={mobileWorkspace === 'assistant'}
            >
              <MessageSquareText className="h-4 w-4" /> Ask this order
            </button>
          </div>

          <div className="h-[calc(100dvh-7rem)] min-h-[560px]">
            <div className={mobileWorkspace === 'source' ? 'h-full' : 'hidden h-full'}>
              <SourceViewer order={order} jumpTarget={pdfJumpTarget} />
            </div>
            <div className={mobileWorkspace === 'assistant' ? 'h-full' : 'hidden h-full'}>
              <AiChat
                documentType="executiveOrder"
                documentId={order.id}
                documentTitle={order.title}
                htmlFilePath={order.html_file_path}
                onCitationClick={handleCitationClick}
                height="100%"
              />
            </div>
          </div>
        </>
      ) : (
        <div
          className="grid min-h-0 flex-1"
          style={{ gridTemplateColumns: assistantOpen ? `minmax(0, 1fr) 10px ${assistantWidth}px` : 'minmax(0, 1fr) 0 0' }}
        >
          <SourceViewer order={order} jumpTarget={pdfJumpTarget} />
          <div
            role="separator"
            aria-label="Resize assistant"
            aria-orientation="vertical"
            aria-valuemin={360}
            aria-valuemax={600}
            aria-valuenow={assistantWidth}
            tabIndex={assistantOpen ? 0 : -1}
            onPointerDown={handleResizeStart}
            onKeyDown={handleResizeKeyDown}
            className={`group flex cursor-col-resize items-center justify-center ${assistantOpen ? '' : 'pointer-events-none opacity-0'}`}
          >
            <span className="flex h-12 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm group-hover:text-foreground group-focus:text-foreground">
              <GripVertical className="h-4 w-4" />
            </span>
          </div>
          <div className={`min-h-0 overflow-hidden transition-opacity ${assistantOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
            <AiChat
              documentType="executiveOrder"
              documentId={order.id}
              documentTitle={order.title}
              htmlFilePath={order.html_file_path}
              onCitationClick={handleCitationClick}
              height="100%"
            />
          </div>
        </div>
      )}
    </div>
  );
}
