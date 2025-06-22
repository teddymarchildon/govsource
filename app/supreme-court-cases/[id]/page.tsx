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

export default function SupremeCourtCaseDetailPage() {
  const params = useParams();
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
    
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
    <>
      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          steps={[
            { label: 'Home', href: '/' },
            { label: 'Supreme Court Cases', href: '/supreme-court-cases' },
            { label: cluster.case_name }
          ]}
        />
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{cluster.case_name}</h1>
                {cluster.case_name_short && cluster.case_name_short !== cluster.case_name && (
                  <p className="text-lg text-gray-600">{cluster.case_name_short}</p>
                )}
              </div>
              <div className="flex items-center space-x-3 mt-2 md:mt-0">
                <SaveButton itemId={cluster.id} itemType="cluster" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h2 className="text-lg font-semibold mb-3">Case Information</h2>
                <p className="text-gray-700">
                  <span className="font-medium">Date Filed:</span> {cluster.date_filed || 'Not available'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {cluster.opinions?.length || 0} opinion{(cluster.opinions?.length || 0) !== 1 ? 's' : ''} in this case
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">Opinions</h2>
              {sortedOpinions.length > 0 ? (
                <>
                  {/* Tabs Navigation */}
                  <div className="border-b border-gray-200 mb-6">
                    <nav className="flex space-x-8" aria-label="Tabs">
                      {sortedOpinions.map((opinion, idx) => (
                        <button
                          key={opinion.id}
                          onClick={() => setActiveTab(idx)}
                          className={`py-3 px-1 inline-flex items-center border-b-2 transition-colors duration-200 ${
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
                  {/* Tab Content */}
                  <div className="space-y-4">
                    {(() => {
                      const opinion = sortedOpinions[activeTab];
                      return (
                        <div>
                          <div className="mb-2">
                            <span className="font-medium">Opinion by:</span> {opinion.author?.full_name || 'Unknown'}
                            {opinion.joined_by && opinion.joined_by.length > 0 && (
                              <span className="ml-2 text-gray-600 text-sm">(Joined by: {/* TODO: joined by names if available */} {opinion.joined_by.length} others)</span>
                            )}
                          </div>
                          <div className="mb-2 text-sm text-gray-500">
                            {opinion.date && (
                              <span>Date: {new Date(opinion.date).toLocaleDateString()}</span>
                            )}
                          </div>
                          {opinion.pdf_file_path ? (
                            <div className="h-[600px]">
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
                </>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <p className="text-yellow-700">
                    No opinions available for this case.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Floating AI Chat Button */}
      <AuthProvider>
      <AiChat
        documentType="opinion"
        documentId={String(cluster.id)}
        documentTitle={cluster.case_name}
      />
      </AuthProvider>
    </>
  );
}
