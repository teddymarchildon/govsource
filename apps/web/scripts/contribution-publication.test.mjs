import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const e = {};
  new Function('require', 'exports', ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(n => mocks[n] ?? require(n), e);
  return e;
}
const checks = load('../lib/contributionVerification.ts');
const expected = { points: [1, 2, 3].map(n => ({ id: `point_${n}`, label: 'Verified', text: `Verified point ${n}`, source_refs: ['summary'] })), sources: [{ id: 'summary', label: 'FEC', url: 'https://www.fec.gov/' }], context_markdown: 'Coverage through June 30' };
function setup(fail = false) {
  let writes = 0, checked = 0;
  const db = { from() { const q = { select() { return q; }, eq() { return q; }, insert() { writes++; return q; }, update() { writes++; return q; }, async single() { return { data: { id: 1 } }; }, async maybeSingle() { return { data: { id: 1 } }; } }; return q; } };
  const route = load('../app/api/admin/briefs/route.ts', {
    '@/lib/briefPoints': load('../lib/briefPoints.ts'),
    '@/lib/contributionVerification': { ...checks, verifyContributionFigures: async () => { checked++; if (fail) throw new Error('FEC reconciliation failed'); return {}; } },
    '@/lib/contributionBrief': { buildContributionBrief: () => expected },
    '@/lib/repositories/contributions': { getMemberContributions: async () => ({}) },
    '@/lib/repositories/individualContributions': { getMemberIndividualContributions: async () => ({}) },
    '@/utils/adminAuth': { getCurrentUserAndAdminStatus: async () => ({ user: { id: 'admin' }, isAdmin: true }) },
    '@/utils/supabase/admin': { createAdminClient: () => db },
  });
  return { route, writes: () => writes, checked: () => checked };
}
const body = { ...expected, title: 'Test', dek: 'Verified summary', primary_item_type: 'campaign_finance', primary_item_id: 1, contribution_cycle: 2026, status: 'published', policy_areas: [], is_featured: false };
const request = b => new Request('https://example.com/api/admin/briefs', { method: 'POST', body: JSON.stringify(b) });
for (const method of ['POST', 'PATCH']) {
  test(`${method} enforces live reconciliation and blocks changed content before writing`, async () => {
    const extra = method === 'PATCH' ? { id: 1, version: 1 } : {};
    for (const [fail, changed] of [[true, false], [false, true]]) {
      const f = setup(fail); const input = { ...body, ...extra, ...(changed ? { sources: [] } : {}) };
      assert.equal((await f.route[method](request(input))).status, 400); assert.equal(f.writes(), 0); assert.equal(f.checked(), 1);
    }
    const f = setup(); assert.equal((await f.route[method](request({ ...body, ...extra }))).status, method === 'POST' ? 201 : 200); assert.equal(f.writes(), 1);
  });
}
test('scheduled contribution copy cannot bypass publication-time verification', async () => {
  const f = setup(); assert.equal((await f.route.POST(request({ ...body, status: 'scheduled', published_at: '2099-01-01T00:00:00Z' }))).status, 400); assert.equal(f.writes(), 0);
});
