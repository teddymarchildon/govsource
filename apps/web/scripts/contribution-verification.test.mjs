import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const exports = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../lib/contributionVerification.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
const { parseFecSummary, verifyContributionFigures, assertContributionContent } = exports;
const html = (committee = '229,974.61', individual = '1,113,084.58', end = '06/30/2026') => `<h2>Coverage dates:</h2> 01/01/2025 to ${end} <b>Party committee contributions</b> $0.00 Other committee contributions $${committee} Itemized individual contributions $${individual} Total spent`;
const now = new Date('2026-10-14T10:00:00Z');
const c = { cycle: 2026, linked: true, nationwide: true, excludedCommittees: 0, committeeIds: ['C00473827'], refreshedAt: '2026-10-12', total: 229974.61 };
const i = { ...c, total: 1113084.58, coveredCommittees: 1, eligibleCommittees: 1 };
const fetcher = async () => new Response(html());
test('Lee discrepancies are blocked; reconciled figures retain source coverage', async () => {
  await assert.rejects(verifyContributionFigures({ ...c, total: 220974.61 }, { ...i, total: 1112084.58 }, now, fetcher), /9000.00.*1000.00/);
  const result = await verifyContributionFigures(c, i, now, fetcher);
  assert.equal(result.coverageEnd, '2026-06-30'); assert.equal(result.sources.length, 1);
});
test('Fischer missing LLC and Paul new-quarter totals cannot pass', async () => {
  await assert.rejects(verifyContributionFigures({ ...c, total: 339154.16 }, { ...i, total: 315280.48 }, now, async () => new Response(html('339,154.16', '316,280.48'))), /1000.00/);
  await assert.rejects(verifyContributionFigures({ ...c, total: 97046.15 }, { ...i, total: 2223210.11 }, now, async () => new Response(html('100,546.15', '2,674,152.80', '09/30/2026'))), /reconciliation failed/);
});
test('unavailable sources, stale imports, ambiguity, partial coverage and malformed summaries fail closed', async () => {
  for (const change of [{ refreshedAt: null }, { refreshedAt: '2026-09-01' }, { excludedCommittees: 1 }, { nationwide: false }]) await assert.rejects(verifyContributionFigures({ ...c, ...change }, i, now, fetcher));
  await assert.rejects(verifyContributionFigures(c, { ...i, eligibleCommittees: 2 }, now, fetcher));
  await assert.rejects(verifyContributionFigures(c, i, now, async () => new Response('Unavailable', { status: 503 })));
  for (const body of ['challenge page', html().replace('Itemized individual contributions', 'missing'), html().replace('01/01/2025', '01/01/2023')]) assert.throws(() => parseFecSummary(body, 2026));
});
test('financial copy and citations cannot change between verification and publication', () => {
  const expected = { points: [{ text: '$100', source_refs: ['summary'] }], sources: [{ id: 'summary' }], context_markdown: 'June 30' };
  assertContributionContent(expected, expected);
  for (const change of [{ points: [{ text: '$999' }] }, { sources: [] }, { context_markdown: 'September 30' }]) assert.throws(() => assertContributionContent({ ...expected, ...change }, expected));
});
