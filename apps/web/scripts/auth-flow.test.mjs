import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, imports = {}, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require(name) { assert.ok(name in imports, name); return imports[name]; }, URL, console, ...globals });
  return exports;
}
const redirects = load('../utils/authRedirect.ts');
test('preserves local destinations including query strings and fragments', () => {
  for (const path of ['/profile?section=preferences#saved', '/bills/123']) assert.equal(redirects.safeAuthRedirect(path), path);
});
test('rejects external URLs, executable schemes, malformed paths and auth loops', () => {
  for (const path of [null, '', 'https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/\nevil.test', '/%2f%2fevil.test', '/%5cevil.test', '/%zz', '/login?redirect=/login', '/onboarding', '/auth/callback', '/a/../login', '/%6cogin']) {
    assert.equal(redirects.safeAuthRedirect(path), '/', String(path));
  }
});
test('callback uses the app origin and encodes return paths', () => {
  const url = new URL(redirects.authCallbackUrl('https://www.govsrc.com', '/profile?section=account'));
  assert.equal(url.origin, 'https://www.govsrc.com');
  assert.equal(url.pathname, '/auth/callback');
  assert.equal(url.searchParams.get('redirect'), '/profile?section=account');
  assert.equal(new URL(redirects.authCallbackUrl('http://localhost:3010', '//evil.test')).searchParams.get('redirect'), '/');
});
function callback(exchange) {
  return load('../app/auth/callback/route.ts', {
    'next/server': { NextResponse: { redirect: (url, options) => new Response(null, { status: 307, headers: { Location: url.toString(), ...options.headers } }) } },
    '@/utils/supabase/server': { createClient: async () => ({ auth: { exchangeCodeForSession: exchange } }) },
    '@/utils/authRedirect': redirects,
  }, { Response }).GET;
}
test('exchanges code before returning to onboarding resolver without forwarding the code', async () => {
  let exchanged;
  const result = await callback(async code => { exchanged = code; return { error: null }; })(new Request('https://www.govsrc.com/auth/callback?code=test-code&redirect=%2Fprofile'));
  assert.equal(exchanged, 'test-code');
  assert.equal(result.headers.get('location'), 'https://www.govsrc.com/login?redirect=%2Fprofile');
  assert.match(result.headers.get('cache-control'), /no-store/);
});
test('missing, denied, expired and network-failed callbacks show recoverable errors', async () => {
  for (const [query, exchange] of [
    ['', () => assert.fail('must not exchange missing code')],
    ['?error=access_denied&code=untrusted', () => assert.fail('must not exchange denied code')],
    ['?code=expired', async () => ({ error: { message: 'private provider details' } })],
    ['?code=test', async () => { throw new Error('network'); }],
  ]) {
    const result = await callback(exchange)(new Request(`https://www.govsrc.com/auth/callback${query}`));
    const location = new URL(result.headers.get('location'));
    assert.equal(location.pathname, '/login');
    assert.equal(location.searchParams.get('error'), 'auth_callback_failed');
    assert.equal(location.searchParams.has('code'), false);
  }
});
// Exercise asynchronous provider transitions without adding test dependencies.
function hooks() {
  const state = []; let index = 0; let effect;
  return {
    react: {
      createContext: () => ({ Provider: 'provider' }),
      useState(initial) { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
      useEffect(fn) { effect = fn; },
    },
    render(component) { index = 0; return component({ children: null }).props.value; },
    effect: () => effect(),
  };
}
const jsx = { jsx: (type, props) => ({ type, props }) };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
test('session becomes ready without account enrichment; sign-out discards stale account results', async () => {
  const h = hooks(); let listener; let resolveUsage;
  const usage = new Promise(resolve => { resolveUsage = resolve; }); const timers = [];
  const { AuthProvider } = load('../contexts/AuthContext.tsx', {
    react: h.react, 'react/jsx-runtime': jsx,
    '../utils/supabase/client': { supabase: {
      auth: { onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; } },
      from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { tier: 'paid' }, error: null }) }; },
    } },
    '../services/account': { upsertUserUsage: () => usage, getUserUsage: async () => ({ ai_interactions: 12 }), upsertSubscription: async () => {} },
    '../constants/onboarding': { AI_FREE_USAGE_LIMIT: 5 }, '@/utils/authRedirect': redirects,
  }, { setTimeout: fn => timers.push(fn) });
  h.render(AuthProvider); const cleanup = h.effect();
  listener('SIGNED_IN', { user: { id: 'user-a', email: 'a@example.test' } });
  assert.equal(h.render(AuthProvider).loading, false);
  timers.shift()(); listener('SIGNED_OUT', null); resolveUsage(); await flush();
  const state = h.render(AuthProvider);
  assert.equal(state.user, null); assert.equal(state.isPaidSubscriber, false);
  assert.equal(state.aiInteractions, 0); assert.equal(state.aiLimitReached, false); cleanup();
});
test('onboarding waits for current user status and preserves destination when skipped', async () => {
  const h = hooks(); let auth = { user: null, loading: false }; let resolveUsage; let navigated;
  const usage = new Promise(resolve => { resolveUsage = resolve; });
  const { OnboardingProvider } = load('../contexts/OnboardingContext.tsx', {
    react: h.react, 'react/jsx-runtime': jsx,
    'next/navigation': { useRouter: () => ({ replace: path => { navigated = path; } }), useSearchParams: () => new URLSearchParams('redirect=%2Fprofile%3Fsection%3Dpreferences') },
    './AuthContext': { useAuth: () => auth }, '@/utils/authRedirect': redirects,
    '../utils/supabase/client': { supabase: { from(table) { return {
      select() { return this; }, eq() { return this; }, upsert: async () => ({ error: null }),
      maybeSingle: () => table === 'user_usage' ? usage : Promise.resolve({ data: null, error: null }),
    }; } } },
  }, { URLSearchParams });
  h.render(OnboardingProvider); h.effect()(); auth = { user: { id: 'returning-user' }, loading: false };
  assert.equal(h.render(OnboardingProvider).isLoading, true); const cleanup = h.effect();
  resolveUsage({ data: { saw_onboarding_flow_at: '2026-01-01' }, error: null }); await flush();
  const state = h.render(OnboardingProvider);
  assert.equal(state.isLoading, false); assert.equal(state.userPreferences.onboarding_completed, true);
  await state.skipOnboarding(); assert.equal(navigated, '/profile?section=preferences'); cleanup();
});
