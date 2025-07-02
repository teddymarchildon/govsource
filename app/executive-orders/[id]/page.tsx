'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import PdfViewer from '@/components/PdfViewer';
import Breadcrumbs from '@/components/Breadcrumbs';
import SaveButton from '@/components/SaveButton';
import AiChatWrapper from '@/components/AiChatWrapper';
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
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="container mx-auto px-4 py-4 flex flex-col flex-1 overflow-hidden">
        {/* Breadcrumbs */}
        <div className="mb-1 flex-shrink-0">
          <Breadcrumbs
            steps={[
              { label: 'Home', href: '/' },
              { label: 'Executive Orders', href: '/executive-orders' },
              { label: order.title }
            ]}
          />
        </div>

        {/* Header Information - More compact */}
        <div className="mb-4 flex-shrink-0">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div className="flex-1">
              <h1 className="text-xl md:text-2xl font-bold">{order.title}</h1>
              <div className="flex flex-wrap gap-3 text-sm text-gray-700 mt-1">
                <div className="text-gray-600">Executive Order</div>
                {order.remote_document_number && (
                  <div>
                    <span className="font-medium">Document Number:</span> {order.remote_document_number}
                  </div>
                )}
                {order.president && (
                  <div>
                    <span className="font-medium">President:</span> {order.president}
                  </div>
                )}
                {order.signing_date && (
                  <div>
                    <span className="font-medium">Signed:</span> {new Date(order.signing_date).toLocaleDateString()}
                  </div>
                )}
                <div>
                  <span className="font-medium">Published:</span> {new Date(order.publication_date).toLocaleDateString()}
                </div>
                {order.agency && (
                  <div>
                    <span className="font-medium">Agency:</span> {order.agency.name}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <SaveButton itemId={order.id} itemType="agencyDocument" />
            </div>
          </div>
        </div>

        {/* Main Content: Responsive grid with more space for chat */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_500px] lg:grid-cols-[1fr_550px] xl:grid-cols-[1fr_600px] 2xl:grid-cols-[1fr_700px] gap-4 md:gap-6 flex-1 overflow-hidden">
          {/* Left: Tabs - full width on mobile */}
          <div className="h-full overflow-hidden flex flex-col md:col-span-1">
            <Tabs defaultValue="text" className="w-full h-full flex flex-col">
              <TabsList className="mb-3 justify-start bg-transparent flex-shrink-0 h-9 p-0">
                <TabsTrigger value="text" className="bg-transparent px-2 py-1 text-sm">Text</TabsTrigger>
              </TabsList>
              <div className="flex-1 overflow-y-auto">
                <TabsContent value="text" className="mt-0">
                  <Card className="overflow-hidden">
                    <CardContent className="p-4 md:p-5">
                      <CardTitle className="mb-3 text-lg">Executive Order Text</CardTitle>
                      <div className="h-[400px] md:h-[500px]">
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
          
          {/* Right: AiChatWrapper - hidden on mobile, shown on desktop */}
          <div className="hidden md:flex h-full flex-col min-h-0">
            <AiChatWrapper
              documentType="executiveOrder"
              documentId={order.id}
              documentTitle={order.title}
              htmlFilePath={order.html_file_path}
              height="100%"
            />
          </div>
        </div>
      </div>

      {/* AiChatWrapper for mobile - renders floating button */}
      <div className="md:hidden">
        <AiChatWrapper
          documentType="executiveOrder"
          documentId={order.id}
          documentTitle={order.title}
          htmlFilePath={order.html_file_path}
        />
      </div>
    </div>
  );
}
