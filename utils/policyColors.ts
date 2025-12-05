import type { PolicyArea } from '../types/types';

// Color scheme for each policy area - returns Tailwind classes for bg and text
export function getPolicyAreaColors(policyArea: PolicyArea | string): string {
  const colorMap: Record<string, string> = {
    // Nature & Environment
    'Agriculture and Food': 'bg-lime-100 text-lime-800 border-lime-200',
    'Animals': 'bg-amber-100 text-amber-800 border-amber-200',
    'Environmental Protection': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'Public Lands and Natural Resources': 'bg-green-100 text-green-800 border-green-200',
    'Water Resources Development': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'Energy': 'bg-yellow-100 text-yellow-800 border-yellow-200',

    // Government & Law
    'Armed Forces and National Security': 'bg-slate-100 text-slate-800 border-slate-200',
    'Congress': 'bg-indigo-100 text-indigo-800 border-indigo-200',
    'Crime and Law Enforcement': 'bg-red-100 text-red-800 border-red-200',
    'Government Operations and Politics': 'bg-purple-100 text-purple-800 border-purple-200',
    'Law': 'bg-stone-100 text-stone-800 border-stone-200',

    // Finance & Economy
    'Commerce': 'bg-teal-100 text-teal-800 border-teal-200',
    'Economics and Public Finance': 'bg-blue-100 text-blue-800 border-blue-200',
    'Finance and Financial Sector': 'bg-sky-100 text-sky-800 border-sky-200',
    'Foreign Trade and International Finance': 'bg-violet-100 text-violet-800 border-violet-200',
    'Taxation': 'bg-emerald-100 text-emerald-800 border-emerald-200',

    // Social & Human
    'Civil Rights and Liberties, Minority Issues': 'bg-rose-100 text-rose-800 border-rose-200',
    'Education': 'bg-blue-100 text-blue-800 border-blue-200',
    'Families': 'bg-pink-100 text-pink-800 border-pink-200',
    'Health': 'bg-red-100 text-red-800 border-red-200',
    'Housing and Community Development': 'bg-orange-100 text-orange-800 border-orange-200',
    'Immigration': 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
    'Labor and Employment': 'bg-amber-100 text-amber-800 border-amber-200',
    'Native Americans': 'bg-orange-100 text-orange-800 border-orange-200',
    'Social Welfare': 'bg-rose-100 text-rose-800 border-rose-200',

    // International
    'International Affairs': 'bg-indigo-100 text-indigo-800 border-indigo-200',

    // Culture & Recreation
    'Arts, Culture, Religion': 'bg-violet-100 text-violet-800 border-violet-200',
    'Commemorations': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'Social Sciences and History': 'bg-amber-100 text-amber-800 border-amber-200',
    'Sports and Recreation': 'bg-lime-100 text-lime-800 border-lime-200',

    // Infrastructure & Tech
    'Emergency Management': 'bg-orange-100 text-orange-800 border-orange-200',
    'Science, Technology, Communications': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'Transportation and Public Works': 'bg-zinc-100 text-zinc-800 border-zinc-200',

    // Other
    'Private Legislation': 'bg-neutral-100 text-neutral-800 border-neutral-200',
  };

  return colorMap[policyArea] || 'bg-gray-100 text-gray-800 border-gray-200';
}

