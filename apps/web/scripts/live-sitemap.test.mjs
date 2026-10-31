import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(new URL('../app/sitemap.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(rows, fail = false) {
  const calls = [];
  const db = { from(table) {
    const query = {};
    for (const method of ['select', 'in', 'not', 'lte', 'order']) query[method] = (...args) => {
      calls.push([table, method, ...args]); return query;
    };
    query.range = async (from, to) => {
      calls.push([table, 'range', from, to]);
      return { data: rows.slice(from, to + 1), error: fail ? new Error('Unavailable') : null };
    };
    query.then = resolve => resolve({ data: [{ slug: 'health', updated_at: '2026-10-31' }], error: null });
    return query;
  } };
  const context = { exports: {}, Date, encodeURIComponent, require: name => {
    if (name === '@/utils/supabase/admin') return { createAdminClient: () => db };
    return require(name);
  } };
  vm.runInNewContext(code, context);
  return { run: context.exports.default, dynamic: context.exports.dynamic, calls };
}

test('live sitemap includes publisher pages and every page of public Briefs', async () => {
  const fixture = Array.from({ length: 1001 }, (_, id) => ({ id, slug: `brief-${id}`, updated_at: '2026-10-31', published_at: '2026-10-30' }));
  const { run, calls, dynamic } = load(fixture);
  const urls = (await run()).map(entry => entry.url);
  assert.equal(dynamic, 'force-dynamic');
  for (const path of ['/about', '/contact', '/privacy', '/editorial-policy', '/topics/health', '/briefs/brief-1000']) assert.ok(urls.includes(`https://www.govsrc.com${path}`));
  assert.equal(urls.filter(url => url.includes('/briefs/')).length, 1001);
  assert.ok(calls.some(call => call[1] === 'in' && call[2] === 'status' && JSON.stringify(call[3]) === '["published","scheduled"]'));
  assert.ok(calls.some(call => call[1] === 'lte' && call[2] === 'published_at'));
  assert.equal(new Set(urls).size, urls.length);
});

test('database failures do not silently produce an empty successful sitemap', async () => {
  await assert.rejects(load([], true).run(), /Unavailable/);
});
