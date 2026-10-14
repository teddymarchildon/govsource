import type { MemberContributions } from './repositories/contributions';
import type { IndividualContributions } from './repositories/individualContributions';

export type ContributionVerification = { checkedAt: string; coverageStart: string; coverageEnd: string; sources: { id: string; label: string; url: string }[] };
const cents = (n: number) => {
  const value = Math.round(n * 100);
  if (!Number.isFinite(n) || !Number.isSafeInteger(value)) throw new Error('Invalid contribution amount.');
  return value;
};

// Fail closed on upstream layout changes, missing fields and ambiguous periods.
export function parseFecSummary(html: string, cycle: number) {
  const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
  const start = text.indexOf('Coverage dates:');
  const end = text.indexOf('Total spent', start);
  if (start < 0 || end < 0) throw new Error('FEC financial summary unavailable.');
  const summary = text.slice(start, end);
  const dates = summary.match(/Coverage dates:\s*(\d{2})\/(\d{2})\/(\d{4})\s+to\s+(\d{2})\/(\d{2})\/(\d{4})/);
  if (!dates) throw new Error('FEC coverage dates unavailable.');
  const from = `${dates[3]}-${dates[1]}-${dates[2]}`, to = `${dates[6]}-${dates[4]}-${dates[5]}`;
  if (from !== `${cycle - 1}-01-01` || to < from || to > `${cycle}-12-31` || Number.isNaN(Date.parse(to))) throw new Error('FEC summary has an unexpected reporting period.');
  const amount = (label: string) => {
    const matches = [...summary.matchAll(new RegExp(`${label}\\s+\\$([\\d,]+\\.\\d{2})(?!\\d)`, 'g'))];
    if (matches.length !== 1) throw new Error(`FEC summary field unavailable: ${label}.`);
    return cents(Number(matches[0][1].replace(/,/g, '')));
  };
  return { from, to, committeeCents: amount('Party committee contributions') + amount('Other committee contributions'), individualCents: amount('Itemized individual contributions') };
}

export async function verifyContributionFigures(committees: MemberContributions, individuals: IndividualContributions, now = new Date(), fetcher = fetch): Promise<ContributionVerification> {
  const cycle = committees.cycle;
  const ids = [...new Set(committees.committeeIds)].sort();
  if (!cycle || individuals.cycle !== cycle || !committees.linked || !individuals.linked || !committees.nationwide
    || committees.excludedCommittees || individuals.excludedCommittees || !ids.length
    || individuals.coveredCommittees !== individuals.eligibleCommittees
    || JSON.stringify(ids) !== JSON.stringify([...new Set(individuals.committeeIds)].sort())) throw new Error('Contribution coverage is incomplete or ambiguous.');
  for (const value of [committees.refreshedAt, individuals.refreshedAt]) {
    const age = now.getTime() - Date.parse(value ?? '');
    if (!Number.isFinite(age) || age < 0 || age > 8 * 86400000) throw new Error('Contribution imports are stale; refresh before drafting or publishing.');
  }
  let committeeCents = 0, individualCents = 0;
  const ends = new Set<string>();
  const sources = [];
  for (const id of ids) {
    if (!/^C\d{8}$/.test(id)) throw new Error('Invalid FEC committee ID.');
    const url = `https://www.fec.gov/data/committee/${id}/?cycle=${cycle}`;
    const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`FEC source unavailable for ${id} (${response.status}).`);
    const summary = parseFecSummary(await response.text(), cycle);
    if (summary.to > now.toISOString().slice(0, 10)) throw new Error('FEC coverage date is in the future.');
    committeeCents += summary.committeeCents; individualCents += summary.individualCents; ends.add(summary.to);
    sources.push({ id: `summary_${id}`, label: `FEC financial summary: ${id}`, url });
  }
  if (ends.size !== 1) throw new Error('Campaign committees have different reporting coverage dates.');
  if (committeeCents !== cents(committees.total) || individualCents !== cents(individuals.total)) {
    throw new Error(`FEC reconciliation failed: committee difference $${((committeeCents - cents(committees.total)) / 100).toFixed(2)}; itemized difference $${((individualCents - cents(individuals.total)) / 100).toFixed(2)}. Refresh or reconcile original filings before publication.`);
  }
  return { checkedAt: now.toISOString(), coverageStart: `${cycle - 1}-01-01`, coverageEnd: [...ends][0], sources };
}

export function assertContributionContent(actual: { points: unknown; sources: unknown; context_markdown?: string | null }, expected: { points: unknown; sources: unknown; context_markdown: string }) {
  const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  // Rebuild immediately before publication; edited financial assertions cannot bypass verification.
  for (const key of ['points', 'sources', 'context_markdown'] as const) {
    if (canonical(actual[key]) !== canonical(expected[key])) throw new Error('Contribution figures or sources changed. Regenerate the verified draft before publishing.');
  }
}
