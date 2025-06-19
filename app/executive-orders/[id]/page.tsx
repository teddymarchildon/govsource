'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import PdfViewer from '@/components/PdfViewer';
import Breadcrumbs from '@/components/Breadcrumbs';
import SaveButton from '@/components/SaveButton';
import AiChat from '@/components/AiChat';
import { AuthProvider } from '@/contexts/AuthContext';

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
        <div className="text-center">Loading...</div>
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
    <>
      <div className="container mx-auto px-4 py-8">
        <nav className="mb-6 text-sm">
          <Breadcrumbs
            steps={[
              { label: 'Home', href: '/' },
              { label: 'Executive Orders', href: '/executive-orders' },
              { label: order.title }
            ]}
          />
        </nav>

        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">{order.title}</h1>
                <div className="text-sm text-gray-600 mb-2">
                  Document Number: {order.remote_document_number}
                </div>
                {order.president && (
                  <div className="text-sm text-gray-600 mb-2">
                    President: {order.president}
                  </div>
                )}
                {order.signing_date && (
                  <div className="text-sm text-gray-600 mb-2">
                    Signed: {new Date(order.signing_date).toLocaleDateString()}
                  </div>
                )}
                <div className="text-sm text-gray-600 mb-2">
                  Published: {new Date(order.publication_date).toLocaleDateString()}
                </div>
                {order.agency && (
                  <div className="text-sm text-gray-600">
                    Agency: {order.agency.name}
                  </div>
                )}
              </div>
              <SaveButton itemId={order.id} itemType="agencyDocument" />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8" aria-label="Tabs">
          <button
              onClick={() => setActiveTab('text')}
              className={`py-4 px-1 inline-flex items-center border-b-2 ${
                activeTab === 'text'
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Text
            </button>
          </nav>
        </div>

        {/* Tab Content */}

          {activeTab === 'text' && (
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="p-6">
                <div className="h-[600px]">
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
      {/* Floating AI Chat Button */}
      <AuthProvider>
        <AiChat
          documentType="executiveOrder"
          documentId={order.id}
          documentTitle={order.title}
          htmlFilePath={order.html_file_path}
        />
      </AuthProvider>
    </>
  );
}
