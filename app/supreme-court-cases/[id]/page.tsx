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
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

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
      <div className="container mx-auto px-4 py-8 flex flex-col flex-1 overflow-hidden">
        {/* Breadcrumbs */}
        <div className="mb-2 flex-shrink-0">
          <Breadcrumbs
            steps={[
              { label: 'Home', href: '/' },
              { label: 'Supreme Court Cases', href: '/supreme-court-cases' },
              { label: cluster.case_name }
            ]}
          />
        </div>

        {/* Header Information */}
        <div className="mb-6 flex-shrink-0">
          <div className="mb-2 flex justify-between items-center">
            <span className="text-gray-600">Supreme Court Case</span>
            <SaveButton itemId={cluster.id} itemType="cluster" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">{cluster.case_name}</h1>
          {cluster.case_name_short && cluster.case_name_short !== cluster.case_name && (
            <h2 className="text-lg md:text-xl mb-4 text-gray-600">{cluster.case_name_short}</h2>
          )}
          
          <div>
            <div className="text-sm mb-1">
              <span className="font-medium">Date Filed:</span> {cluster.date_filed || 'Not available'}
            </div>
            <div className="text-sm">
              <span className="font-medium">Opinions:</span> {cluster.opinions?.length || 0} opinion{(cluster.opinions?.length || 0) !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Main Content: 2-column grid with fixed height */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_400px] gap-8 flex-1 overflow-hidden">
          {/* Left: Tabs for Opinions */}
          <div className="h-full overflow-hidden flex flex-col">
            <Tabs defaultValue={sortedOpinions.length > 0 ? sortedOpinions[0].id : ''} className="w-full h-full flex flex-col">
              <TabsList className="mb-4 justify-start bg-transparent flex-shrink-0">
                {sortedOpinions.map((opinion, idx) => (
                  <TabsTrigger key={opinion.id} value={opinion.id} className="bg-transparent">
                    {mapOpinionType(opinion.type)}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="flex-1 overflow-y-auto">
                {sortedOpinions.map((opinion, idx) => (
                  <TabsContent key={opinion.id} value={opinion.id}>
                    <Card className="overflow-hidden">
                      <CardContent className="p-6">
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
                      </CardContent>
                    </Card>
                  </TabsContent>
                ))}
                {sortedOpinions.length === 0 && (
                  <TabsContent value="no-opinions">
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
          {/* Right: AiChat Panel */}
          <div className="h-full flex flex-col min-h-0">
            <AiChat
              documentType="opinion"
              documentId={String(cluster.id)}
              documentTitle={cluster.case_name}
              height="100%"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
