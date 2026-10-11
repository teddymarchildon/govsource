import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const exports = {};
  const output = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', output)(name => mocks[name] ?? require(name), exports);
  return exports;
}
const { buildContributionBrief } = load('../lib/contributionBrief.ts');
const { contributionHref, normalizeContributionFilters, applyContributionFilters } = load('../lib/contributionFilters.ts');
const committees = { cycle: 2026, linked: true, committeeIds: ['C00000001'], total: 100.01, count: 3, nationwide: false,
  refreshedAt: '2026-09-20', excludedCommittees: 1, groups: [{ group_name: 'EXAMPLE PAC', giving_committee_id: 'C00000002', total_amount: 100.01, contribution_count: 3 }] };
const individuals = { cycle: 2026, linked: true, committeeIds: ['C00000001'], total: 42.12, count: 2, coveredCommittees: 1, eligibleCommittees: 2,
  refreshedAt: '2026-09-19', excludedCommittees: 1, employers: [{ label: 'EXAMPLE CO', total: 42.12, count: 2 }] };
const member = { id: 1, full_name: 'Example Member' };

test('overview uses exact repository totals with separate categories, coverage, dates and valid citations', () => {
  const brief = buildContributionBrief(member, committees, individuals);
  assert.equal(brief.status, 'review');
  assert.equal(brief.contribution_cycle, 2026);
  assert.equal(brief.points.length, 5);
  const text = brief.points.map(point => point.text).join(' ');
  for (const expected of ['$100.01', '$42.12', '1 of 2', 'Nationwide coverage is incomplete', 'not a contribution by the employer', 'not unique donor counts', 'ambiguously linked']) assert.ok(text.includes(expected), expected);
  assert.ok(!text.includes('$142.13'));
  assert.ok(brief.context_markdown.includes('2026-09-19'));
  assert.equal(brief.generation_metadata.evidence.committees.total, committees.total);
  for (const point of brief.points) for (const ref of point.source_refs) assert.ok(ref === 'primary' || brief.sources.some(source => source.id === ref));
});

test('missing individual coverage is not represented as zero giving', () => {
  const brief = buildContributionBrief(member, committees, { ...individuals, coveredCommittees: 0, committeeIds: [], count: 0, total: 0, employers: [], refreshedAt: null });
  assert.equal(brief.points.length, 4);
  assert.match(brief.points[2].text, /not yet available/);
  assert.equal(brief.sources.length, 1);
});

test('negative totals stay signed and do not create a positive top-contributor claim', () => {
  const brief = buildContributionBrief(member, { ...committees, total: -5.25, groups: [] }, { ...individuals, employers: [] });
  assert.match(brief.points[0].text, /-\$5.25/);
  assert.equal(brief.points.length, 3);
});

test('unlinked, empty and mismatched periods cannot generate briefs', () => {
  assert.throws(() => buildContributionBrief(member, { ...committees, linked: false }, individuals));
  assert.throws(() => buildContributionBrief(member, committees, { ...individuals, cycle: 2024 }));
  assert.throws(() => buildContributionBrief(member, { ...committees, count: 0 }, { ...individuals, count: 0 }));
});

test('filter URLs round-trip names and preserve filters through pagination', () => {
  const href = contributionHref('individuals', 2026, { employer: 'A & B, Inc.', from: '2026-06-01', min: '-5.25' }, 2);
  const params = new URLSearchParams(href.slice(1));
  assert.equal(params.get('employer'), 'A & B, Inc.');
  assert.equal(params.get('contributionPage'), '2');
  assert.equal(params.get('min'), '-5.25');
  assert.deepEqual(normalizeContributionFilters({ from: '2026-02-30', to: 'invalid', min: 'NaN', max: '1e9', committee: 'bogus', contributor: '  PAC  ' }), { contributor: 'PAC' });
});

test('filters escape wildcard search, normalize exact employer values and preserve signed amounts', () => {
  const calls = [];
  const query = Object.fromEntries(['eq', 'is', 'ilike', 'gte', 'lte'].map(method => [method, (...args) => calls.push([method, ...args])]));
  applyContributionFilters(query, { contributor: 'A%_B', employer: 'example   co', min: '-2.50', from: '2026-01-01' }, true);
  assert.deepEqual(calls, [['ilike', 'contributor_name', '%A\\%\\_B%'], ['eq', 'employer_normalized', 'EXAMPLE CO'], ['gte', 'receipt_date', '2026-01-01'], ['gte', 'amount', '-2.50']]);
});

