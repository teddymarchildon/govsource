'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { formatDate } from '@/utils/utils';
import SaveButton from './SaveButton';
import PdfViewer, { type PdfJumpTarget } from './PdfViewer';
import Breadcrumbs from './Breadcrumbs';
import AiChatWrapper from './AiChatWrapper';
import { BillText, Congressman, BillSummary } from '@/types/types';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from './ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getPolicyAreaColors } from '@/utils/policyColors';

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

export default function BillOrLawDetail({
  item,
  texts,
  sponsors,
  cosponsors,
  actions,
  summary,
  isLaw = false
}: BillOrLawDetailProps) {
  const [showFullSummary, setShowFullSummary] = useState(false);
  const [pdfJumpTarget, setPdfJumpTarget] = useState<PdfJumpTarget | undefined>(undefined);
  const [activeTab, setActiveTab] = useState('text');
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
  const sortedTexts = useMemo(() => {
    return [...texts].sort((a, b) => {
      // Always show 'Enrolled Bill' at the top
      const aIsEnrolled = a.type?.toLowerCase() === 'enrolled bill';
      const bIsEnrolled = b.type?.toLowerCase() === 'enrolled bill';

      if (aIsEnrolled && !bIsEnrolled) return -1;
      if (!aIsEnrolled && bIsEnrolled) return 1;

      // For non-enrolled bills or when both are enrolled, sort by date descending
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return dateB - dateA;
    });
  }, [texts]);
  const topTextId = sortedTexts[0]?.id?.toString();
  const [openTextIds, setOpenTextIds] = useState<string[]>(topTextId ? [topTextId] : []);
  const validOpenTextIds = openTextIds.filter((id) => sortedTexts.some((t) => t.id.toString() === id));
  const resolvedOpenTextIds = validOpenTextIds.length > 0 ? validOpenTextIds : (topTextId ? [topTextId] : []);

  const handleCitationJump = (citation: { page?: number; searchText?: string }) => {
    setActiveTab('text');
    if (topTextId) setOpenTextIds([topTextId]);
    setPdfJumpTarget({
      page: citation.page,
      searchText: citation.searchText,
      token: Date.now(),
    });
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="container mx-auto px-4 py-4 flex flex-col flex-1 overflow-hidden">
        {/* Breadcrumbs */}
        <div className="mb-1 flex-shrink-0">
          <Breadcrumbs
            steps={[
              { label: 'Home', href: '/' },
              { label: isLaw ? 'Laws' : 'Bills', href: isLaw ? '/laws' : '/bills' },
              { label: number }
            ]}
          />
        </div>

        {/* Header Row: Title, Meta, Watch Button - More compact */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4 flex-shrink-0">
          <div className="flex-1">
            <div className="flex flex-col md:flex-row md:items-baseline md:gap-3">
              <h1 className="text-xl md:text-2xl font-bold">{title}</h1>
              <div className="text-base md:text-lg text-gray-600">{number}</div>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-gray-700 mt-1">
              {item.policy_area ? (
                <Badge variant="outline" className={getPolicyAreaColors(item.policy_area)}>
                  {item.policy_area}
                </Badge>
              ) : (
                <Badge variant="outline">Uncategorized</Badge>
              )}
              <div>
                <span className="font-medium">{dateLabel}:</span> {date && formatDate(date)}
              </div>
              <div>
                <span className="font-medium">Congress:</span> {item.congress}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Watch/Save Button */}
            {!isLaw && <SaveButton itemId={item.id} itemType="bill" />}
          </div>
        </div>

        {/* Main Content: Responsive grid with more space for chat */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_500px] lg:grid-cols-[1fr_550px] xl:grid-cols-[1fr_600px] 2xl:grid-cols-[1fr_700px] gap-4 md:gap-6 flex-1 overflow-hidden">
          {/* Left: Tabs - full width on mobile */}
          <div className="h-full overflow-hidden flex flex-col md:col-span-1">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
              <TabsList className="mb-3 flex-shrink-0">
                <TabsTrigger value="text">
                  Text <Badge variant="outline" className="ml-1 h-5 text-xs">{texts?.length || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="sponsors">
                  Sponsors <Badge variant="outline" className="ml-1 h-5 text-xs">{(sponsors?.length || 0) + (cosponsors?.length || 0)}</Badge>
                </TabsTrigger>
                <TabsTrigger value="actions">
                  Actions <Badge variant="outline" className="ml-1 h-5 text-xs">{actions?.length || 0}</Badge>
                </TabsTrigger>
              </TabsList>
              <div className="flex-1 overflow-hidden">
                <TabsContent value="summary" className="mt-0 h-full">
                  {/* Summary Card */}
                  <Card className="h-full overflow-y-auto">
                    <CardContent className="p-4 md:p-5">
                      {summary?.text ? (
                        <div className="bg-gray-50 p-3 md:p-4 rounded">
                          <div className="prose prose-sm prose-gray max-w-none whitespace-pre-line
                            prose-p:my-2 prose-p:leading-normal
                            prose-ul:my-2 prose-ol:my-2
                            prose-li:my-1 prose-li:leading-normal
                            prose-headings:my-3 prose-headings:font-semibold
                            prose-strong:font-semibold
                            prose-code:text-xs prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-gray-100
                            prose-pre:bg-gray-100 prose-pre:text-xs
                            prose-blockquote:border-gray-300 prose-blockquote:text-gray-700
                            prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
                            <ReactMarkdown>
                              {getSummaryText()}
                            </ReactMarkdown>
                          </div>
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
                <TabsContent value="text" className="mt-0 h-full">
                  <Card className="h-full flex flex-col">
                    <CardContent className="p-4 md:p-5 pt-3 flex-1 overflow-y-auto">
                      <Accordion type="multiple" className="w-full" value={resolvedOpenTextIds} onValueChange={setOpenTextIds}>
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
                              <div className="h-[600px] md:h-[700px] border rounded">
                                {text.pdf_file_path ? (
                                  <PdfViewer
                                    storagePath={text.pdf_file_path}
                                    storageBucket="bill-pdfs"
                                    className="h-full"
                                    jumpTo={text.id.toString() === topTextId ? pdfJumpTarget : undefined}
                                  />
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
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="sponsors" className="mt-0">
                  {/* Sponsors/Cosponsors Cards */}
                  <div className="space-y-6">
                    <Card>
                      <CardHeader className="py-4">
                        <CardTitle className="text-lg">Sponsors ({sponsors?.length || 0})</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {sponsors && sponsors.length > 0 ? (
                          <div className="max-h-[500px] overflow-y-auto">
                            {sponsors.map((sponsor) => (
                              <div key={sponsor.id} className="mb-3 last:mb-0">
                                <Link
                                  href={`/congress-members/${sponsor.id}`}
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
                      <CardHeader className="py-4">
                        <CardTitle className="text-lg">Cosponsors ({cosponsors?.length || 0})</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {cosponsors && cosponsors.length > 0 ? (
                          <div className="max-h-[500px] overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {cosponsors.map((cosponsor) => (
                                <div key={cosponsor.id} className="mb-2">
                                  <Link
                                    href={`/congress-members/${cosponsor.id}`}
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
                <TabsContent value="actions" className="mt-0 h-full">
                  {/* Actions Card */}
                  <Card className="h-full flex flex-col">
                    <CardContent className="p-4 flex-1 overflow-y-auto">
                      {actions && actions.length > 0 ? (
                        <div className="space-y-3">
                          {actions.map((action) => (
                            <div key={action.id} className="border-b border-gray-200 pb-3 last:border-b-0">
                              <div className="flex items-start">
                                <div className="flex-shrink-0">
                                  <Badge variant="secondary" className="h-7 w-7 flex items-center justify-center text-xs font-medium rounded-full">
                                    {formatDate(action.date)?.split(' ')[0]}
                                  </Badge>
                                </div>
                                <div className="ml-3">
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
              onCitationClick={handleCitationJump}
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
          onCitationClick={handleCitationJump}
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
