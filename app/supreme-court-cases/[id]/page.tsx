'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../utils/supabase/client';
import { Cluster } from '../../../types/types';
import SaveButton from '../../../components/SaveButton';
import Breadcrumbs from '../../../components/Breadcrumbs';
import PdfViewer from '../../../components/PdfViewer';
import AiChatWrapper from '../../../components/AiChatWrapper';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function SupremeCourtCaseDetailPage() {
  const params = useParams();
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [_activeTab, setActiveTab] = useState(0);
    
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
  const _mostRecentDate = cluster?.opinions?.length && cluster.opinions.length > 0
    ? new Date(Math.max(...cluster.opinions.map(o => new Date(o.date || '').getTime())))
    : null;

  // Get the most recent opinion (by date)
  const mostRecentOpinion = cluster?.opinions && cluster.opinions.length > 0
    ? [...cluster.opinions].sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime())[0]
    : null;
  const mostRecentHtmlFilePath = mostRecentOpinion?.html_file_path;

  // Helper to map opinion type for display
  function mapOpinionType(type?: string) {
    if (!type) return 'Opinion';
    if (type === '010combined') return 'Combined';
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

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
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="container mx-auto px-4 py-4 flex flex-col flex-1 overflow-hidden">
        {/* Breadcrumbs */}
        <div className="mb-1 flex-shrink-0">
          <Breadcrumbs
            steps={[
              { label: 'Home', href: '/' },
              { label: 'Supreme Court Cases', href: '/supreme-court-cases' },
              { label: cluster.case_name }
            ]}
          />
        </div>

        {/* Header Information - More compact */}
        <div className="mb-4 flex-shrink-0">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div className="flex-1">
              <h1 className="text-xl md:text-2xl font-bold">{cluster.case_name}</h1>
              {cluster.case_name_short && cluster.case_name_short !== cluster.case_name && (
                <h2 className="text-base md:text-lg text-gray-600">{cluster.case_name_short}</h2>
              )}
              <div className="flex flex-wrap gap-3 text-sm text-gray-700 mt-1">
                <div className="text-gray-600">Supreme Court Case</div>
                <div>
                  <span className="font-medium">Date Filed:</span> {cluster.date_filed || 'Not available'}
                </div>
                <div>
                  <span className="font-medium">Opinions:</span> {cluster.opinions?.length || 0} opinion{(cluster.opinions?.length || 0) !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <SaveButton itemId={cluster.id} itemType="cluster" />
            </div>
          </div>
        </div>

        {/* Main Content: Responsive grid with more space for chat */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_500px] lg:grid-cols-[1fr_550px] xl:grid-cols-[1fr_600px] 2xl:grid-cols-[1fr_700px] gap-4 md:gap-6 flex-1 overflow-hidden">
          {/* Left: Tabs for Opinions - full width on mobile */}
          <div className="h-full overflow-hidden flex flex-col md:col-span-1">
            <Tabs defaultValue={sortedOpinions.length > 0 ? sortedOpinions[0].id : ''} className="w-full h-full flex flex-col">
              <TabsList className="mb-3 flex-shrink-0">
                {sortedOpinions.map((opinion, _idx) => (
                  <TabsTrigger key={opinion.id} value={opinion.id}>
                    {mapOpinionType(opinion.type)}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="flex-1 overflow-hidden">
                {sortedOpinions.map((opinion, _idx) => (
                  <TabsContent key={opinion.id} value={opinion.id} className="mt-0 h-full">
                    <Card className="h-full flex flex-col">
                      <CardContent className="p-4 md:p-5 flex-1 flex flex-col overflow-hidden">
                        <div className="mb-3 flex-shrink-0">
                          <div className="mb-1">
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
                          <div className="flex-1 min-h-0">
                            <PdfViewer storagePath={opinion.pdf_file_path} storageBucket="opinions" className="h-full" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-32 text-gray-500 bg-gray-50 rounded-lg">
                            No PDF available for this opinion.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                ))}
                {sortedOpinions.length === 0 && (
                  <TabsContent value="no-opinions" className="h-full">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                      <p className="text-yellow-700">
                        No opinions available for this case.
                      </p>
                    </div>
                  </TabsContent>
                )}
              </div>
            </Tabs>
          </div>
          
          {/* Right: AiChatWrapper - hidden on mobile, shown on desktop */}
          <div className="hidden md:flex h-full flex-col min-h-0">
            <AiChatWrapper
              documentType="opinion"
              documentId={String(cluster.id)}
              documentTitle={cluster.case_name}
              height="100%"
              htmlFilePath={mostRecentHtmlFilePath}
            />
          </div>
        </div>
      </div>

      {/* AiChatWrapper for mobile - renders floating button */}
      <div className="md:hidden">
        <AiChatWrapper
          documentType="opinion"
          documentId={String(cluster.id)}
          documentTitle={cluster.case_name}
          htmlFilePath={mostRecentHtmlFilePath}
        />
      </div>
    </div>
  );
}
