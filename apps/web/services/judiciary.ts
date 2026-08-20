import { supabase } from '@/utils/supabase/client';
import type { Cluster } from '@/types/types';
import type { SupremeCourtCaseFilters } from '@/lib/repositories/judiciary';

export async function getSupremeCourtCasesPage(
  filters: SupremeCourtCaseFilters = {},
  page = 1,
  pageSize = 50,
): Promise<Cluster[]> {
  const opinionsJoin = filters.judgeId ? 'court_opinion!inner' : 'court_opinion';
  let query = supabase
    .from('cluster')
    .select(`
      *,
      court:court!inner(*),
      opinions:${opinionsJoin}(*, author:judge(*))
    `)
    .eq('court.remote_id', 'scotus');

  if (filters.judgeId) query = query.eq('opinions.author_id', filters.judgeId);
  if (filters.search) {
    query = query.or(`case_name.ilike.%${filters.search}%,case_name_short.ilike.%${filters.search}%`);
  }
  if (filters.startDate) query = query.gte('date_filed', filters.startDate);
  if (filters.endDate) query = query.lte('date_filed', filters.endDate);

  const from = (page - 1) * pageSize;
  const { data, error } = await query
    .order('date_filed', { ascending: filters.sortOrder === 'asc' })
    .range(from, from + pageSize - 1);

  if (error) throw error;
  return (data ?? []) as unknown as Cluster[];
}
