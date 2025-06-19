'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import { getBillActions } from '@/services/api';
import BillOrLawDetail from '@/components/BillOrLawDetail';

export default function LawDetailPage() {
  const params = useParams();
  const router = useRouter();
  const lawId = params.id as string;

  const [law, setLaw] = useState<any>(null);
  const [lawTexts, setLawTexts] = useState<any[]>([]);
  const [sponsors, setSponsors] = useState<any[]>([]);
  const [cosponsors, setCosponsors] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
    
  useEffect(() => {
    const fetchLawDetails = async () => {
      if (!lawId) return;

      setLoading(true);
      try {
        // Fetch law details from the bill table where law_enacted_date is not null
        const { data: lawData, error: lawError } = await supabase
          .from('bill')
          .select('*')
          .eq('id', lawId)
          .not('law_enacted_date', 'is', null)
          .single();

        if (lawError) throw lawError;
        setLaw(lawData);

        // Fetch bill text versions (which are now the law text versions)
        const { data: textData, error: textError } = await supabase
          .from('bill_text')
          .select('*')
          .eq('bill_id', lawId)
          .order('date', { ascending: false });

        if (textError) throw textError;
        setLawTexts(textData || []);

        // Fetch sponsors for this bill
        const { data: sponsorsData, error: sponsorsError } = await supabase
          .from('sponsored_bills')
          .select('congressman:congressman(*)')
          .eq('bill_id', lawId);

        if (sponsorsError) throw sponsorsError;
        setSponsors((sponsorsData || []).map(item => item.congressman));

        // Fetch cosponsors for this bill
        const { data: cosponsorsData, error: cosponsorsError } = await supabase
          .from('cosponsored_bills')
          .select('congressman:congressman(*)')
          .eq('bill_id', lawId);

        if (cosponsorsError) throw cosponsorsError;
        setCosponsors((cosponsorsData || []).map(item => item.congressman));

        // Fetch actions for this bill
        const actionsData = await getBillActions(lawId);
        setActions(actionsData);

      } catch (error) {
        console.error('Error fetching law details:', error);
        // If law not found, redirect to 404 page
        router.push('/404');
      } finally {
        setLoading(false);
      }
    };

    fetchLawDetails();
  }, [lawId, router]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <div className="text-xl">Loading...</div>
        </div>
      </div>
    );
  }

  if (!law) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">Law not found.</p>
        </div>
      </div>
    );
  }

  return (
    <BillOrLawDetail
      item={law}
      texts={lawTexts}
      sponsors={sponsors}
      cosponsors={cosponsors}
      actions={actions}
      isLaw={true}
    />
  );
}
