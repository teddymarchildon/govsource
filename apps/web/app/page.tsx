'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import PublicHome, {
  type PersonalizedHomepageItem,
  type PopularHomepageItem,
} from '@/components/home/PublicHome';
import { useAuth } from '@/contexts/AuthContext';
import { getAgencyRules, getBills, getUserPreferences } from '@/services/api';
import type { Article } from '@/types/article';
import type { AgencyDocument, Bill, Law, UserPreferences } from '@/types/types';
import { getLoginUrl } from '@/utils/utils';
import { supabase } from '@/utils/supabase/client';

export default function HomePage() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [bills, setBills] = useState<Bill[]>([]);
  const [billsLoading, setBillsLoading] = useState(true);
  const [popularItems, setPopularItems] = useState<PopularHomepageItem[]>([]);
  const [popularLoading, setPopularLoading] = useState(true);
  const [recentExecutiveOrders, setRecentExecutiveOrders] = useState<AgencyDocument[]>([]);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [personalizedItems, setPersonalizedItems] = useState<PersonalizedHomepageItem[]>([]);
  const [personalizedLoading, setPersonalizedLoading] = useState(false);

  useEffect(() => {
    const loadPublicHomepage = async () => {
      setArticlesLoading(true);
      setBillsLoading(true);

      const [articleResult, billResult, orderResult] = await Promise.allSettled([
        fetch('/api/articles?limit=24', { cache: 'no-store' }).then(async (response) => {
          if (!response.ok) throw new Error('Unable to load published briefings');
          return response.json() as Promise<{ articles: Article[] }>;
        }),
        getBills({ limit: 12 }),
        getAgencyRules({ subtype: 'Executive Order', limit: 6, sort_order: 'desc' }),
      ]);

      if (articleResult.status === 'fulfilled') setArticles(articleResult.value.articles ?? []);
      if (billResult.status === 'fulfilled') setBills(billResult.value);
      if (orderResult.status === 'fulfilled') setRecentExecutiveOrders(orderResult.value);

      setArticlesLoading(false);
      setBillsLoading(false);
    };

    loadPublicHomepage();
  }, []);

  useEffect(() => {
    const loadPersonalizedItems = async () => {
      if (!user) {
        setUserPreferences(null);
        setPersonalizedItems([]);
        setPersonalizedLoading(false);
        return;
      }

      setPersonalizedLoading(true);
      try {
        const preferences = await getUserPreferences(user.id);
        setUserPreferences(preferences);

        if (!preferences?.policy_areas?.length) {
          setPersonalizedItems([]);
          return;
        }

        const { data, error } = await supabase
          .from('bill')
          .select(`
            *,
            sponsor:sponsored_bills!bill_id(congressman:congressman(*)),
            actions:bill_action!bill_id(id, date, text, type)
          `)
          .in('policy_area', preferences.policy_areas)
          .order('introduced_date', { ascending: false })
          .limit(6);

        if (error) throw error;

        const items = (data ?? []).map((item) => {
          const actions = item.actions
            ? [...item.actions].sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
              )
            : [];
          const normalized = {
            ...item,
            sponsor: item.sponsor?.[0]?.congressman
              ? { congressman: item.sponsor[0].congressman }
              : undefined,
            most_recent_action: actions[0] ?? null,
            actions: undefined,
          };

          return item.law_enacted_date
            ? ({ item_type: 'law', data: normalized as Law } as const)
            : ({ item_type: 'bill', data: normalized as Bill } as const);
        });

        setPersonalizedItems(items);
      } catch (error) {
        console.error('Error loading personalized homepage items', error);
        setPersonalizedItems([]);
      } finally {
        setPersonalizedLoading(false);
      }
    };

    loadPersonalizedItems();
  }, [user]);

  useEffect(() => {
    const loadPopularItems = async () => {
      setPopularLoading(true);
      try {
        const now = new Date().toISOString();
        const { data: ranked, error: rankedError } = await supabase
          .from('ranked_item')
          .select('*')
          .is('ranking_ended_at', null)
          .or(`effectively_ranked_at.is.null,effectively_ranked_at.lte.${now}`)
          .order('rank', { ascending: true })
          .limit(24);

        if (rankedError) throw rankedError;
        if (!ranked?.length) {
          setPopularItems([]);
          return;
        }

        const itemsWithData = await Promise.all(
          ranked.map(async (item): Promise<PopularHomepageItem | null> => {
            if (item.item_type === 'bill' || item.item_type === 'law') {
              let query = supabase
                .from('bill')
                .select(`*, sponsor:sponsored_bills!bill_id(congressman:congressman(*)), actions:bill_action!bill_id(id, date, text, type)`)
                .eq('id', item.item_id);
              if (item.item_type === 'law') query = query.not('law_enacted_date', 'is', null);
              const { data, error } = await query.single();
              if (error || !data) return null;
              const actions = data.actions
                ? [...data.actions].sort(
                    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
                  )
                : [];
              const normalized = {
                ...data,
                sponsor: data.sponsor?.[0]?.congressman
                  ? { congressman: data.sponsor[0].congressman }
                  : undefined,
                most_recent_action: actions[0] ?? null,
                actions: undefined,
              };
              return item.item_type === 'law'
                ? { item_type: 'law', data: normalized as Law }
                : { item_type: 'bill', data: normalized as Bill };
            }

            if (
              item.item_type === 'agency_document' ||
              item.item_type === 'executive_order'
            ) {
              let query = supabase
                .from('agency_document')
                .select(`*, agency_link:agency_agencydocument!agency_document_id(agency:agency(*))`)
                .eq('id', item.item_id);
              if (item.item_type === 'executive_order') {
                query = query.eq('subtype', 'Executive Order');
              }
              const { data, error } = await query.single();
              if (error || !data) return null;
              const agency = data.agency_link?.[0]?.agency;
              return {
                item_type:
                  data.subtype === 'Executive Order' ? 'executive_order' : 'agency_document',
                data: { ...data, agency } as AgencyDocument,
              };
            }

            if (item.item_type === 'cluster') {
              const { data, error } = await supabase
                .from('cluster')
                .select(`*, court:court(*), opinions:court_opinion!cluster_id(*, author:judge(*))`)
                .eq('id', item.item_id)
                .single();
              if (error || !data) return null;
              return { item_type: 'cluster', data };
            }

            return null;
          }),
        );

        setPopularItems(
          itemsWithData
            .filter((item): item is PopularHomepageItem => item !== null)
            .slice(0, 8),
        );
      } catch (error) {
        console.error('Error loading popular homepage items', error);
        setPopularItems([]);
      } finally {
        setPopularLoading(false);
      }
    };

    loadPopularItems();
  }, []);

  return (
    <PublicHome
      articles={articles}
      articlesLoading={articlesLoading}
      bills={bills}
      billsLoading={billsLoading}
      isSignedIn={Boolean(user)}
      loginUrl={getLoginUrl(pathname)}
      personalizedItems={personalizedItems}
      personalizedLoading={personalizedLoading}
      policyAreas={userPreferences?.policy_areas ?? []}
      popularItems={popularItems}
      popularLoading={popularLoading}
      recentExecutiveOrders={recentExecutiveOrders}
    />
  );
}
