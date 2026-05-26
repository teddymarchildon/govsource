'use client';

import { useState, useEffect } from 'react';
import { BrainCog, X } from 'lucide-react';
import AiChat from './AiChat';
import { Button } from './ui/button';

interface AiChatWrapperProps {
  documentType: 'bill' | 'law' | 'agencyDocument' | 'opinion' | 'executiveOrder';
  documentId: string;
  documentTitle: string;
  htmlFilePath?: string;
  pdfFilePath?: string;
  diffHtmlFilePaths?: (string | undefined)[];
  height?: string;
  className?: string;
  onCitationClick?: (citation: { label: string; section: number; page?: number; searchText?: string }) => void;
}

export default function AiChatWrapper(props: AiChatWrapperProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Desktop view - render AiChat directly
  if (!isMobile) {
    return <AiChat {...props} />;
  }

  // Mobile view - floating button + modal
  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setShowMobileChat(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-primary/20 bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        aria-label="Open AI Assistant"
        title="Open AI Assistant"
      >
        <BrainCog className="h-5 w-5" />
      </button>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] bg-foreground/20 backdrop-blur-[2px] transition-opacity duration-200 ${showMobileChat ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setShowMobileChat(false)}
      />

      {/* Chat panel - stays mounted to preserve conversation state */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[70] transition-transform duration-300 ${showMobileChat ? 'translate-y-0' : 'translate-y-full pointer-events-none'}`}
      >
        <div className="flex max-h-[85vh] flex-col rounded-t-lg border border-border bg-card shadow-xl">
          <div className="flex justify-center pt-2">
            <div className="h-1 w-9 rounded-full bg-muted-foreground/25" />
          </div>
          {/* Mobile header with close button */}
          <div className="flex items-center justify-between gap-2 border-b px-3 pb-2 pt-1">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {props.documentTitle}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMobileChat(false)}
              className="h-8 w-8 flex-shrink-0 rounded-md p-0"
              aria-label="Close assistant"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Chat content */}
          <div className="flex-1 overflow-hidden">
            <AiChat {...props} height="calc(85vh - 56px)" />
          </div>
        </div>
      </div>
    </>
  );
} 
