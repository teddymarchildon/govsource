'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import PdfViewer from '@/components/PdfViewer';
import Breadcrumbs from '@/components/Breadcrumbs';
import SaveButton from '@/components/SaveButton';
import AiChat from '@/components/AiChat';
import { AuthProvider } from '@/contexts/AuthContext';
import LoadingIndicator from '@/components/ui/LoadingIndicator';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface ExecutiveOrder {
  id: string;
  title: string;
  remote_document_number: string;
  publication_date: string;
  signing_date?: string;
  abstract: string;
  pdf_url: string;
  pdf_file_path?: string;
  html_file_path?: string;
  president?: string;
  agency: {
    id: string;
    name: string;
  } | null;
}

type TabType = 'text';

export default function ExecutiveOrderDetailPage() {
  const params = useParams()
  const executiveOrderId = params.id
  const [order, setOrder] = useState<ExecutiveOrder | null>(null);
  const [loading, setLoading] = useState(true);
    

  useEffect(() => {
    const fetchOrder = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('agency_document')
        .select(`
          id,
          title,
          remote_document_number,
          publication_date,
          signing_date,
          abstract,
          pdf_url,
          pdf_file_path,
          html_file_path,
          president,
          agency:agency_agencydocument!agency_document_id(
            agency:agency(id, name)
          )
        `)
        .eq('id', executiveOrderId)
        .eq('subtype', 'Executive Order')
        .single();

      if (error) {
        console.error('Error fetching executive order:', error);
        return;
      }

      // Transform the data to match our interface
      const transformedData = data ? {
        ...data,
        agency: data.agency?.[0]?.agency || null
      } : null;

      setOrder(transformedData as ExecutiveOrder | null);
      setLoading(false);
    };

    fetchOrder();
  }, [executiveOrderId]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingIndicator size="large" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-gray-500">Executive order not found</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 flex flex-col min-h-screen">
      {/* Breadcrumb and Top Section (Full Width) */}
      <Breadcrumbs
        steps={[
          { label: 'Home', href: '/' },
          { label: 'Executive Orders', href: '/executive-orders' },
          { label: order.title }
        ]}
      />

      {/* Header Information */}
      <div className="mb-6">
        <div className="mb-2 flex justify-between items-center">
          <span className="text-gray-600">Executive Order</span>
          <SaveButton itemId={order.id} itemType="agencyDocument" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">{order.title}</h1>        
        <div className="mb-6">
          {order.remote_document_number && (
            <div className="text-sm mb-1">
              <span className="font-medium">Document Number:</span> {order.remote_document_number}
            </div>
          )}
          {order.president && (
            <div className="text-sm mb-1">
              <span className="font-medium">President:</span> {order.president}
            </div>
          )}
          {order.signing_date && (
            <div className="text-sm mb-1">
              <span className="font-medium">Signed:</span> {new Date(order.signing_date).toLocaleDateString()}
            </div>
          )}
          <div className="text-sm mb-1">
            <span className="font-medium">Published:</span> {new Date(order.publication_date).toLocaleDateString()}
          </div>
          {order.agency && (
            <div className="text-sm">
              <span className="font-medium">Agency:</span> {order.agency.name}
            </div>
          )}
        </div>
      </div>

      {/* Main Content: 2-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_400px] gap-8 flex-1">
        {/* Left: Tabs */}
        <div className="h-full overflow-hidden flex flex-col">
          <Tabs defaultValue="text" className="w-full h-full flex flex-col flex-1">
            <TabsList className="mb-4 justify-start bg-transparent">
              <TabsTrigger value="text" className="bg-transparent">Text</TabsTrigger>
            </TabsList>
            <div className="flex-1 overflow-y-auto">
              <TabsContent value="text">
                <Card className="overflow-hidden">
                  <CardContent className="p-6">
                    <CardTitle className="mb-4">Executive Order Text</CardTitle>
                    <div className="h-[400px] md:h-[600px]">
                      {order.pdf_file_path ? (
                        <PdfViewer storagePath={order.pdf_file_path} storageBucket="agency-docs" className="h-full" />
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
                  documentType="executiveOrder"
                  documentId={order.id}
                  documentTitle={order.title}
                  htmlFilePath={order.html_file_path}
                />
              </AuthProvider>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
