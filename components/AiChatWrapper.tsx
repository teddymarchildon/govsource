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
        className="fixed bottom-4 right-4 h-12 w-12 bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 transition-colors z-40 inline-flex items-center justify-center"
        aria-label="Open AI Assistant"
        title="Open AI Assistant"
      >
        <BrainCog className="h-5 w-5" />
      </button>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] bg-black/50 transition-opacity duration-200 ${showMobileChat ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setShowMobileChat(false)}
      />

      {/* Chat panel - stays mounted to preserve conversation state */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[70] transition-transform duration-300 ${showMobileChat ? 'translate-y-0' : 'translate-y-full pointer-events-none'}`}
      >
        <div className="bg-white rounded-t-xl shadow-2xl max-h-[85vh] flex flex-col">
          {/* Mobile header with close button */}
          <div className="flex items-center justify-between p-2 border-b gap-2">
            <h3 className="text-sm font-semibold text-gray-700 truncate flex-1">
              {props.documentTitle}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMobileChat(false)}
              className="h-8 w-8 p-0 flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Chat content */}
          <div className="flex-1 overflow-hidden">
            <AiChat {...props} height="calc(85vh - 48px)" />
          </div>
        </div>
      </div>
    </>
  );
} 