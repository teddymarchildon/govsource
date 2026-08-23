import type { PolicyArea } from '../types/types';

// Color identifies the broad policy category; the badge label identifies the
// specific policy area. Keeping the palette categorical avoids relying on
// subtly different pastel shades to distinguish dozens of policy areas.
const POLICY_CATEGORY_COLORS = {
  nature: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800',
  government: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700',
  finance: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800',
  social: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800',
  international: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800',
  culture: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
  infrastructure: 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-200 dark:border-cyan-800',
  other: 'bg-neutral-100 text-neutral-800 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700',
} as const;

export const POLICY_AREA_COLORS: Record<PolicyArea, string> = {
  // Nature & Environment
  'Agriculture and Food': POLICY_CATEGORY_COLORS.nature,
  'Animals': POLICY_CATEGORY_COLORS.nature,
  'Environmental Protection': POLICY_CATEGORY_COLORS.nature,
  'Public Lands and Natural Resources': POLICY_CATEGORY_COLORS.nature,
  'Water Resources Development': POLICY_CATEGORY_COLORS.nature,
  'Energy': POLICY_CATEGORY_COLORS.nature,

  // Government & Law
  'Armed Forces and National Security': POLICY_CATEGORY_COLORS.government,
  'Congress': POLICY_CATEGORY_COLORS.government,
  'Crime and Law Enforcement': POLICY_CATEGORY_COLORS.government,
  'Government Operations and Politics': POLICY_CATEGORY_COLORS.government,
  'Law': POLICY_CATEGORY_COLORS.government,

  // Finance & Economy
  'Commerce': POLICY_CATEGORY_COLORS.finance,
  'Economics and Public Finance': POLICY_CATEGORY_COLORS.finance,
  'Finance and Financial Sector': POLICY_CATEGORY_COLORS.finance,
  'Foreign Trade and International Finance': POLICY_CATEGORY_COLORS.finance,
  'Taxation': POLICY_CATEGORY_COLORS.finance,

  // Social & Human
  'Civil Rights and Liberties, Minority Issues': POLICY_CATEGORY_COLORS.social,
  'Education': POLICY_CATEGORY_COLORS.social,
  'Families': POLICY_CATEGORY_COLORS.social,
  'Health': POLICY_CATEGORY_COLORS.social,
  'Housing and Community Development': POLICY_CATEGORY_COLORS.social,
  'Immigration': POLICY_CATEGORY_COLORS.social,
  'Labor and Employment': POLICY_CATEGORY_COLORS.social,
  'Native Americans': POLICY_CATEGORY_COLORS.social,
  'Social Welfare': POLICY_CATEGORY_COLORS.social,

  // International
  'International Affairs': POLICY_CATEGORY_COLORS.international,

  // Culture & Recreation
  'Arts, Culture, Religion': POLICY_CATEGORY_COLORS.culture,
  'Commemorations': POLICY_CATEGORY_COLORS.culture,
  'Social Sciences and History': POLICY_CATEGORY_COLORS.culture,
  'Sports and Recreation': POLICY_CATEGORY_COLORS.culture,

  // Infrastructure & Tech
  'Emergency Management': POLICY_CATEGORY_COLORS.infrastructure,
  'Science, Technology, Communications': POLICY_CATEGORY_COLORS.infrastructure,
  'Transportation and Public Works': POLICY_CATEGORY_COLORS.infrastructure,

  // Other
  'Private Legislation': POLICY_CATEGORY_COLORS.other,
};

const DEFAULT_POLICY_AREA_COLORS = POLICY_CATEGORY_COLORS.other;
const normalizePolicyArea = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '')
    .toLowerCase();

const NORMALIZED_POLICY_AREA_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(POLICY_AREA_COLORS).map(([policyArea, colors]) => [
    normalizePolicyArea(policyArea),
    colors,
  ]),
);

export function hasPolicyAreaColor(policyArea: string): policyArea is PolicyArea {
  return Object.prototype.hasOwnProperty.call(POLICY_AREA_COLORS, policyArea);
}

// Returns Tailwind classes for policy-area badges.
export function getPolicyAreaColors(policyArea: PolicyArea | string): string {
  if (hasPolicyAreaColor(policyArea)) {
    return POLICY_AREA_COLORS[policyArea];
  }

  const normalized = normalizePolicyArea(policyArea);
  return NORMALIZED_POLICY_AREA_COLORS[normalized] ?? DEFAULT_POLICY_AREA_COLORS;
}

