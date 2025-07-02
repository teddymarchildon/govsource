'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDate } from '@/utils/utils';
import SaveButton from './SaveButton';
import PdfViewer from './PdfViewer';
import Breadcrumbs from './Breadcrumbs';
import AiChatWrapper from './AiChatWrapper';
import { BillText, Congressman, BillSummary } from '@/types/types';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from './ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface BillAction {
  id: string;
  bill_id: string;
  date: string;
  text: string;
  type: string;
}

interface DetailItem {
  id: string;
  congress: number;
  type: string;
  number: string;
  title: string;
  policy_area: string;
  introduced_date: string;
  law_enacted_date?: string;
  law_number?: string;
  law_type?: string;
  law_unique_id?: string;
  law_title?: string;
}

// Patch BillText type to include 'type' for UI use
export interface BillTextWithType extends BillText {
  type?: string;
}

interface BillOrLawDetailProps {
  item: DetailItem;
  texts: BillTextWithType[];
  sponsors: Congressman[];
  cosponsors: Congressman[];
  actions: BillAction[];
  summary?: BillSummary | null;
  isLaw?: boolean;
}

type TabType = 'details' | 'sponsors' | 'actions' | 'text';

export default function BillOrLawDetail({
  item,
  texts,
  sponsors,
  cosponsors,
  actions,
  summary,
  isLaw = false
}: BillOrLawDetailProps) {
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [showFullSummary, setShowFullSummary] = useState(false);
  const latestText = texts.length > 0 ? texts[0] : null;

  const itemType = isLaw ? 'law' : 'bill';
  const title = isLaw ? (item.law_title || item.title) : item.title;
  const number = isLaw ? `Public Law ${item.law_number || `${item.congress}-${item.number}`}` : `${item.type.toUpperCase()}. ${item.number}`;
  const dateLabel = isLaw ? 'Enacted' : 'Introduced';
  const date = isLaw ? item.law_enacted_date : item.introduced_date;

  // Function to truncate text to 1000 characters
  const truncateText = (text: string, maxLength = 1000) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Get the summary text to display
  const getSummaryText = () => {
    if (!summary?.text) return '';
    return showFullSummary ? summary.text : truncateText(summary.text);
  };

  // Check if summary text needs truncation
  const needsTruncation = summary?.text && summary.text.length > 1000;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="container mx-auto px-4 py-8 flex flex-col flex-1 overflow-hidden">
        {/* Breadcrumbs */}
        <div className="mb-2 flex-shrink-0">
          <Breadcrumbs
            steps={[
              { label: 'Home', href: '/' },
              { label: isLaw ? 'Laws' : 'Bills', href: isLaw ? '/laws' : '/bills' },
              { label: number }
            ]}
          />
        </div>

        {/* Header Row: Title, Meta, Watch Button */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 flex-shrink-0">
          <div>
            <div className="text-gray-600 mb-1">{item.policy_area || 'Uncategorized'}</div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1">{title}</h1>
            <div className="text-lg md:text-xl mb-2">{number}</div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-700">
              <div>
                <span className="font-medium">{dateLabel}:</span> {date && formatDate(date)}
              </div>
              <div>
                <span className="font-medium">Congress:</span> {item.congress}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Watch/Save Button */}
            {!isLaw && <SaveButton itemId={item.id} itemType="bill" />}
          </div>
        </div>

        {/* Main Content: Full width on mobile, 2-column on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_400px] gap-8 flex-1 overflow-hidden">
          {/* Left: Tabs - full width on mobile */}
          <div className="h-full overflow-hidden flex flex-col md:col-span-1">
            <Tabs defaultValue="summary" className="w-full h-full flex flex-col">
              <TabsList className="mb-4 justify-start bg-transparent flex-shrink-0">
                <TabsTrigger value="summary" className="bg-transparent">Summary</TabsTrigger>
                <TabsTrigger value="text" className="bg-transparent">
                  Text <Badge variant="outline" className="ml-1">{texts?.length || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger value="sponsors" className="bg-transparent">
                  Sponsors <Badge variant="outline" className="ml-1">{(sponsors?.length || 0) + (cosponsors?.length || 0)}</Badge>
                </TabsTrigger>
                <TabsTrigger value="actions" className="bg-transparent">
                  Actions <Badge variant="outline" className="ml-1">{actions?.length || 0}</Badge>
                </TabsTrigger>
              </TabsList>
              <div className="flex-1 overflow-y-auto">
                <TabsContent value="summary">
                  {/* Summary Card */}
                  <Card>
                    <CardContent className="p-6">
                      {summary?.text ? (
                        <div className="bg-gray-50 p-4 rounded text-gray-900 whitespace-pre-line">
                          {getSummaryText()}
                          {needsTruncation && (
                            <Button
                              variant="link"
                              onClick={() => setShowFullSummary(!showFullSummary)}
                              className="text-primary text-sm font-medium mt-2 px-0"
                            >
                              {showFullSummary ? 'See less' : 'See more'}
                            </Button>
                          )}
                        </div>
                      ) : (
                        <CardDescription>No summary available for this bill.</CardDescription>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="text">
                  <Card>
                    <CardContent className="p-6 pt-3">
                      {(() => {
                        const sortedTexts = [...texts].sort((a, b) => {
                          const dateA = a.date ? new Date(a.date).getTime() : 0;
                          const dateB = b.date ? new Date(b.date).getTime() : 0;
                          if (!a.date) return 1;
                          if (!b.date) return -1;
                          return dateB - dateA;
                        });
                        return (
                          <Accordion type="multiple" className="w-full" defaultValue={sortedTexts.length > 0 ? [sortedTexts[0].id.toString()] : []}>
                            {sortedTexts.map((text) => (
                              <AccordionItem key={text.id} value={text.id.toString()}>
                                <AccordionTrigger>
                                  <div className="flex flex-col items-start">
                                    <span className="font-medium">
                                      {typeof text.type === 'string' && text.type.trim() !== '' ? text.type : null}
                                    </span>
                                    {text.date && (
                                      <span className="text-xs text-gray-500">
                                        {formatDate(text.date)}
                                      </span>
                                    )}
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="h-[400px] md:h-[600px] border rounded">
                                    {text.pdf_file_path ? (
                                      <PdfViewer storagePath={text.pdf_file_path} storageBucket="bill-pdfs" className="h-full" />
                                    ) : (
                                      <CardDescription className="bg-gray-50 p-4 font-mono text-sm whitespace-pre-wrap overflow-auto h-full">
                                        No PDF available for this version.
                                      </CardDescription>
                                    )}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="sponsors">
                  {/* Sponsors/Cosponsors Cards */}
                  <div className="space-y-8">
                    <Card>
                      <CardHeader>
                        <CardTitle>Sponsors ({sponsors?.length || 0})</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {sponsors && sponsors.length > 0 ? (
                          <div className="max-h-[600px] overflow-y-auto">
                            {sponsors.map((sponsor) => (
                              <div key={sponsor.id} className="mb-4 last:mb-0">
                                <Link
                                  href={`/congressmen/${sponsor.id}`}
                                  className="font-medium hover:underline"
                                >
                                  {sponsor.full_name}
                                </Link>
                                <div className="text-sm text-gray-600">
                                  {sponsor.party}-{sponsor.state}{sponsor.chamber === 'House' ? `, District ${sponsor.district || 'N/A'}` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <CardDescription>No sponsors found</CardDescription>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>Cosponsors ({cosponsors?.length || 0})</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {cosponsors && cosponsors.length > 0 ? (
                          <div className="max-h-[600px] overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {cosponsors.map((cosponsor) => (
                                <div key={cosponsor.id} className="mb-2">
                                  <Link
                                    href={`/congressmen/${cosponsor.id}`}
                                    className="font-medium hover:underline text-sm"
                                  >
                                    {cosponsor.full_name}
                                  </Link>
                                  <div className="text-xs text-gray-600">
                                    {cosponsor.party}-{cosponsor.state}{cosponsor.chamber === 'House' ? `, ${cosponsor.district || ''}` : ''}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <CardDescription>No cosponsors found</CardDescription>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
                <TabsContent value="actions">
                  {/* Actions Card */}
                  <Card>
                    <CardContent className="p-4 md:p-6">
                      <CardTitle className="mb-4">{itemType.charAt(0).toUpperCase() + itemType.slice(1)} Actions</CardTitle>
                      {actions && actions.length > 0 ? (
                        <div className="space-y-4">
                          {actions.map((action) => (
                            <div key={action.id} className="border-b border-gray-200 pb-4 last:border-b-0">
                              <div className="flex items-start">
                                <div className="flex-shrink-0">
                                  <Badge variant="secondary" className="h-8 w-8 flex items-center justify-center text-sm font-medium rounded-full">
                                    {formatDate(action.date)?.split(' ')[0]}
                                  </Badge>
                                </div>
                                <div className="ml-4">
                                  <p className="text-sm text-gray-900">{action.text}</p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {formatDate(action.date)} • {action.type}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <CardDescription>No actions found</CardDescription>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </Tabs>
          </div>

          {/* Right: AiChatWrapper - hidden on mobile, shown on desktop */}
          <div className="hidden md:flex h-full flex-col min-h-0">
            <AiChatWrapper
              documentType={itemType}
              documentId={item.id}
              documentTitle={title}
              htmlFilePath={latestText?.html_file_path}
              diffHtmlFilePaths={
                texts.length > 1
                  ? [...texts]
                      .sort((a, b) => {
                        const dateA = a.date ? new Date(a.date).getTime() : 0;
                        const dateB = b.date ? new Date(b.date).getTime() : 0;
                        if (!a.date) return 1;
                        if (!b.date) return -1;
                        return dateB - dateA;
                      })
                      .slice(0, 2)
                      .map((t) => t.html_file_path)
                  : undefined
              }
              height="100%"
            />
          </div>
        </div>
      </div>

      {/* AiChatWrapper for mobile - renders floating button */}
      <div className="md:hidden">
        <AiChatWrapper
          documentType={itemType}
          documentId={item.id}
          documentTitle={title}
          htmlFilePath={latestText?.html_file_path}
          diffHtmlFilePaths={
            texts.length > 1
              ? [...texts]
                  .sort((a, b) => {
                    const dateA = a.date ? new Date(a.date).getTime() : 0;
                    const dateB = b.date ? new Date(b.date).getTime() : 0;
                    if (!a.date) return 1;
                    if (!b.date) return -1;
                    return dateB - dateA;
                  })
                  .slice(0, 2)
                  .map((t) => t.html_file_path)
              : undefined
          }
        />
      </div>
    </div>
  );
}
