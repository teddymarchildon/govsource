export type ContributionFilters = {
  contributor?: string;
  reportedGroup?: string;
  committee?: string;
  employer?: string;
  occupation?: string;
  from?: string;
  to?: string;
  min?: string;
  max?: string;
};

export type ContributionQuery = ContributionFilters & {
  tab?: string; cycle?: string; contributionPage?: string; contributionKind?: string;
};

export function normalizeContributionFilters(input: ContributionFilters = {}): ContributionFilters {
  const result: ContributionFilters = {};
  for (const key of ['contributor', 'reportedGroup', 'employer', 'occupation'] as const) {
    const value = typeof input[key] === 'string' ? input[key].trim().slice(0, 200) : undefined;
    if (value) result[key] = value;
  }
  if (input.committee && /^C\d{8}$/.test(input.committee)) result.committee = input.committee;
  for (const key of ['from', 'to'] as const) {
    const value = typeof input[key] === 'string' ? input[key] : undefined;
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value) result[key] = value;
  }
  for (const key of ['min', 'max'] as const) {
    const value = typeof input[key] === 'string' ? input[key] : undefined;
    if (value && /^-?\d{1,12}(\.\d{1,2})?$/.test(value)) result[key] = value;
  }
  return result;
}

type Filterable = {
  ilike: (column: string, value: string) => unknown;
  eq: (column: string, value: string) => unknown;
  is: (column: string, value: null) => unknown;
  gte: (column: string, value: string) => unknown;
  lte: (column: string, value: string) => unknown;
};

export function applyContributionFilters(query: Filterable, input: ContributionFilters, individuals = false): void {
  const filters = normalizeContributionFilters(input);
  if (filters.contributor) query.ilike('contributor_name', `%${filters.contributor.replace(/[\\%_]/g, '\\$&')}%`);
  if (!individuals && filters.reportedGroup) { query.eq('contributor_name', filters.reportedGroup); query.is('giving_committee_id', null); }
  if (!individuals && filters.committee) query.eq('giving_committee_id', filters.committee);
  if (individuals && filters.employer) query.eq('employer_normalized', filters.employer.toUpperCase().replace(/\s+/g, ' '));
  if (individuals && filters.occupation) query.eq('occupation_normalized', filters.occupation.toUpperCase().replace(/\s+/g, ' '));
  if (filters.from) query.gte('receipt_date', filters.from);
  if (filters.to) query.lte('receipt_date', filters.to);
  if (filters.min) query.gte('amount', filters.min);
  if (filters.max) query.lte('amount', filters.max);

}

export function contributionHref(kind: 'overview' | 'committees' | 'individuals', cycle?: number | null, filters: ContributionFilters = {}, page = 1) {
  const params = new URLSearchParams({ tab: 'contributions', contributionKind: kind });
  if (cycle) params.set('cycle', String(cycle));
  for (const [key, value] of Object.entries(normalizeContributionFilters(filters))) params.set(key, value);
  if (page > 1) params.set('contributionPage', String(page));
  return `?${params}`;
}
