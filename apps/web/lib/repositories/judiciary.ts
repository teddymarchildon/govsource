import 'server-only';

import { cache } from 'react';
import { createClient } from '@/utils/supabase/server';
import type { Cluster, CourtOpinion, Judge } from '@/types/types';

const clusterSelection = `
  *,
  court:court(*),
  opinions:court_opinion!cluster_id(*, author:judge(*), joined_by:judge(*))
`;

export const getJudges = cache(async (): Promise<Judge[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('judge').select('*').order('last_name');
  if (error) throw error;
  return (data ?? []) as Judge[];
});

export type JudgeDetail = {
  judge: Judge;
  opinions: CourtOpinion[];
};

export const getJudgeDetail = cache(async (id: string): Promise<JudgeDetail | null> => {
  const supabase = await createClient();
  const [judgeResult, opinionsResult] = await Promise.all([
    supabase.from('judge').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('court_opinion')
      .select('*, author:judge(*), cluster:cluster(*), joined_by:judge(*)')
      .eq('author_id', id)
      .order('date', { ascending: false })
      .limit(10),
  ]);

  const firstError = [judgeResult.error, opinionsResult.error].find(Boolean);
  if (firstError) throw firstError;
  if (!judgeResult.data) return null;

  return {
    judge: judgeResult.data as Judge,
    opinions: (opinionsResult.data ?? []) as unknown as CourtOpinion[],
  };
});

export const getRecentSupremeCourtCases = cache(async (limit = 50): Promise<Cluster[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cluster')
    .select(clusterSelection)
    .eq('court.remote_id', 'scotus')
    .order('date_filed', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as Cluster[];
});

export type SupremeCourtCaseFilters = {
  search?: string;
  judgeId?: string;
  startDate?: string;
  endDate?: string;
  sortOrder?: 'asc' | 'desc';
};

export async function getSupremeCourtCasesPage(
  filters: SupremeCourtCaseFilters = {},
  page = 1,
  pageSize = 50,
): Promise<Cluster[]> {
  const supabase = await createClient();
  const opinionsJoin = filters.judgeId ? 'court_opinion!inner' : 'court_opinion';
  let query = supabase
    .from('cluster')
    .select(`
      *,
      court:court!inner(*),
      opinions:${opinionsJoin}(*, author:judge(*), joined_by:judge(*))
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

export const getSupremeCourtCase = cache(async (id: string): Promise<Cluster | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cluster')
    .select(clusterSelection)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as Cluster | null;
});
