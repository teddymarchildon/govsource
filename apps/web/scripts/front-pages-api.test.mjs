import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const types = { exports: {} }; vm.runInNewContext(compile('../types/frontPage.ts'), types);
function route(auth, db) {
  const context = { exports: {}, console, URL, require: name => name === '@/utils/adminAuth' ? { getCurrentUserAndAdminStatus: async () => auth }
    : name === '@/utils/supabase/admin' ? { createAdminClient: () => db }
    : name === '@/types/frontPage' ? types.exports : require(name) };
  vm.runInNewContext(compile('../app/api/admin/front-pages/route.ts'), context);
  return context.exports;
}
const admin = { user: { id: 'admin' }, isAdmin: true };
const input = { section: 'home', version: 1, lead_brief_id: '1', supporting_brief_id: null, secondary_brief_id: null };
const request = value => new Request('https://example.com/api/admin/front-pages', { method: 'PATCH', body: typeof value === 'string' ? value : JSON.stringify(value) });
for (const auth of [{ user: null, isAdmin: false }, { user: { id: 'reader' }, isAdmin: false }]) {
  test(`front-page read/write denied for ${auth.user ? 'reader' : 'anonymous'}`, async () => {
    const handlers = route(auth, null);
    assert.equal((await handlers.GET()).status, 403);
    assert.equal((await handlers.PATCH(request(input))).status, 403);
  });
}
test('invalid sections, duplicate briefs and malformed bodies fail before database access', async () => {
  const handlers = route(admin, null);
  for (const value of ['broken', { ...input, section: 'unknown' }, { ...input, supporting_brief_id: '1' }, { ...input, version: 0 }]) {
    assert.equal((await handlers.PATCH(request(value))).status, 400);
  }
});
function database({ live = true, conflict = false } = {}) {
  const calls = []; let update;
  return { calls, get update() { return update; }, from(table) {
    const chain = {};
    for (const method of ['select', 'in', 'not', 'lte', 'eq', 'update']) chain[method] = (...args) => {
      calls.push([table, method, ...args]); if (method === 'update') update = args[0]; return chain;
    };
    chain.then = resolve => resolve({ data: live ? [{ id: 1 }] : [], error: null });
    chain.maybeSingle = async () => ({ data: conflict ? null : { ...input, ...update }, error: null });
    return chain;
  } };
}
test('unpublished or future briefs are rejected; public visibility filters are applied', async () => {
  const db = database({ live: false });
  assert.equal((await route(admin, db).PATCH(request(input))).status, 400);
  assert.ok(db.calls.some(call => call[1] === 'lte' && call[2] === 'published_at'));
  assert.ok(db.calls.some(call => call[1] === 'in' && call[2] === 'status'));
  assert.equal(db.update, undefined);
});
test('save updates one page and version, with stale saves reported as conflicts', async () => {
  for (const conflict of [false, true]) {
    const db = database({ conflict });
    assert.equal((await route(admin, db).PATCH(request(input))).status, conflict ? 409 : 200);
    assert.equal(db.update.version, 2);
    assert.equal(db.update.updated_by, 'admin');
    assert.ok(db.calls.some(call => call[1] === 'eq' && call[2] === 'section' && call[3] === 'home'));
    assert.ok(db.calls.some(call => call[1] === 'eq' && call[2] === 'version' && call[3] === 1));
  }
});
test('all slots can be cleared to restore automatic selection', async () => {
  const db = database();
  assert.equal((await route(admin, db).PATCH(request({ ...input, lead_brief_id: null }))).status, 200);
  assert.ok(db.calls.every(call => call[0] === 'brief_front_page'));
});

test('public selection loads old pinned stories, skips private stories and keeps page assignments isolated', async () => {
  const records = [
    { id: 1, title: 'Older live brief', slug: 'old', status: 'published', published_at: '2020-01-01', points: [], related_items: [] },
    { id: 2, title: 'Private', slug: 'private', status: 'draft', published_at: '2020-01-01' },
    { id: 3, title: 'Future', slug: 'future', status: 'scheduled', published_at: '2999-01-01' },
  ];
  const db = { from(table) {
    let section; let filtered = records;
    const chain = {
      select: () => chain,
      eq: (_, value) => { section = value; return chain; },
      in: (key, values) => { filtered = filtered.filter(row => values.map(String).includes(String(row[key]))); return chain; },
      not: (key) => { filtered = filtered.filter(row => row[key] != null); return chain; },
      lte: (key, value) => { filtered = filtered.filter(row => Date.parse(row[key]) <= Date.parse(value)); return chain; },
      maybeSingle: async () => ({ data: section === 'home' ? { lead_brief_id: 1, supporting_brief_id: 2, secondary_brief_id: 3 } : { lead_brief_id: null, supporting_brief_id: null, secondary_brief_id: null }, error: null }),
      then: resolve => { assert.equal(table, 'brief'); return resolve({ data: filtered, error: null }); },
    }; return chain;
  } };
  const context = { exports: {}, require: name => name === 'server-only' ? {} : name === 'react' ? { cache: fn => fn }
    : name === '@/utils/supabase/admin' ? { createAdminClient: () => db }
    : name === '@/utils/contentReferences' ? { isContentType: () => true }
    : name === '@/types/section' ? {} : name === '@/types/frontPage' ? types.exports : require(name) };
  vm.runInNewContext(compile('../lib/repositories/briefs.ts'), context);
  const recent = [{ id: '10', slug: 'recent', is_featured: false }];
  const home = await context.exports.withFrontPageSelections('home', recent);
  assert.equal(home.find(row => row.id === '1').editorial_slot, 0);
  assert.ok(!home.some(row => ['2', '3'].includes(row.id)));
  assert.equal(home.length, 2);
  const courts = await context.exports.withFrontPageSelections('courts', recent);
  assert.equal(courts.length, 1);
  assert.equal(courts[0].editorial_slot, undefined);
  assert.equal(recent.length, 1, 'caller data is unchanged');
});
