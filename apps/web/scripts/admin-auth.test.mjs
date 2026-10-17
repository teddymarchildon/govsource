import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const output = ts.transpileModule(readFileSync(new URL('../utils/adminAuth.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup({ user = null, authError = null, member = false, dbError = null, throws = false } = {}) {
  const calls = [];
  const context = { exports: {}, console: { error() {} }, require(name) {
    if (name === 'server-only') return {};
    if (name === '@/utils/supabase/server') return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: authError }) } }) };
    if (name === '@/utils/supabase/admin') return { createAdminClient: () => {
      calls.push('lookup');
      if (throws) throw new Error('Unavailable');
      return { from(table) {
        assert.equal(table, 'admin_user');
        return { select(fields) {
          assert.equal(fields, 'user_id');
          return { eq(key, value) {
            assert.equal(key, 'user_id'); assert.equal(value, user.id);
            return { maybeSingle: async () => ({ data: member ? { user_id: user.id } : null, error: dbError }) };
          } };
        } };
      } };
    } };
    throw new Error(`Unexpected import: ${name}`);
  } };
  vm.runInNewContext(output, context);
  return { check: context.exports.getCurrentUserAndAdminStatus, calls };
}
test('anonymous and invalid sessions never query admin membership', async () => {
  for (const input of [{}, { user: { id: 'owner' }, authError: new Error('Invalid session') }]) {
    const { check, calls } = setup(input);
    const result = await check();
    assert.equal(result.user, null); assert.equal(result.isAdmin, false); assert.equal(calls.length, 0);
  }
});
test('only a database membership grants access, independent of email or metadata', async () => {
  const { check } = setup({ user: { id: 'member', email: 'another@example.com' }, member: true });
  assert.equal((await check()).isAdmin, true);
  const denied = setup({ user: { id: 'nonmember', email: 'ted.marchildon@gmail.com', user_metadata: { is_admin: true } } });
  assert.equal((await denied.check()).isAdmin, false);
});
test('database failures fail closed even when data is returned', async () => {
  for (const failure of [{ dbError: { code: '42P01' } }, { throws: true }]) {
    const { check } = setup({ user: { id: 'member' }, member: true, ...failure });
    assert.equal((await check()).isAdmin, false);
  }
});
test('membership is queried again for every request', async () => {
  const { check, calls } = setup({ user: { id: 'member' }, member: true });
  await check(); await check(); assert.equal(calls.length, 2);
});

const statusOutput = ts.transpileModule(readFileSync(new URL('../app/api/account/admin-status/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
async function statusResponse(auth) {
  const context = { exports: {}, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } };
    if (name === '@/utils/adminAuth') return { getCurrentUserAndAdminStatus: async () => {
      if (auth instanceof Error) throw auth;
      return auth;
    } };
    throw new Error(`Unexpected import: ${name}`);
  } };
  vm.runInNewContext(statusOutput, context);
  return context.exports.GET();
}
test('status endpoint exposes only current account ID and admin flag without caching', async () => {
  for (const isAdmin of [true, false]) {
    const response = await statusResponse({ user: { id: 'current', email: 'private@example.com' }, isAdmin });
    assert.deepEqual(await response.json(), { userId: 'current', isAdmin });
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('vary'), 'Cookie');
  }
});
test('signed-out and failed status checks never return admin access', async () => {
  const signedOut = await statusResponse({ user: null, isAdmin: true });
  assert.deepEqual(await signedOut.json(), { userId: null, isAdmin: false });
  const failed = await statusResponse(new Error('Auth service unavailable'));
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { userId: null, isAdmin: false });
});
