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
import { Card, CardContent, CardTitle, CardDescription } from './ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type TabType = 'details' | 'text';

interface AgencyRuleDetailProps {
  rule: AgencyDocument;
}

export default function AgencyRuleDetail({ rule }: AgencyRuleDetailProps) {
  const [activeTab, setActiveTab] = useState<TabType>('details');

  return (
    <div className="container mx-auto px-4 py-8">
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

      {/* Main Content: 2-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_400px] gap-8 min-h-[600px] max-h-[75vh]">
        {/* Left: Tabs */}
        <div className="h-[600px] md:h-[600px] overflow-hidden">
          <Tabs defaultValue="details" className="w-full h-full flex flex-col">
            <TabsList className="mb-4 justify-start bg-transparent">
              <TabsTrigger value="details" className="bg-transparent">Summary</TabsTrigger>
              <TabsTrigger value="text" className="bg-transparent">Text</TabsTrigger>
            </TabsList>
            <div className="flex-1 overflow-y-auto">
              <TabsContent value="details">
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
              </TabsContent>
              <TabsContent value="text">
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
              </TabsContent>
            </div>
          </Tabs>
        </div>
        {/* Right: Sticky AiChat Panel */}
        <div className="relative h-full">
          <div className="md:sticky md:top-28 h-full">
            <div className="h-full overflow-y-auto">
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
      </div>
    </div>
  );
}
