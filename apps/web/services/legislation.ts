import { supabase } from '@/utils/supabase/client';
import type { PersonalizedHomepageItem } from '@/types/homepage';
import type { Bill, Law } from '@/types/types';

export async function getPersonalizedLegislation(policyAreas: string[]): Promise<PersonalizedHomepageItem[]> {
  if (!policyAreas.length) return [];

  const { data, error } = await supabase
    .from('bill')
    .select(`
      *,
      sponsor:sponsored_bills!bill_id(congressman:congressman(*)),
      actions:bill_action!bill_id(id, date, text, type)
    `)
    .in('policy_area', policyAreas)
    .order('introduced_date', { ascending: false })
    .limit(6);

  if (error) throw error;

  return (data ?? []).map((item) => {
    const actions = [...(item.actions ?? [])].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    const normalized = {
      ...item,
      sponsor: item.sponsor?.[0]?.congressman
        ? { congressman: item.sponsor[0].congressman }
        : undefined,
      most_recent_action: actions[0] ?? null,
      actions: undefined,
    };

    return item.law_enacted_date
      ? { item_type: 'law', data: normalized as Law }
      : { item_type: 'bill', data: normalized as Bill };
  });
}
