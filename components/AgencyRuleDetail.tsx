'use client';

import { useState } from 'react';
import { formatDate } from '@/utils/utils';
import SaveButton from '@/components/SaveButton';
import PdfViewer from '@/components/PdfViewer';
import Breadcrumbs from './Breadcrumbs';
import { AgencyDocument } from '@/types/types';
import Link from 'next/link';
import AiChat from './AiChat';
import { AuthProvider } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardTitle, CardDescription } from './ui/card';
import { BrainCog, X } from 'lucide-react';

type TabType = 'details' | 'text';

interface AgencyRuleDetailProps {
  rule: AgencyDocument;
}

export default function AgencyRuleDetail({ rule }: AgencyRuleDetailProps) {
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [showMobileChat, setShowMobileChat] = useState(false);

  return (
    <div className="container mx-auto px-4 py-8 relative min-h-screen">
      {/* Breadcrumb and Top Section (Full Width) */}
      <Breadcrumbs
        steps={[
          { label: 'Home', href: '/' },
          { label: 'Agency Rules', href: '/agency-rules' },
          { label: rule.title }
        ]}
      />

      {/* Header Information */}
      <div className="mb-8">
        <div className="mb-2 flex justify-between items-center">
          <span className="text-gray-600">{rule.type || 'Agency Document'}</span>
          <SaveButton itemId={rule.id} itemType="agencyDocument" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">{rule.title}</h1>
        
        <div className="mb-6">
          <div className="text-sm mb-1">
            <span className="font-medium">Document Number:</span> {rule.remote_document_number}
          </div>
          <div className="text-sm mb-1">
            <span className="font-medium">Published:</span> {rule.publication_date && formatDate(rule.publication_date)}
          </div>
          {rule.subtype && (
            <div className="text-sm mb-1">
              <span className="font-medium">Subtype:</span> {rule.subtype}
            </div>
          )}
          {rule.agency && (
            <div className="text-sm">
              <span className="font-medium">Agency:</span>{' '}
              <Link href={`/agencies/${rule.agency.id}`} className="text-primary hover:underline">
                {rule.agency.name}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Main Content: Two-column responsive layout */}
      <div className="flex flex-col md:flex-row gap-8 min-h-[400px] md:h-[calc(100vh-300px)] md:min-h-0">
        {/* Left: Agency Rule Details (Tabs, etc.) */}
        <div className="w-full md:w-1/2 h-full flex flex-col min-h-0 overflow-y-auto">
          {/* Tab Navigation (always visible) */}
          <div className="border-b border-gray-200 mb-6 overflow-x-auto shrink-0">
            <nav className="flex space-x-4 md:space-x-8 whitespace-nowrap" aria-label="Tabs">
              <Button
                variant="ghost"
                onClick={() => setActiveTab('details')}
                className={`inline-flex items-center gap-2 border-b-2 rounded-none px-1 py-3 md:py-4 text-base md:text-lg font-medium transition-colors duration-200 ${
                  activeTab === 'details'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Summary
              </Button>
              <Button
                variant="ghost"
                onClick={() => setActiveTab('text')}
                className={`inline-flex items-center gap-2 border-b-2 rounded-none px-1 py-3 md:py-4 text-base md:text-lg font-medium transition-colors duration-200 ${
                  activeTab === 'text'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Text
              </Button>
            </nav>
          </div>

          {/* Tab Content (scrollable) */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeTab === 'details' && (
              <Card className="overflow-hidden">
                <CardContent className="p-6">
                  {rule.abstract ? (
                    <div className="mb-6">
                      <div dangerouslySetInnerHTML={{ __html: rule.abstract }} />
                    </div>
                  ) : (
                    <CardDescription>No summary available for this rule.</CardDescription>
                  )}
                </CardContent>
              </Card>
            )}

            {activeTab === 'text' && (
              <Card className="overflow-hidden">
                <CardContent className="p-6">
                  <CardTitle className="mb-4">Agency Rule Text</CardTitle>
                  <div className="h-[400px] md:h-[600px]">
                    {rule.pdf_file_path ? (
                      <PdfViewer storagePath={rule.pdf_file_path} storageBucket="agency-docs" className="h-full" />
                    ) : rule.pdf_url ? (
                      <PdfViewer pdfUrl={rule.pdf_url} className="h-full" />
                    ) : (
                      <CardDescription className="flex items-center justify-center h-full">No PDF available</CardDescription>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Right: AI Chat Panel (desktop) */}
        <div className="w-full md:w-1/2 h-full flex flex-col min-h-0 md:border-l md:pl-8 border-gray-200 overflow-y-auto bg-gray-50 p-2 md:p-3 pb-8 md:pb-12 hidden md:flex">
          <AuthProvider>
            <AiChat
              documentType="agencyDocument"
              documentId={rule.id}
              documentTitle={rule.title}
              htmlFilePath={rule.html_file_path}
            />
          </AuthProvider>
        </div>
        {/* Mobile: Floating AI Chat Bubble */}
        <>
          {/* Floating button (bottom right) */}
          {!showMobileChat && (
            <Button
              variant="default"
              size="icon"
              className="fixed bottom-4 right-4 z-40 shadow-lg md:hidden"
              onClick={() => setShowMobileChat(true)}
              aria-label="Open AI Chat"
              style={{ borderRadius: '9999px' }}
            >
              <BrainCog className="h-7 w-7" />
            </Button>
          )}
          {/* Modal overlay with AiChat */}
          {showMobileChat && (
            <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden bg-black/40" onClick={() => setShowMobileChat(false)}>
              <div
                className="w-full max-w-lg mx-auto bg-white rounded-t-xl shadow-2xl border border-gray-200 flex flex-col h-[65vh]"
                style={{
                  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                  borderTopLeftRadius: '1.25rem',
                  borderTopRightRadius: '1.25rem',
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Close button */}
                <button
                  className="absolute top-2 right-4 z-10 text-gray-500 hover:text-gray-800"
                  onClick={() => setShowMobileChat(false)}
                  aria-label="Close AI Chat"
                  type="button"
                >
                  <X className="h-6 w-6" />
                </button>
                <div className="flex-1 flex flex-col">
                  <AuthProvider>
                    <AiChat
                      documentType="agencyDocument"
                      documentId={rule.id}
                      documentTitle={rule.title}
                      htmlFilePath={rule.html_file_path}
                    />
                  </AuthProvider>
                </div>
              </div>
            </div>
          )}
        </>
      </div>
    </div>
  );
}
