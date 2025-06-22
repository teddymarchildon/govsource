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

interface BillOrLawDetailProps {
  item: DetailItem;
  texts: BillText[];
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
    <div className="container mx-auto px-4 py-8 relative">
      {/* Breadcrumb */}
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

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav className="flex space-x-4 md:space-x-8 whitespace-nowrap" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('details')}
            className={`py-3 md:py-4 px-1 inline-flex items-center gap-2 border-b-2 ${
              activeTab === 'details'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Details
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
          <button
            onClick={() => setActiveTab('sponsors')}
            className={`py-3 md:py-4 px-1 inline-flex items-center gap-2 border-b-2 ${
              activeTab === 'sponsors'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Sponsors
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              activeTab === 'sponsors'
                ? 'bg-secondary text-secondary-foreground'
                : 'bg-gray-100 text-gray-900'
            }`}>
              {(sponsors?.length || 0) + (cosponsors?.length || 0)}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={`py-3 md:py-4 px-1 inline-flex items-center gap-2 border-b-2 ${
              activeTab === 'actions'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Actions
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              activeTab === 'actions'
                ? 'bg-secondary text-secondary-foreground'
                : 'bg-gray-100 text-gray-900'
            }`}>
              {actions?.length || 0}
            </span>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mb-8">
        {activeTab === 'details' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Summary</h3>
              {summary && summary.text ? (
                <div className="prose max-w-none mb-6">
                  <div className="bg-gray-50 p-4 rounded text-gray-900 whitespace-pre-line">
                    {getSummaryText()}
                  </div>
                  {needsTruncation && (
                    <button
                      onClick={() => setShowFullSummary(!showFullSummary)}
                      className="text-primary hover:underline text-sm font-medium mt-2"
                    >
                      {showFullSummary ? 'See less' : 'See more'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 italic">No summary available for this bill.</div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'sponsors' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-xl font-semibold mb-4">Sponsors ({sponsors?.length || 0})</h2>
              {sponsors && sponsors.length > 0 ? (
                <div className="bg-white rounded-lg shadow p-4 max-h-[600px] overflow-y-auto">
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
                <p>No sponsors found</p>
              )}
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">Cosponsors ({cosponsors?.length || 0})</h2>
              {cosponsors && cosponsors.length > 0 ? (
                <div className="bg-white rounded-lg shadow p-4 max-h-[600px] overflow-y-auto">
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
                <p>No cosponsors found</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 md:p-6">
              <h2 className="text-xl font-semibold mb-4">{itemType.charAt(0).toUpperCase() + itemType.slice(1)} Actions</h2>
              {actions && actions.length > 0 ? (
                <div className="space-y-4">
                  {actions.map((action) => (
                    <div key={action.id} className="border-b border-gray-200 pb-4 last:border-b-0">
                      <div className="flex items-start">
                        <div className="flex-shrink-0">
                          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                            <span className="text-secondary-foreground text-sm font-medium">
                              {formatDate(action.date)?.split(' ')[0]}
                            </span>
                          </div>
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
                <p>No actions found</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'text' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 md:p-6">
              <h2 className="text-xl font-semibold mb-4">{itemType.charAt(0).toUpperCase() + itemType.slice(1)} Text</h2>
              {latestText ? (
                <div className="h-[400px] md:h-[600px] border rounded">
                  {latestText.pdf_file_path ? (
                    <PdfViewer storagePath={latestText.pdf_file_path} storageBucket="bill-pdfs" className="h-full" />
                  ) : (
                    <div className="bg-gray-50 p-4 font-mono text-sm whitespace-pre-wrap overflow-auto h-full">
                      {item.introduced_date ? new Date(item.introduced_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                    </div>
                  )}
                </div>
              ) : (
                <p>No {itemType} texts available</p>
              )}
            </div>
          </div>
        )}
      </div>
      {/* AI Chat (fixed position) */}
      <AuthProvider>
        <AiChat
          documentType={itemType}
          documentId={item.id}
          documentTitle={title}
          htmlFilePath={latestText?.html_file_path}
        />
      </AuthProvider>
    </div>
  );
}
