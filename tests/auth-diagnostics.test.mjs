import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { requestTiming } from '../src/request-timing.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const user = { id: 'user-id', email: 'private@example.test', name: 'Private name', role: 'mentor' };
const env = () => ({
  ADMIN_EMAIL: 'admin@example.test', GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret',
  DB: { prepare(sql) { return {
    bind() { return this; },
    async first() {
      if (sql.includes('FROM identities')) { await wait(15); return { user_id: user.id }; }
      if (sql.includes('FROM users')) return user;
      if (sql.includes('FROM workspaces')) return { id: 'workspace-id' };
      throw new Error('Unexpected query');
    },
    async run() { return { success: true }; },
  }; } },
});
const callback = () => new Request('https://menty.test/api/auth/google/callback?code=private-code&state=private-state', {
  headers: { cookie: 'menty_oauth=private-state.private-verifier.private-invite' },
});

test('OAuth callback measures each stage, preserves both cookies and excludes private data from diagnostics', async (t) => {
  const logs = [];
  t.mock.method(console, 'info', (line) => logs.push(JSON.parse(line)));
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes('/token')) { await wait(35); return Response.json({ access_token: 'private-token' }); }
    await wait(15);
    return Response.json({ sub: 'private-google-id', email: user.email, email_verified: true, name: user.name });
  });
  const response = await worker.fetch(callback(), env());
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/students');
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.ok(response.headers.getSetCookie().some((c) => c.startsWith('menty_session=') && c.includes('HttpOnly')));
  assert.ok(response.headers.getSetCookie().some((c) => c.startsWith('menty_oauth=;') && c.includes('Max-Age=0')));
  assert.equal(logs[0].outcome, 'signed_in');
  assert.equal(response.headers.get('x-menty-request-id'), logs[0].request_id);
  for (const stage of ['oauth_token', 'oauth_profile', 'user_db', 'session_db', 'total']) {
    assert.equal(typeof logs[0].timings[stage], 'number');
    assert.match(response.headers.get('server-timing'), new RegExp(`${stage};dur=`));
  }
  assert.ok(logs[0].timings.oauth_token >= 25);
  assert.ok(logs[0].timings.user_db >= 10);
  assert.ok(logs[0].timings.total >= logs[0].timings.oauth_token + logs[0].timings.oauth_profile);
  assert.doesNotMatch(JSON.stringify(logs), /private-|client-secret|Private name/);
});

test('Google rejection and invalid state retain the existing failure redirect', async (t) => {
  const logs = [];
  t.mock.method(console, 'info', (line) => logs.push(JSON.parse(line)));
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 400 }));
  const rejected = await worker.fetch(callback(), env());
  assert.equal(rejected.headers.get('location'), '/login?error=auth_failed');
  assert.equal(logs[0].outcome, 'not_signed_in');
  assert.equal(typeof logs[0].timings.oauth_token, 'number');
  assert.equal(logs[0].timings.oauth_profile, undefined);
  const invalid = await worker.fetch(new Request('https://menty.test/api/auth/google/callback?code=private-code'), env());
  assert.equal(invalid.headers.get('location'), '/login?error=auth_failed');
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.doesNotMatch(JSON.stringify(logs), /private-/);
});

test('Unrelated requests are untouched; a failed measured stage is still timed', async (t) => {
  const logs = [];
  t.mock.method(console, 'info', (line) => logs.push(JSON.parse(line)));
  const response = Response.json({ ok: true });
  const unrelated = requestTiming(new Request('https://menty.test/api/files/private-file'));
  assert.equal(unrelated.finish(response), response);
  assert.equal(logs.length, 0);
  const measured = requestTiming(new Request('https://menty.test/api/me'));
  await assert.rejects(measured.measure('session_lookup', async () => { throw new Error('db failed'); }));
  const failure = measured.finish(Response.json({ error: 'error' }, { status: 500 }));
  assert.equal(failure.status, 500);
  assert.equal(logs[0].outcome, 'error');
  assert.equal(typeof logs[0].timings.session_lookup, 'number');
});

test('Browser diagnostics measure JSON parsing and errors without recording response or request bodies', async (t) => {
  globalThis.window = new EventTarget();
  t.after(() => { delete globalThis.window; });
  const logs = [];
  t.mock.method(console, 'info', (...args) => logs.push(args.join(' ')));
  const { api } = await import('../public/js/api.js');
  t.mock.method(globalThis, 'fetch', async () => {
    const response = Response.json(user, { headers: {
      'Server-Timing': 'session_lookup;dur=12.5, total;dur=20',
      'X-Menty-Request-Id': 'abcdef12-1234-1234-1234-abcdef123456',
    } });
    const json = response.json.bind(response);
    response.json = async () => { await wait(25); return json(); };
    return response;
  });
  assert.deepEqual(await api('GET', '/me'), user);
  const entry = window.__mentyDiagnostics.requests[0];
  assert.ok(entry.duration_ms >= 20);
  assert.equal(entry.server_ms.session_lookup, 12.5);
  assert.equal(entry.request_id, 'abcdef12-1234-1234-1234-abcdef123456');
  let unauth = false;
  window.addEventListener('menty:unauth', () => { unauth = true; });
  globalThis.fetch = async () => new Response('', { status: 401 });
  await assert.rejects(api('GET', '/me'), (e) => e.status === 401);
  assert.equal(unauth, true);
  globalThis.fetch = async () => { throw new Error('private-network-detail'); };
  await assert.rejects(api('GET', '/workspaces'));
  assert.equal(window.__mentyDiagnostics.requests.at(-1).status, 0);
  assert.doesNotMatch(JSON.stringify(window.__mentyDiagnostics) + logs.join(''), /private-|Private name/);
});
