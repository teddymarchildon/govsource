import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/repositories/contributions.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });

function repository(overrides = {}, failTable) {
  const tables = {
    fec_sync_state: [{ cycle: 2026, last_success_at: '2026-09-20', last_full_success_at: '2026-09-20' }, { cycle: 2024, last_success_at: '2025-01-01' }],
    fec_candidate: [{ candidate_id: 'H1', congressman_id: '197' }, { candidate_id: 'S1', congressman_id: '197' }],
    fec_candidate_committee: [
      { candidate_id: 'H1', committee_id: 'C1', cycle: 2026 },
      { candidate_id: 'S1', committee_id: 'C2', cycle: 2026 },
      { candidate_id: 'H1', committee_id: 'C3', cycle: 2026 },
      { candidate_id: 'OTHER', committee_id: 'C3', cycle: 2026 },
    ],
    fec_group_candidate_totals: [
      { candidate_id: 'H1', cycle: 2026, giving_committee_id: 'G1', group_name: 'Group', total_amount: '100.01', contribution_count: 1 },
      { candidate_id: 'S1', cycle: 2026, giving_committee_id: 'G1', group_name: 'Group', total_amount: '-0.01', contribution_count: 1 },
    ],
    fec_committee_contribution: [
      ...Array.from({ length: 31 }, (_, i) => ({ sub_id: String(i).padStart(3, '0'), cycle: 2026, receiving_committee_id: 'C1', receipt_date: i === 30 ? null : '2026-06-01', amount: 1 })),
      { sub_id: 'ambiguous', cycle: 2026, receiving_committee_id: 'C3', amount: 999 },
    ],
    ...overrides,
  };
  const calls = [];
  const db = { from(table) {
    let rows = [...tables[table]], range, head = false;
    const sorts = [];
    const query = {
      select(columns, options) { head = options?.head; calls.push({ table, columns }); return this; },
      eq(column, value) { rows = rows.filter(row => row[column] === value); return this; },
      in(column, values) { rows = rows.filter(row => values.includes(row[column])); return this; },
      not(column, op, value) { rows = rows.filter(row => row[column] !== value); return this; },
      order(column, options = {}) { sorts.push({ column, ...options }); return this; },
      range(from, to) { range = [from, to]; calls.push({ table, range }); return this; },
      then(resolve, reject) {
        rows.sort((a, b) => {
          for (const { column, ascending = true, nullsFirst = false } of sorts) {
            const left = a[column], right = b[column];
            if (left === right) continue;
            if (left == null) return nullsFirst ? -1 : 1;
            if (right == null) return nullsFirst ? 1 : -1;
            return (left < right ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        });
        const count = rows.length;
        const data = head ? null : range ? rows.slice(range[0], range[1] + 1) : rows.slice(0, 1000);
        return Promise.resolve({ data, count, error: table === failTable ? new Error('Query failed') : null }).then(resolve, reject);
      },
    };
    return query;
  } };
  const exports = {};
  new Function('require', 'exports', outputText)((name) => name === 'server-only' ? {} : { createClient: async () => db, createAdminClient: () => db }, exports);
  return { get: exports.getMemberContributions, calls };
}

test('combines a member’s candidate IDs, preserves corrections, and excludes ambiguous campaign receipts', async () => {
  const { get } = repository();
  const result = await get('197');
  assert.equal(result.total, 100);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].contribution_count, 2);
  assert.equal(result.excludedCommittees, 1);
  assert.equal(result.count, 31);
  assert.equal(result.receipts.length, 25);
  assert.ok(result.receipts.every(row => row.receiving_committee_id === 'C1'));
});

test('pagination is stable across tied dates, puts missing dates last, and clamps invalid pages', async () => {
  const { get } = repository();
  const first = await get('197', '2026', '1');
  const last = await get('197', '2026', '999');
  assert.equal(last.page, 2);
  assert.equal(last.receipts.length, 6);
  assert.equal(last.receipts.at(-1).receipt_date, null);
  assert.equal(new Set([...first.receipts, ...last.receipts].map(row => row.sub_id)).size, 31);
  assert.equal((await get('197', 'bad', '-2')).page, 1);
  assert.equal((await get('197', 'bad')).cycle, 2026);
});

test('loads groups beyond one database page before calculating totals', async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ candidate_id: 'H1', cycle: 2026, giving_committee_id: `G${i}`, group_name: `Group ${i}`, total_amount: '0.01', contribution_count: 1 }));
  const { get, calls } = repository({ fec_group_candidate_totals: rows });
  const result = await get('197');
  assert.equal(result.groups.length, 501);
  assert.equal(result.total, 5.01);
  assert.ok(calls.some(call => call.range?.[0] === 500));
});

test('keeps unresolved names separate from identified committees', async () => {
  const rows = [null, 'G1'].map(id => ({ candidate_id: 'H1', cycle: 2026, giving_committee_id: id, group_name: 'Same name', total_amount: 10, contribution_count: 1 }));
  assert.equal((await repository({ fec_group_candidate_totals: rows }).get('197')).groups.length, 2);
});

test('distinguishes unlinked members, unpublished periods, and published periods without receipts', async () => {
  assert.equal((await repository().get('missing')).linked, false);
  assert.equal((await repository({ fec_sync_state: [] }).get('197')).cycle, null);
  const historical = await repository().get('197', '2024');
  assert.equal(historical.linked, true);
  assert.equal(historical.count, 0);
  assert.equal(historical.nationwide, false);
});

test('database errors do not silently become zero contributions; private sync fields are never selected', async () => {
  await assert.rejects(repository({}, 'fec_group_candidate_totals').get('197'), /Query failed/);
  const { get, calls } = repository();
  await get('197');
  const columns = calls.find(call => call.table === 'fec_sync_state').columns;
  assert.ok(!/\*|error|checkpoint|token|lease/.test(columns));
});
