import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => mocks[name] ?? require(name), exports);
  return exports;
}
const brief = load('../lib/contributionBrief.ts');
const committees = { cycle: 2026, linked: true, count: 100, total: 500000, committeeIds: ['C00000001'], groups: [] };
const individuals = { cycle: 2026, linked: true, count: 100, total: 500000, committeeIds: ['C00000001'], employers: [], coveredCommittees: 1, eligibleCommittees: 1, refreshedAt: '2026-10-11T11:00:00Z' };
const now = new Date('2026-10-11T13:00:00Z');
function setup({ existing = [], fresh = true, individualFresh = true, broken = [], waiting = false, allowance = 100, failWrite = false } = {}) {
  const writes = []; const verified = [];
  class ContributionDataPending extends Error {}
  const api = load('../lib/contributionBriefBatch.ts', {
    './contributionBrief': brief,
    './contributionVerification': { ContributionDataPending, verifyContributionFigures: async (c) => {
      verified.push(c.memberId);
      if (broken.includes(c.memberId)) throw waiting ? new ContributionDataPending('Waiting') : new Error('Mismatch');
      return { checkedAt: now.toISOString(), coverageStart: '2025-01-01', coverageEnd: '2026-09-30', sources: [] };
    } },
    './repositories/contributions': { getMemberContributions: async id => ({ ...committees, memberId: Number(id) }) },
    './repositories/individualContributions': { getMemberIndividualContributions: async () => ({ ...individuals, refreshedAt: individualFresh ? individuals.refreshedAt : '2026-09-01' }) },
  });
  const db = { from(table) {
    let first = 0, last = 499, member = 1;
    const q = { select() { return q; }, eq(key, value) { if(key === 'id') member=value; return q; }, not() { return q; }, order() { return q; },
      range(a,b) { first=a; last=b; return q; }, single() { return q; }, maybeSingle() { return q; },
      then(resolve) { return Promise.resolve({ data: table === 'fec_sync_state' ? { last_full_success_at: fresh ? '2026-10-11T09:00:00Z' : '2026-09-01' }
        : table === 'brief' ? existing.slice(first,last+1)
        : table === 'congressman' ? { id: member, full_name: `Member ${member}` }
        : Array.from({ length: 12 }, (_, i) => ({ congressman_id: i + 1 })).slice(first,last+1) }).then(resolve); },
    }; return q;
  }, async rpc(_name, { p_draft }) {
    if(failWrite) return { error: new Error('Database unavailable') };
    if(writes.length >= allowance) return { data: null };
    writes.push(p_draft); return { data: writes.length };
  } };
  return { run: () => api.generateContributionBriefBatch(db, now), writes, verified };
}
const prior = (id, status = 'published', totals = 100000) => ({ id, primary_item_id: id, status, generation_metadata: { evidence: { committees: { total: totals }, individuals: { total: totals } } } });
test('continues beyond five total briefs and creates follow-ups without overwriting publications', async () => {
  const f=setup({ existing: Array.from({length: 5},(_,i)=>prior(i+1)) });
  assert.equal((await f.run()).created.length,12);
  assert.ok(f.writes.every(row=>row.status==='review' && !row.published_at && row.generation_metadata.selection.editorial_review_required));
  assert.ok(f.writes.every(row=>row.slug.endsWith(row.generation_metadata.fingerprint.slice(0,16))));
});
test('shared daily allowance defers work without a lifetime cap', async()=> {
  const f=setup({ allowance: 2 }); const r=await f.run(); assert.equal(r.created.length,2); assert.match(r.reason,/allowance/);
});
test('pending editorial work, duplicate snapshots, and unchanged evidence do not produce another draft', async()=> {
  const duplicate=prior(2); duplicate.generation_metadata.fingerprint=brief.contributionFingerprint(committees,individuals);
  const f=setup({existing:[prior(1,'review'),duplicate,prior(3,'published',500000)]});
  const r=await f.run(); assert.equal(r.unchanged,3); assert.equal(r.created.length,9);
  assert.ok(!f.verified.includes(1)&&!f.verified.includes(2)&&!f.verified.includes(3));
});
test('stale or partial imports do not draft',async()=> {
  for(const options of [{fresh:false},{individualFresh:false}]) {const f=setup(options);assert.equal((await f.run()).created.length,0);}
});
test('one unreconciled campaign does not starve the others',async()=> {
  for(const waiting of [false,true]) {const f=setup({broken:[1],waiting}); const r=await f.run();assert.equal(r.created.length,11);assert.equal((waiting?r.waiting:r.blocked).length,1);}
});
test('database errors remain visible failures',async()=> {const r=await setup({failWrite:true}).run();assert.equal(r.created.length,0);assert.equal(r.blocked.length,12);});
test('refresh-only differences deduplicate; signed material corrections qualify; thin evidence does not',()=> {
  assert.equal(brief.contributionFingerprint(committees,individuals),brief.contributionFingerprint({...committees,refreshedAt:'later'},{...individuals,refreshedAt:'later'}));
  assert.equal(brief.selectContributionDevelopment(committees,individuals,{committees:{total:510000},individuals:{total:500000}}).selected,false);
  assert.equal(brief.selectContributionDevelopment(committees,individuals,{committees:{total:700000}}).selected,true);
  assert.equal(brief.selectContributionDevelopment({...committees,count:1},{...individuals,count:1}).selected,false);
});
