'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import AgencyRuleDetail from '@/components/AgencyRuleDetail';
import { AgencyDocument } from '@/types/types';

export default function AgencyRuleDetailPage() {
  const { id } = useParams();
  const [rule, setRule] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchRule = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('agency_document')
        .select(`
          id,
          title,
          remote_document_number,
          publication_date,
          abstract,
          pdf_url,
          pdf_file_path,
          html_url,
          html_file_path,
          xml_url,
          xml_file_path,
          type,
          subtype,
          agencies:agency_agencydocument!agency_document_id(
            agency:agency(id, name, short_name)
          )
        `)
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching agency rule:', error);
        setLoading(false);
        return;
      }

      // Transform the data to match our interface
      const transformedData = data ? {
        ...data,
        agency: data.agencies?.[0]?.agency || null
      } : null;

      setRule(transformedData);
      setLoading(false);
    };

    fetchRule();
  }, [id]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading rule details...</p>
        </div>
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
          <p className="text-red-700">Agency rule not found</p>
        </div>
      </div>
    );
  }

  return <AgencyRuleDetail rule={rule as AgencyDocument} />;
}
