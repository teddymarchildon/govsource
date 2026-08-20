'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import PublicHome from '@/components/home/PublicHome';
import { useAuth } from '@/contexts/AuthContext';
import { getUserPreferences } from '@/services/api';
import { getPersonalizedLegislation } from '@/services/legislation';
import type { HomepagePublicData, PersonalizedHomepageItem } from '@/types/homepage';
import type { UserPreferences } from '@/types/types';
import { getLoginUrl } from '@/utils/utils';

export default function HomeClient({
  briefs,
  bills,
  popularItems,
  recentExecutiveOrders,
}: HomepagePublicData) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [personalizedItems, setPersonalizedItems] = useState<PersonalizedHomepageItem[]>([]);
  const [personalizedLoading, setPersonalizedLoading] = useState(false);

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
        setPersonalizedItems(
          preferences?.policy_areas?.length
            ? await getPersonalizedLegislation(preferences.policy_areas)
            : [],
        );
      } catch (error) {
        console.error('Error loading personalized homepage items', error);
        setPersonalizedItems([]);
      } finally {
        setPersonalizedLoading(false);
      }
    };

    loadPersonalizedItems();
  }, [user]);

  return (
    <PublicHome
      briefs={briefs}
      briefsLoading={false}
      bills={bills}
      billsLoading={false}
      isSignedIn={Boolean(user)}
      loginUrl={getLoginUrl(pathname)}
      personalizedItems={personalizedItems}
      personalizedLoading={personalizedLoading}
      policyAreas={userPreferences?.policy_areas ?? []}
      popularItems={popularItems}
      popularLoading={false}
      recentExecutiveOrders={recentExecutiveOrders}
    />
  );
}
