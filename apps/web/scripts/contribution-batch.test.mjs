import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../lib/contributionBriefBatch.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup({ existing = [], fresh = true, individualFresh = true, fail = false, concurrent = false, reconciliationFails = false, waiting = false, Clock = Date } = {}) {
  class ContributionDataPending extends Error {}
  const inserts = []; const verificationTimes = []; let reads = 0; const exports = {};
  new Function('require', 'exports', 'Date', code)(name => name.endsWith('contributionVerification') ? { ContributionDataPending, verifyContributionFigures: async (_c, _i, now) => { verificationTimes.push(now); if (waiting) throw new ContributionDataPending('Waiting for FEC reconciliation'); if (reconciliationFails) throw new Error('FEC mismatch'); } } : name.endsWith('contributionBrief') ? { buildContributionBrief: () => ({ status: 'review', auto_generated: false, generation_metadata: {} }) }
    : name.endsWith('/contributions') ? { getMemberContributions: async () => ({ cycle: 2026, linked: true, count: 10 }) }
    : { getMemberIndividualContributions: async () => ({ cycle: 2026, linked: true, count: 10, coveredCommittees: 1, eligibleCommittees: 1, refreshedAt: individualFresh ? '2026-10-11T11:00:00Z' : '2026-10-04T11:00:00Z' }) }, exports, Clock);
  const db = { from(table) {
    let inserting = false;
    const q = {
      select() { return q; }, eq() { return q; }, not() { return q; }, order() { return q; }, range() { return q; },
      insert(row) { inserts.push(row); inserting = true; return q; }, single() { return q; }, maybeSingle() { return q; },
      then(resolve) {
        let value;
        if (table === 'fec_sync_state') value = { data: { last_full_success_at: fresh ? '2026-10-11T09:00:00Z' : '2026-10-04T09:00:00Z' } };
        else if (table === 'fec_candidate') value = { data: Array.from({ length: 12 }, (_, i) => ({ congressman_id: i + 1 })) };
        else if (table === 'congressman') value = { data: { id: 1, full_name: 'Test' } };
        else if (inserting) value = fail ? { error: { code: '500', message: 'database failed' } } : concurrent ? { error: { code: '23505' } } : { data: { id: inserts.length } };
        else value = ++reads > 1 ? { data: { id: 9 } } : { data: existing.map(id => ({ primary_item_id: id })), count: existing.length };
        return Promise.resolve(value).then(resolve);
      },
    }; return q;
  } };
  return { run: () => exports.generateContributionBriefBatch(db, new Date('2026-10-11T13:00:00Z')), inserts, exports, verificationTimes, runLive: () => exports.generateContributionBriefBatch(db) };
}
test('pilot creates at most five unpublished briefs', async () => {
  const f = setup(); assert.equal((await f.run()).created.length, 5);
  assert.ok(f.inserts.every(row => row.status === 'review' && row.auto_generated === false && !row.published_at));
});
test('existing briefs consume slots regardless of editorial status', async () => {
  assert.equal((await setup({ existing: [1, 2, 3, 4] }).run()).created.length, 1);
  const full = setup({ existing: [1, 2, 3, 4, 5] }); assert.equal((await full.run()).created.length, 0); assert.equal(full.inserts.length, 0);
});
test('both imports must be fresh', async () => {
  for (const options of [{ fresh: false }, { individualFresh: false }]) {
    const f = setup(options); assert.equal((await f.run()).created.length, 0); assert.equal(f.inserts.length, 0);
  }
});
test('concurrent admin creations consume pilot slots', async () => {
  const f = setup({ existing: [1, 2, 3, 4], concurrent: true });
  const result = await f.run(); assert.equal(result.created.length, 0); assert.equal(result.existing, 5);
});
test('database failures fail the job', async () => { await assert.rejects(setup({ fail: true }).run()); });
test('week starts Sunday UTC', () => {
  assert.equal(setup().exports.contributionImportCutoff(new Date('2026-10-17T23:59:59Z')), '2026-10-11T00:00:00.000Z');
});


test('reconciliation failure blocks new drafts and audits even a full pilot', async () => {
  const f = setup({ reconciliationFails: true });
  const result = await f.run(); assert.equal(result.created.length, 0); assert.equal(result.blocked.length, 1);
  const full = await setup({ existing: [1, 2, 3, 4, 5], reconciliationFails: true }).run();
  assert.equal(full.blocked.length, 5);
});


test('data waiting blocks all writes but does not become an execution failure', async () => {
  for (const existing of [[], [1, 2, 3, 4, 5]]) {
    const f = setup({ existing, waiting: true });
    const result = await f.run();
    assert.equal(result.waiting.length, existing.length || 1);
    assert.equal(result.blocked.length, 0);
    assert.equal(result.created.length, 0);
    assert.equal(f.inserts.length, 0);
  }
  const stale = await setup({ fresh: false }).run();
  assert.equal(stale.waiting.length, 1);
  assert.equal(stale.blocked.length, 0);
});


test('live audits use a fresh time after reading imports, not the batch start', async () => {
  const base = Date.parse('2026-10-11T13:00:00Z');
  let tick = 0;
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [base + tick++ * 1000])); }
  }
  const f = setup({ existing: [1, 2, 3, 4, 5], Clock });
  await f.runLive();
  assert.equal(f.verificationTimes.length, 5);
  assert.ok(f.verificationTimes.every(time => time.getTime() > base));
  assert.equal(new Set(f.verificationTimes.map(time => time.getTime())).size, 5);
});
