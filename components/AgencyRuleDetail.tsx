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

type TabType = 'details' | 'text';

interface AgencyRuleDetailProps {
  rule: AgencyDocument;
}

export default function AgencyRuleDetail({ rule }: AgencyRuleDetailProps) {
  const [activeTab, setActiveTab] = useState<TabType>('details');

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
              <button
                onClick={() => setActiveTab('details')}
                className={`py-3 md:py-4 px-1 inline-flex items-center gap-2 border-b-2 ${
                  activeTab === 'details'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setActiveTab('text')}
                className={`py-3 md:py-4 px-1 inline-flex items-center gap-2 border-b-2 ${
                  activeTab === 'text'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Text
              </button>
            </nav>
          </div>

          {/* Tab Content (scrollable) */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeTab === 'details' && (
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-6">
                  {rule.abstract ? (
                    <div className="prose max-w-none mb-6">
                      <div dangerouslySetInnerHTML={{ __html: rule.abstract }} />
                    </div>
                  ) : (
                    <div className="text-gray-500 italic">No summary available for this rule.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'text' && (
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-6">
                  <h2 className="text-xl font-semibold mb-4">Agency Rule Text</h2>
                  <div className="h-[400px] md:h-[600px]">
                    {rule.pdf_file_path ? (
                      <PdfViewer storagePath={rule.pdf_file_path} storageBucket="agency-docs" className="h-full" />
                    ) : rule.pdf_url ? (
                      <PdfViewer pdfUrl={rule.pdf_url} className="h-full" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        No PDF available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: AI Chat Panel */}
        <div className="w-full md:w-1/2 h-full flex flex-col min-h-0 md:border-l md:pl-8 border-gray-200 overflow-y-auto bg-gray-50 p-2 md:p-3 pb-8 md:pb-12">
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
  );
}
