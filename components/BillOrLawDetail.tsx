'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDate } from '@/utils/utils';
import SaveButton from './SaveButton';
import PdfViewer from './PdfViewer';
import Breadcrumbs from './Breadcrumbs';
import AiChat from './AiChat';
import { BillText, Congressman, BillSummary } from '@/types/types';
import { AuthProvider } from '../contexts/AuthContext';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from './ui/card';
import { BrainCog, X } from 'lucide-react';

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
  const [showMobileChat, setShowMobileChat] = useState(false);
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
    <div className="container mx-auto px-4 py-8 relative min-h-screen">
      {/* Breadcrumb and Top Section (Full Width) */}
      <Breadcrumbs
        steps={[
          { label: 'Home', href: '/' },
          { label: isLaw ? 'Laws' : 'Bills', href: isLaw ? '/laws' : '/bills' },
          { label: number }
        ]}
      />

      <div className="mb-8">
        <div className="mb-2 flex justify-between items-center">
          <span className="text-gray-600">{item.policy_area || 'Uncategorized'}</span>
          {!isLaw && <SaveButton itemId={item.id} itemType="bill" />}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">{title}</h1>
        <h2 className="text-lg md:text-xl mb-4">{number}</h2>
        <div className="mb-6">
          <div className="text-sm mb-1">
            <span className="font-medium">{dateLabel}:</span> {date && formatDate(date)}
          </div>
          <div className="text-sm">
            <span className="font-medium">Congress:</span> {item.congress}
          </div>
        </div>
      </div>

      {/* Main Content: Two-column responsive layout */}
      <div className="flex flex-col md:flex-row gap-8 min-h-[400px] md:h-[calc(100vh-300px)] md:min-h-0">
        {/* Left: Bill/Law Details (Tabs, etc.) */}
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
                <Badge variant={activeTab === 'text' ? 'secondary' : 'outline'}>{texts?.length || 0}</Badge>
              </Button>
              <Button
                variant="ghost"
                onClick={() => setActiveTab('sponsors')}
                className={`inline-flex items-center gap-2 border-b-2 rounded-none px-1 py-3 md:py-4 text-base md:text-lg font-medium transition-colors duration-200 ${
                  activeTab === 'sponsors'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Sponsors
                <Badge variant={activeTab === 'sponsors' ? 'secondary' : 'outline'}>{(sponsors?.length || 0) + (cosponsors?.length || 0)}</Badge>
              </Button>
              <Button
                variant="ghost"
                onClick={() => setActiveTab('actions')}
                className={`inline-flex items-center gap-2 border-b-2 rounded-none px-1 py-3 md:py-4 text-base md:text-lg font-medium transition-colors duration-200 ${
                  activeTab === 'actions'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Actions
                <Badge variant={activeTab === 'actions' ? 'secondary' : 'outline'}>{actions?.length || 0}</Badge>
              </Button>
            </nav>
          </div>

          {/* Tab Content (scrollable) */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeTab === 'details' && (
              <Card className="overflow-hidden">
                <CardContent className="p-6">
                  {summary && summary.text ? (
                    <div className="mb-6">
                      <div className="bg-gray-50 p-4 rounded text-gray-900 whitespace-pre-line">
                        {getSummaryText()}
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
            )}
            {activeTab === 'sponsors' && (
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
            )}

            {activeTab === 'actions' && (
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
            )}

            {activeTab === 'text' && (
              <Card>
                <CardContent className="p-4 md:p-6">
                  <CardTitle className="mb-4">{itemType.charAt(0).toUpperCase() + itemType.slice(1)} Texts</CardTitle>
                  {texts && texts.length > 0 ? (
                    <div>
                      {/** Sort texts by date descending (most recent first) */}
                      {(() => {
                        const sortedTexts = [...texts].sort((a, b) => {
                          const dateA = a.date ? new Date(a.date).getTime() : 0;
                          const dateB = b.date ? new Date(b.date).getTime() : 0;
                          // Place entries with missing/invalid dates at the end
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
                    </div>
                  ) : (
                    <CardDescription>No {itemType} texts available</CardDescription>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        {/* Right: AI Chat Panel (desktop) */}
        <div className="w-full md:w-1/2 h-full flex flex-col min-h-0 md:border-l md:pl-8 border-gray-200 overflow-y-auto bg-gray-50 p-2 md:p-3 pb-8 md:pb-12 hidden md:flex">
          <AuthProvider>
            <AiChat
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
