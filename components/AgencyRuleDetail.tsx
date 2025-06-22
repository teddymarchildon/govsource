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
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <Breadcrumbs
        steps={[
          { label: 'Home', href: '/' },
          { label: 'Agency Rules', href: '/agency-rules' },
          { label: rule.title }
        ]}
      />

      {/* Header Information */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">{rule.title}</h1>
              <div className="text-sm text-gray-600 mb-2">
                Document Number: {rule.remote_document_number}
              </div>
              <div className="text-sm text-gray-600 mb-2">
                Published: {rule.publication_date && formatDate(rule.publication_date)}
              </div>
              {rule.type && (
                <div className="text-sm text-gray-600 mb-2">
                  Type: <span className="font-medium">{rule.type}</span>
                </div>
              )}
              {rule.subtype && (
                <div className="text-sm text-gray-600 mb-2">
                  Subtype: <span className="font-medium">{rule.subtype}</span>
                </div>
              )}
              {rule.agency && (
                <div className="text-sm text-gray-600">
                  Agency: <Link href={`/agencies/${rule.agency.id}`} className="text-primary hover:underline">{rule.agency.name}</Link>
                </div>
              )}
            </div>
            <SaveButton
              itemId={rule.id}
              itemType="agencyDocument"
            />
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('details')}
            className={`py-4 px-1 inline-flex items-center border-b-2 ${
              activeTab === 'details'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Summary
          </button>

          <button
            onClick={() => setActiveTab('text')}
            className={`py-4 px-1 inline-flex items-center border-b-2 ${
              activeTab === 'text'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Text
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
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
              <div className="h-[600px]">
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

      {/* AI Chat (fixed position) */}
      <AuthProvider>
        <AiChat
          documentType="agencyDocument"
          documentId={rule.id}
          documentTitle={rule.title}
          htmlFilePath={rule.html_file_path}
        />
      </AuthProvider>
    </div>
  );
}