function handler({ auth = { user: { id: 'admin' }, isAdmin: true }, found = null, overview = { committees, individuals }, concurrent = false } = {}) {
  let inserted = null, reads = 0;
  const db = { from(table) {
    return { select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: table === 'congressman' ? member : (++reads > 1 && concurrent ? { id: 4, title: 'Existing review' } : found), error: null }; },
      insert(value) { inserted = value; return this; },
      async single() { return concurrent ? { error: { code: '23505' } } : { data: { ...inserted, id: 4 }, error: null }; },
    };
  } };
  return { route: load('../app/api/admin/contribution-briefs/route.ts', {
    '@/utils/adminAuth': { getCurrentUserAndAdminStatus: async () => auth },
    '@/utils/supabase/admin': { createAdminClient: () => db },
    '@/lib/repositories/contributionOverview': { getContributionOverview: async () => overview },
    '@/lib/contributionBrief': { buildContributionBrief },
  }), inserted: () => inserted };
}
const request = (body = { memberId: 1, cycle: 2026 }) => new Request('https://example.com/api/admin/contribution-briefs', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
for (const [auth, status] of [[{ user: null, isAdmin: false }, 401], [{ user: { id: 'reader' }, isAdmin: false }, 403]]) {
  test(`generation denies unauthorized requests (${status})`, async () => {
    const h = handler({ auth });
    assert.equal((await h.route.POST(request())).status, status);
    assert.equal(h.inserted(), null);
  });
}
test('malformed payloads and unpublished requested cycles never save', async () => {
  const h = handler();
  for (const body of ['broken', { memberId: 1, cycle: 2025 }, { memberId: -1, cycle: 2026 }]) assert.equal((await h.route.POST(request(body))).status, 400);
  assert.equal((await h.route.POST(request({ memberId: 1, cycle: 2024 }))).status, 422);
  assert.equal(h.inserted(), null);
});
test('admin generates a review draft with evidence and ownership, never publishes it', async () => {
  const h = handler();
  assert.equal((await h.route.POST(request())).status, 201);
  assert.equal(h.inserted().status, 'review');
  assert.equal(h.inserted().created_by, 'admin');
  assert.equal(h.inserted().published_at, undefined);
  assert.ok(h.inserted().generation_metadata.evidence);
});
test('existing and concurrently generated overviews are opened without replacement', async () => {
  const h = handler({ found: { id: 5, title: 'Edited by a person' } });
  const response = await h.route.POST(request());
  assert.equal((await response.json()).brief.title, 'Edited by a person');
  assert.equal(h.inserted(), null);
  const race = await handler({ concurrent: true }).route.POST(request());
  assert.equal(race.status, 200);
  assert.equal((await race.json()).existing, true);
});

test('unresolved contributor group drill-down cannot include an identified committee with the same name', () => {
  const calls = [];
  const query = Object.fromEntries(['eq', 'is', 'ilike', 'gte', 'lte'].map(method => [method, (...args) => calls.push([method, ...args])]));
  applyContributionFilters(query, { reportedGroup: 'Example' });
  assert.deepEqual(calls, [['eq', 'contributor_name', 'Example'], ['is', 'giving_committee_id', null]]);
});

test('finance references preserve the reporting cycle and belong to Congress', () => {
  const { getContentHref } = load('../utils/contentReferences.ts');
  const { briefInstitution } = load('../utils/briefSelection.ts');
  assert.equal(getContentHref({ type: 'campaign_finance', id: '1', cycle: 2026 }), '/congress-members/1?tab=contributions&contributionKind=overview&cycle=2026');
  assert.equal(briefInstitution({ primary_item_type: 'campaign_finance' }), 'congress');
});

test('monthly summaries load beyond a database page, combine campaigns and retain undated corrections', async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ receiving_committee_id: `C${i}`, month: i === 500 ? null : '2026-01-01', total_amount: i === 500 ? '-1.25' : '0.01', contribution_count: 1 }));
  const db = { from() { let from = 0, to = 499; return {
    select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
    range(start, end) { from = start; to = end; return this; },
    then(resolve) { return Promise.resolve({ data: rows.slice(from, to + 1), error: null }).then(resolve); },
  }; } };
  const { getContributionMonths } = load('../lib/repositories/contributionOverview.ts', {
    'server-only': {}, './contributions': {}, './individualContributions': {}, '@/utils/supabase/server': { createClient: async () => db },
  });
  assert.deepEqual(await getContributionMonths(2026, ['C1'], 'individuals'), [
    { month: '2026-01-01', total: 5, count: 500 }, { month: null, total: -1.25, count: 1 },
  ]);
  assert.deepEqual(await getContributionMonths(2026, [], 'committees'), []);
});
