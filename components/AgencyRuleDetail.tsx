'use client';

import { useState } from 'react';
import { formatDate } from '@/utils/utils';
import SaveButton from '@/components/SaveButton';
import PdfViewer from '@/components/PdfViewer';
import Breadcrumbs from './Breadcrumbs';
import { AgencyDocument } from '@/types/types';
import Link from 'next/link';
import AiChatWrapper from './AiChatWrapper';
import { Card, CardContent, CardTitle, CardDescription } from './ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type TabType = 'details' | 'text';

interface AgencyRuleDetailProps {
  rule: AgencyDocument;
}

export default function AgencyRuleDetail({ rule }: AgencyRuleDetailProps) {
  const [activeTab, setActiveTab] = useState<TabType>('details');

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="container mx-auto px-4 py-4 flex flex-col flex-1 overflow-hidden">
        {/* Breadcrumbs */}
        <div className="mb-1 flex-shrink-0">
          <Breadcrumbs
            steps={[
              { label: 'Home', href: '/' },
              { label: 'Agency Rules', href: '/agency-rules' },
              { label: rule.title }
            ]}
          />
        </div>

        {/* Header Information - More compact */}
        <div className="mb-4 flex-shrink-0">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div className="flex-1">
              <div className="flex flex-col md:flex-row md:items-baseline md:gap-3">
                <h1 className="text-xl md:text-2xl font-bold">{rule.title}</h1>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-gray-700 mt-1">
                <div className="text-gray-600">{rule.type || 'Agency Document'}</div>
                <div>
                  <span className="font-medium">Document Number:</span> {rule.remote_document_number}
                </div>
                <div>
                  <span className="font-medium">Published:</span> {rule.publication_date && formatDate(rule.publication_date)}
                </div>
                {rule.subtype && (
                  <div>
                    <span className="font-medium">Subtype:</span> {rule.subtype}
                  </div>
                )}
                {rule.agency && (
                  <div>
                    <span className="font-medium">Agency:</span>{' '}
                    <Link href={`/agencies/${rule.agency.id}`} className="text-primary hover:underline">
                      {rule.agency.name}
                    </Link>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <SaveButton itemId={rule.id} itemType="agencyDocument" />
            </div>
          </div>
        </div>

        {/* Main Content: Responsive grid with more space for chat */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_500px] lg:grid-cols-[1fr_550px] xl:grid-cols-[1fr_600px] 2xl:grid-cols-[1fr_700px] gap-4 md:gap-6 flex-1 overflow-hidden">
          {/* Left: Tabs - full width on mobile */}
          <div className="h-full overflow-hidden flex flex-col md:col-span-1">
            <Tabs defaultValue="details" className="w-full h-full flex flex-col">
              <TabsList className="mb-3 justify-start bg-transparent flex-shrink-0 h-9 p-0">
                <TabsTrigger value="details" className="bg-transparent px-2 py-1 text-sm">Summary</TabsTrigger>
                <TabsTrigger value="text" className="bg-transparent px-2 py-1 text-sm">Text</TabsTrigger>
              </TabsList>
              <div className="flex-1 overflow-y-auto">
                <TabsContent value="details" className="mt-0">
                  <Card className="overflow-hidden">
                    <CardContent className="p-4 md:p-5">
                      {rule.abstract ? (
                        <div className="bg-gray-50 p-3 md:p-4 rounded">
                          <div className="prose prose-sm prose-gray max-w-none 
                            prose-p:my-2 prose-p:leading-normal
                            prose-ul:my-2 prose-ol:my-2
                            prose-li:my-1 prose-li:leading-normal
                            prose-headings:my-3 prose-headings:font-semibold
                            prose-strong:font-semibold
                            prose-code:text-xs prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-gray-100
                            prose-pre:bg-gray-100 prose-pre:text-xs
                            prose-blockquote:border-gray-300 prose-blockquote:text-gray-700
                            prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
                            dangerouslySetInnerHTML={{ __html: rule.abstract }} />
                        </div>
                      ) : (
                        <CardDescription>No summary available for this rule.</CardDescription>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="text" className="mt-0">
                  <Card className="overflow-hidden">
                    <CardContent className="p-4 md:p-5">
                      <CardTitle className="mb-3 text-lg">Agency Rule Text</CardTitle>
                      <div className="h-[400px] md:h-[500px]">
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
          
          {/* Right: AiChatWrapper - hidden on mobile, shown on desktop */}
          <div className="hidden md:flex h-full flex-col min-h-0">
            <AiChatWrapper
              documentType="agencyDocument"
              documentId={rule.id}
              documentTitle={rule.title}
              htmlFilePath={rule.html_file_path}
              height="100%"
            />
          </div>
        </div>
      </div>

      {/* AiChatWrapper for mobile - renders floating button */}
      <div className="md:hidden">
        <AiChatWrapper
          documentType="agencyDocument"
          documentId={rule.id}
          documentTitle={rule.title}
          htmlFilePath={rule.html_file_path}
        />
      </div>
    </div>
  );
}
