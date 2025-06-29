'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../utils/supabase/client';
import { Cluster } from '../../../types/types';
import SaveButton from '../../../components/SaveButton';
import Breadcrumbs from '../../../components/Breadcrumbs';
import PdfViewer from '../../../components/PdfViewer';
import AiChat from '../../../components/AiChat';
import { AuthProvider } from '@/contexts/AuthContext';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { Button } from '@/components/ui/button';
import { BrainCog, X } from 'lucide-react';

export default function SupremeCourtCaseDetailPage() {
  const params = useParams();
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [showMobileChat, setShowMobileChat] = useState(false);
    
  useEffect(() => {
    const fetchCluster = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('cluster')
          .select(`
            *,
            court (*),
            opinions:court_opinion (
              *,
              author:judge (*)
            )
          `)
          .eq('id', params.id)
          .single();

        if (error) throw error;
        setCluster(data);
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : 'Failed to load case');
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchCluster();
    }
  }, [params.id]);

  // Sort opinions by type (majority first, then concurring, then dissenting)
  const sortedOpinions = [...(cluster?.opinions || [])].sort((a, b) => {
    const typeOrder: Record<string, number> = {
      'majority': 0,
      'plurality': 1,
      'concurrence': 2,
      'concurring in part and dissenting in part': 3,
      'dissent': 4,
      'per curiam': 5
    };
    const typeA = a.type?.toLowerCase() || '';
    const typeB = b.type?.toLowerCase() || '';
    const orderA = typeOrder[typeA] !== undefined ? typeOrder[typeA] : 999;
    const orderB = typeOrder[typeB] !== undefined ? typeOrder[typeB] : 999;
    return orderA - orderB;
  });

  useEffect(() => {
    if (sortedOpinions.length > 0) {
      const majorityIdx = sortedOpinions.findIndex(o => o.type?.toLowerCase() === 'majority');
      setActiveTab(majorityIdx >= 0 ? majorityIdx : 0);
    }
  }, [JSON.stringify(sortedOpinions)]);

  // Get the most recent opinion date
  const mostRecentDate = cluster?.opinions?.length && cluster.opinions.length > 0
    ? new Date(Math.max(...cluster.opinions.map(o => new Date(o.date || '').getTime())))
    : null;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <LoadingIndicator size="large" />
        </div>
      </div>
    );
  }

  if (error || !cluster) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">
            {error || 'Case not found'}
          </p>
          <Link href="/supreme-court-cases" className="text-primary hover:underline mt-2 inline-block">
            Back to cases
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 relative min-h-screen">
      {/* Breadcrumb and Top Section (Full Width) */}
      <Breadcrumbs
        steps={[
          { label: 'Home', href: '/' },
          { label: 'Supreme Court Cases', href: '/supreme-court-cases' },
          { label: cluster.case_name }
        ]}
      />

      {/* Header Information */}
      <div className="mb-8">
        <div className="mb-2 flex justify-between items-center">
          <span className="text-gray-600">Supreme Court Case</span>
          <SaveButton itemId={cluster.id} itemType="cluster" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">{cluster.case_name}</h1>
        {cluster.case_name_short && cluster.case_name_short !== cluster.case_name && (
          <h2 className="text-lg md:text-xl mb-4 text-gray-600">{cluster.case_name_short}</h2>
        )}
        
        <div className="mb-6">
          <div className="text-sm mb-1">
            <span className="font-medium">Date Filed:</span> {cluster.date_filed || 'Not available'}
          </div>
          <div className="text-sm">
            <span className="font-medium">Opinions:</span> {cluster.opinions?.length || 0} opinion{(cluster.opinions?.length || 0) !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Main Content: Two-column responsive layout */}
      <div className="flex flex-col md:flex-row gap-8 min-h-[400px] md:h-[calc(100vh-300px)] md:min-h-0">
        {/* Left: Supreme Court Case Details */}
        <div className="w-full md:w-1/2 h-full flex flex-col min-h-0 overflow-y-auto">
          {/* Tab Navigation (always visible) */}
          {sortedOpinions.length > 0 && (
            <div className="border-b border-gray-200 mb-6 overflow-x-auto shrink-0">
              <nav className="flex space-x-4 md:space-x-8 whitespace-nowrap" aria-label="Tabs">
                {sortedOpinions.map((opinion, idx) => (
                  <button
                    key={opinion.id}
                    onClick={() => setActiveTab(idx)}
                    className={`py-3 md:py-4 px-1 inline-flex items-center gap-2 border-b-2 transition-colors duration-200 ${
                      activeTab === idx
                        ? 'border-primary text-primary font-medium'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {opinion.type ? opinion.type.charAt(0).toUpperCase() + opinion.type.slice(1) : 'Opinion'}
                  </button>
                ))}
              </nav>
            </div>
          )}

          {/* Tab Content (scrollable) */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {sortedOpinions.length > 0 ? (
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-6">
                  {(() => {
                    const opinion = sortedOpinions[activeTab];
                    return (
                      <div>
                        <h2 className="text-xl font-semibold mb-4">
                          {opinion.type ? opinion.type.charAt(0).toUpperCase() + opinion.type.slice(1) : 'Opinion'}
                        </h2>
                        <div className="mb-4">
                          <div className="mb-2">
                            <span className="font-medium">Opinion by:</span> {opinion.author?.full_name || 'Unknown'}
                            {opinion.joined_by && opinion.joined_by.length > 0 && (
                              <span className="ml-2 text-gray-600 text-sm">(Joined by: {opinion.joined_by.length} others)</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            {opinion.date && (
                              <span>Date: {new Date(opinion.date).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        {opinion.pdf_file_path ? (
                          <div className="h-[400px] md:h-[600px]">
                            <PdfViewer storagePath={opinion.pdf_file_path} storageBucket="opinions" className="h-full" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-32 text-gray-500 bg-gray-50 rounded-lg">
                            No PDF available for this opinion.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <p className="text-yellow-700">
                  No opinions available for this case.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: AI Chat Panel (desktop) */}
        <div className="w-full md:w-1/2 h-full flex flex-col min-h-0 md:border-l md:pl-8 border-gray-200 overflow-y-auto bg-gray-50 p-2 md:p-3 pb-8 md:pb-12 hidden md:flex">
          <AuthProvider>
            <AiChat
              documentType="opinion"
              documentId={String(cluster.id)}
              documentTitle={cluster.case_name}
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
                      documentType="opinion"
                      documentId={String(cluster.id)}
                      documentTitle={cluster.case_name}
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
