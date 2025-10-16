'use server'

import Link from 'next/link';
import AdminRecentActivity, { AdminActivityItem } from './AdminRecentActivity';
import { createClient } from '@/utils/supabase/server';

const DEFAULT_LIMIT = 25;

async function fetchRecentBills(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from('bill')
    .select(
      'id, title, type, number, congress, updated_at, created_at, law_enacted_date, law_title, law_number, law_type, law_unique_id'
    )
    .is('law_enacted_date', null)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) {
    console.error('[admin] Failed to fetch recent bills', error);
    return [] as AdminActivityItem[];
  }

  return (
    data?.map((bill) => {
      const labels: string[] = [];
      if (bill.type && bill.number) {
        labels.push(`${bill.type.toUpperCase()} ${bill.number}`);
      } else if (bill.type) {
        labels.push(bill.type.toUpperCase());
      } else if (bill.number) {
        labels.push(String(bill.number));
      }
      if (bill.congress) {
        labels.push(`Congress ${bill.congress}`);
      }

      return {
        id: String(bill.id),
        category: 'Bill' as const,
        title: bill.title || `Bill ${bill.type?.toUpperCase() ?? ''} ${bill.number ?? ''}`.trim(),
        updatedAt: bill.updated_at || bill.created_at,
        createdAt: bill.created_at,
        metadata: labels.join(' • '),
        href: `/bills/${bill.id}`,
      };
    }) ?? []
  );
}

async function fetchRecentLaws(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from('bill')
    .select(
      'id, title, type, number, congress, updated_at, created_at, law_enacted_date, law_title, law_number, law_type'
    )
    .not('law_enacted_date', 'is', null)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) {
    console.error('[admin] Failed to fetch recent laws', error);
    return [] as AdminActivityItem[];
  }

  return (
    data?.map((law) => {
      const labels: string[] = [];
      if (law.law_number) {
        labels.push(String(law.law_number));
      }
      if (law.type) {
        labels.push(law.type.toUpperCase());
      }
      if (law.congress) {
        labels.push(`Congress ${law.congress}`);
      }

      return {
        id: String(law.id),
        category: 'Law' as const,
        title: law.law_title || law.title || `Law ${law.law_number ?? ''}`.trim(),
        updatedAt: law.updated_at || law.created_at,
        createdAt: law.created_at,
        metadata: labels.join(' • '),
        href: `/laws/${law.id}`,
      };
    }) ?? []
  );
}

async function fetchRecentExecutiveOrders(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from('agency_document')
    .select(
      'id, title, updated_at, created_at, remote_document_number, signing_date, president, subtype'
    )
    .eq('subtype', 'Executive Order')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) {
    console.error('[admin] Failed to fetch recent executive orders', error);
    return [] as AdminActivityItem[];
  }

  return (
    data?.map((order) => {
      const labels: string[] = [];
      if (order.remote_document_number) {
        labels.push(`#${order.remote_document_number}`);
      }
      if (order.president) {
        labels.push(order.president);
      }
      if (order.signing_date) {
        labels.push(`Signed ${order.signing_date}`);
      }

      return {
        id: String(order.id),
        category: 'Executive Order' as const,
        title: order.title || `Executive Order ${order.remote_document_number ?? ''}`.trim(),
        updatedAt: order.updated_at || order.created_at,
        createdAt: order.created_at,
        metadata: labels.join(' • '),
        href: `/executive-orders/${order.id}`,
      };
    }) ?? []
  );
}

async function fetchRecentClusters(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from('cluster')
    .select('id, case_name, case_name_short, updated_at, created_at, slug, date_filed')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) {
    console.error('[admin] Failed to fetch recent clusters', error);
    return [] as AdminActivityItem[];
  }

  return (
    data?.map((cluster) => {
      const labels: string[] = [];
      if (cluster.slug) {
        labels.push(cluster.slug);
      }
      if (cluster.date_filed) {
        labels.push(`Filed ${cluster.date_filed}`);
      }

      return {
        id: String(cluster.id),
        category: 'Supreme Court Case' as const,
        title: cluster.case_name || cluster.case_name_short || `Case ${cluster.slug ?? cluster.id}`,
        updatedAt: cluster.updated_at || cluster.created_at,
        createdAt: cluster.created_at,
        metadata: labels.join(' • '),
        href: `/supreme-court-cases/${cluster.id}`,
      };
    }) ?? []
  );
}

async function fetchAdminActivity() {
  const supabase = await createClient();

  const [bills, laws, executiveOrders, clusters] = await Promise.all([
    fetchRecentBills(supabase),
    fetchRecentLaws(supabase),
    fetchRecentExecutiveOrders(supabase),
    fetchRecentClusters(supabase),
  ]);

  return [...bills, ...laws, ...executiveOrders, ...clusters]
    .filter((item) => item.updatedAt || item.createdAt)
    .sort((a, b) => {
      const aDate = new Date(a.updatedAt ?? a.createdAt).getTime();
      const bDate = new Date(b.updatedAt ?? b.createdAt).getTime();
      return bDate - aDate;
    });
}

export default async function AdminPage() {
  const items = await fetchAdminActivity();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Admin Activity</h1>
          <p className="text-gray-600 mt-2">
            Review the most recently updated bills, enacted laws, executive orders, and Supreme Court cases.
          </p>
        </div>
        <Link
          href="/admin/articles"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Manage Articles
        </Link>
      </div>
      <AdminRecentActivity items={items} />
    </div>
  );
}
