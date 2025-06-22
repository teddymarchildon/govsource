'use client';

import { useEffect, useState } from 'react';
import { getBillById, getBillTexts, getBillSponsors, getBillCosponsors, getBillActions, getBillSummary } from '../../../services/api';
import BillOrLawDetail from '@/components/BillOrLawDetail';
import { useParams } from 'next/navigation';
import LoadingIndicator from '@/components/ui/LoadingIndicator';

export default function BillDetailPage() {
  const params = useParams();
  const billId = params.id as string;
  const [bill, setBill] = useState<any>(null);
  const [texts, setTexts] = useState<any[]>([]);
  const [sponsors, setSponsors] = useState<any[]>([]);
  const [cosponsors, setCosponsors] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const billData = await getBillById(billId);
        const textsData = await getBillTexts(billId);
        const sponsorsData = await getBillSponsors(billId);
        const cosponsorsData = await getBillCosponsors(billId);
        const actionsData = await getBillActions(billId);
        const summaryData = await getBillSummary(billId);

        setBill(billData);
        setTexts(textsData);
        setSponsors(sponsorsData);
        setCosponsors(cosponsorsData);
        setActions(actionsData);
        setSummary(summaryData);
      } catch (error) {
        console.error('Error fetching bill data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [billId]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <LoadingIndicator size="large" />
        </div>
      </div>
    );
  }

  if (!bill) {
    return <div>Bill not found</div>;
  }

  return (
    <BillOrLawDetail
      item={bill}
      texts={texts}
      sponsors={sponsors}
      cosponsors={cosponsors}
      actions={actions}
      summary={summary}
      isLaw={false}
    />
  );
}
