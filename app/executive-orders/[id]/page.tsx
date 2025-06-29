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
import { Button } from '@/components/ui/button';
import { MessageCircle, X } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<TabType>('text');
  const [showMobileChat, setShowMobileChat] = useState(false);
    

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
    <div className="container mx-auto px-4 py-8 relative min-h-screen">
      {/* Breadcrumb and Top Section (Full Width) */}
      <Breadcrumbs
        steps={[
          { label: 'Home', href: '/' },
          { label: 'Executive Orders', href: '/executive-orders' },
          { label: order.title }
        ]}
      />

      {/* Header Information */}
      <div className="mb-8">
        <div className="mb-2 flex justify-between items-center">
          <span className="text-gray-600">Executive Order</span>
          <SaveButton itemId={order.id} itemType="agencyDocument" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">{order.title}</h1>
        <h2 className="text-lg md:text-xl mb-4">Document Number: {order.remote_document_number}</h2>
        
        <div className="mb-6">
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

      {/* Main Content: Two-column responsive layout */}
      <div className="flex flex-col md:flex-row gap-8 min-h-[400px] md:h-[calc(100vh-300px)] md:min-h-0">
        {/* Left: Executive Order Details */}
        <div className="w-full md:w-1/2 h-full flex flex-col min-h-0 overflow-y-auto">
          {/* Tab Navigation (always visible) */}
          <div className="border-b border-gray-200 mb-6 overflow-x-auto shrink-0">
            <nav className="flex space-x-4 md:space-x-8 whitespace-nowrap" aria-label="Tabs">
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
            </nav>
          </div>

          {/* Tab Content (scrollable) */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeTab === 'text' && (
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-6">
                  <h2 className="text-xl font-semibold mb-4">Executive Order Text</h2>
                  <div className="h-[400px] md:h-[600px]">
                    {order.pdf_file_path ? (
                      <PdfViewer storagePath={order.pdf_file_path} storageBucket="agency-docs" className="h-full" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        No PDF available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: AI Chat Panel (desktop) */}
        <div className="w-full md:w-1/2 h-full flex flex-col min-h-0 md:border-l md:pl-8 border-gray-200 overflow-y-auto bg-gray-50 p-2 md:p-3 pb-8 md:pb-12 hidden md:flex">
          <AuthProvider>
            <AiChat
              documentType="executiveOrder"
              documentId={order.id}
              documentTitle={order.title}
              htmlFilePath={order.html_file_path}
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
              <MessageCircle className="h-7 w-7" />
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
                      documentType="executiveOrder"
                      documentId={order.id}
                      documentTitle={order.title}
                      htmlFilePath={order.html_file_path}
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
