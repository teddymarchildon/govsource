import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../lib/repositories/individualContributions.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });

function repository(overrides = {}, failTable) {
  const tables = {
    fec_sync_state: [{ cycle: 2026, last_success_at: '2026-09-20' }],
    fec_candidate: [{ candidate_id: 'H1', congressman_id: '1' }, { candidate_id: 'S1', congressman_id: '1' }],
    fec_candidate_committee: [
      { cycle: 2026, candidate_id: 'H1', committee_id: 'C1' }, { cycle: 2026, candidate_id: 'S1', committee_id: 'C2' },
      { cycle: 2026, candidate_id: 'H1', committee_id: 'C3' }, { cycle: 2026, candidate_id: 'OTHER', committee_id: 'C3' },
    ],
    fec_individual_coverage: [
      { cycle: 2026, committee_id: 'C1', last_success_at: '2026-09-20', receipt_count: 26, total_amount: '100.01' },
      { cycle: 2026, committee_id: 'C2', last_success_at: '2026-09-19', receipt_count: 1, total_amount: '-0.01' },
      { cycle: 2026, committee_id: 'C3', last_success_at: '2026-09-20', receipt_count: 1, total_amount: '999' },
    ],
    fec_individual_group_totals: ['employer', 'occupation'].flatMap(kind => [
      { cycle: 2026, receiving_committee_id: 'C1', kind, label: 'EXAMPLE', total_amount: '100.01', contribution_count: 26 },
      { cycle: 2026, receiving_committee_id: 'C2', kind, label: 'EXAMPLE', total_amount: '-0.01', contribution_count: 1 },
      { cycle: 2026, receiving_committee_id: 'C3', kind, label: 'EXAMPLE', total_amount: '999', contribution_count: 1 },
    ]),
    fec_individual_contribution: Array.from({ length: 27 }, (_, i) => ({ cycle: 2026, sub_id: String(i).padStart(3, '0'),
      receiving_committee_id: i === 26 ? 'C2' : 'C1', receipt_date: i === 26 ? null : '2026-06-01' })),
    ...overrides,
  };
  const calls = [];
  const db = { from(table) {
    let rows = [...tables[table]], range;
    const order = [];
    return {
      select() { return this; },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return this; },
      in(key, values) { rows = rows.filter(row => values.includes(row[key])); return this; },
      not(key, op, value) { rows = rows.filter(row => row[key] !== value); return this; },
      order(key, options = {}) { order.push({ key, ...options }); return this; },
      range(start, end) { range = [start, end]; calls.push({ table, range }); return this; },
      then(resolve, reject) {
        rows.sort((a, b) => {
          for (const { key, ascending = true, nullsFirst = false } of order) {
            if (a[key] === b[key]) continue;
            if (a[key] == null) return nullsFirst ? -1 : 1;
            if (b[key] == null) return nullsFirst ? 1 : -1;
            return (a[key] < b[key] ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        });
        return Promise.resolve({ data: range ? rows.slice(range[0], range[1] + 1) : rows.slice(0, 1000),
          error: table === failTable ? new Error('Query failed') : null }).then(resolve, reject);
      },
    };
  } };
  const exports = {};
  new Function('require', 'exports', outputText)((name) => name === 'server-only' ? {} : name === './contributions'
    ? { CONTRIBUTION_PAGE_SIZE: 25 } : { createClient: async () => db, createAdminClient: () => db }, exports);
  return { get: exports.getMemberIndividualContributions, calls };
}

test('combines campaigns without double counting ambiguous mappings and preserves exact signed totals', async () => {
  const result = await repository().get('1');
  assert.equal(result.excludedCommittees, 1);
  assert.equal(result.eligibleCommittees, 2);
  assert.equal(result.coveredCommittees, 2);
  assert.equal(result.total, 100);
  assert.equal(result.count, 27);
  assert.equal(result.employers[0].total, 100);
  assert.equal(result.occupations[0].count, 27);
  assert.equal(result.refreshedAt, '2026-09-19');
});

test('pagination remains stable for tied and missing dates and clamps invalid pages', async () => {
  const { get } = repository();
  const first = await get('1', 'bad', '-1');
  const last = await get('1', '2026', '99999999');
  assert.equal(first.cycle, 2026);
  assert.equal(first.page, 1);
  assert.equal(last.page, 2);
  assert.equal(last.receipts.at(-1).receipt_date, null);
  assert.equal(new Set([...first.receipts, ...last.receipts].map(r => r.sub_id)).size, 27);
});

test('reports partial and missing publication separately from a completed zero-record import', async () => {
  const rows = [{ cycle: 2026, committee_id: 'C1', last_success_at: '2026-09-20', receipt_count: 0, total_amount: 0 }];
  const partial = await repository({ fec_individual_coverage: rows, fec_individual_group_totals: [], fec_individual_contribution: [] }).get('1');
  assert.equal(partial.coveredCommittees, 1);
  assert.equal(partial.eligibleCommittees, 2);
  assert.equal(partial.count, 0);
  assert.equal((await repository({ fec_individual_coverage: [] }).get('1')).coveredCommittees, 0);
  assert.equal((await repository().get('missing')).linked, false);
});

test('loads all summary pages and keeps missing employment separate', async () => {
  const groups = Array.from({ length: 501 }, (_, i) => ({ cycle: 2026, receiving_committee_id: 'C1', kind: 'employer',
    label: i === 500 ? null : `EMPLOYER ${i}`, total_amount: '0.01', contribution_count: 1 }));
  const { get, calls } = repository({ fec_individual_group_totals: groups });
  const result = await get('1');
  assert.equal(result.employers.length, 501);
  assert.equal(result.employers.find(g => g.label === null).total, 0.01);
  assert.ok(calls.some(c => c.table === 'fec_individual_group_totals' && c.range[0] === 500));
});

test('a query failure cannot be presented as zero individual fundraising', async () => {
  await assert.rejects(repository({}, 'fec_individual_coverage').get('1'), /Query failed/);
  await assert.rejects(repository({}, 'fec_individual_group_totals').get('1'), /Query failed/);
});
