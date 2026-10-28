import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import worker from '../src/worker.js';

// Execute the real schema and SQL in memory; replace only Cloudflare's D1/R2 bindings.
function setup(t) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_baseline.sql', import.meta.url), 'utf8'));
  t.after(() => db.close());
  t.mock.method(console, 'info', () => {});
  const objects = new Map();
  const env = { ADMIN_EMAIL: 'admin@example.test', DB: {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        statement() { const s = db.prepare(sql); s.setAllowBareNamedParameters(true); return [s, Object.fromEntries(args.map((v, i) => [String(i + 1), v]))]; },
        async first() { const [s, p] = this.statement(); return s.get(p) || null; },
        async all() { const [s, p] = this.statement(); return { results: s.all(p) }; },
        async run() { const [s, p] = this.statement(); return { meta: s.run(p), success: true }; },
      };
    },
    async batch(statements) { return Promise.all(statements.map((s) => s.run())); },
  }, FILES: {
    async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); },
    async get(key) { return objects.has(key) ? { body: objects.get(key) } : null; },
    async delete(key) { for (const k of [].concat(key)) objects.delete(k); },
  } };
  for (const owner of ['alice', 'bob']) {
    db.prepare('INSERT INTO users (id,email,name,role,created_at) VALUES (?,?,?,?,?)').run(owner, `${owner}@example.test`, owner, 'mentor', '2026-01-01');
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(owner).digest('hex'), owner, Date.now() + 60000);
    db.prepare('INSERT INTO workspaces VALUES (?,?,?,?)').run(owner, 'workspace', 'Основной', '2026-01-01');
  }
  async function request(path, { method = 'GET', body, owner = 'alice', raw = false, status = 200 } = {}) {
    const headers = owner ? { cookie: `menty_session=${owner}` } : {};
    if (body !== undefined) headers['content-type'] = raw ? 'text/plain' : 'application/json';
    const response = await worker.fetch(new Request(`https://menty.test/api${path}`, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) }), env);
    assert.equal(response.status, status, `${method} ${path}`);
    return response;
  }
  return { request, objects, db };
}
const student = () => ({ id: 'student', workspaceId: 'workspace', firstName: 'Тест', lastName: 'Менти', grade: 'Junior', status: 'active', result: 'progress', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', goal: { position: 'Designer' }, portfolios: [], cvs: [], contracts: [], sessions: [], tasks: [], privateNote: 'PRIVATE', assessments: [{ id: 'first', date: '2026-01-01', scores: { visual: 2 } }, { id: 'last', date: '2026-02-01', scores: { visual: 4 } }] });
const json = async (promise) => (await promise).json();

test('Authentication, workspace and student CRUD keep accounts isolated', async (t) => {
  const { request } = setup(t);
  await request('/students', { owner: null, status: 401 });
  assert.equal((await json(request('/me'))).id, 'alice');
  const ws = await json(request('/workspaces', { method: 'POST', body: { name: 'Test' } }));
  await request(`/workspaces/${ws.id}`, { method: 'PUT', body: { name: 'Renamed' } });
  await request(`/workspaces/${ws.id}`, { method: 'PUT', body: { name: 'Stolen' }, owner: 'bob', status: 404 });
  const s = { ...student(), workspaceId: ws.id };
  await request('/students', { method: 'POST', body: s });
  assert.equal((await json(request('/students'))).length, 1);
  assert.deepEqual(await json(request('/students', { owner: 'bob' })), []);
  await request(`/workspaces/${ws.id}`, { method: 'DELETE', status: 409 });
  await request('/students/student', { method: 'PUT', body: { ...s, status: 'paused', result: 'hired' } });
  const saved = (await json(request('/students')))[0];
  assert.equal(saved.status, 'paused'); assert.equal(saved.result, 'hired');
  await request('/students/student', { method: 'DELETE', owner: 'bob' });
  assert.equal((await json(request('/students'))).length, 1);
  await request('/students/student', { method: 'DELETE' });
  await request(`/workspaces/${ws.id}`, { method: 'DELETE' });
  await request('/workspaces/workspace', { method: 'DELETE', status: 409 });
  await request('/logout', { method: 'POST', body: {} });
  await request('/me', { status: 401 });
});

test('Public profile options remove private data and assessment history on the server', async (t) => {
  const { request } = setup(t);
  const s = { ...student(), selfAssessments: [{ id: 'self1', scores: { visual: 1 } }, { id: 'self2', scores: { visual: 3 } }], review: { rating: 5 }, contracts: [{ id: 'secret' }], tasks: [{ id: 'task', text: 'Task' }], sessions: [{ id: 'session', date: '2026-01-01', text: 'Meeting' }] };
  await request('/students', { method: 'POST', body: s });
  const { token } = await json(request('/students/student/share', { method: 'POST', body: {} }));
  let shared = await json(request(`/share/${token}`, { owner: null }));
  for (const key of ['privateNote', 'contracts', 'workspaceId', 'review']) assert.equal(key in shared, false);
  await request('/students/student/share', { method: 'PUT', body: { opts: { history: false, sessions: false, tasks: false, goal: false, cv: false, portfolio: false } } });
  shared = await json(request(`/share/${token}`, { owner: null }));
  assert.equal(shared.assessments.length, 1); assert.equal(shared.selfAssessments.length, 1);
  assert.deepEqual(shared.tasks, []); assert.deepEqual(shared.sessions, []); assert.equal(shared.goal.position, '');
  await request('/students/student/share', { method: 'PUT', body: { opts: { competencies: false } } });
  shared = await json(request(`/share/${token}`, { owner: null }));
  assert.deepEqual(shared.assessments[0].scores, {}); assert.deepEqual(shared.selfAssessments, []);
  await request(`/share/${token}/self`, { owner: null, method: 'POST', body: { scores: { visual: 3 } }, status: 403 });
  await request('/students/student/share', { method: 'DELETE' });
  await request(`/share/${token}`, { owner: null, status: 404 });
});

test('Self assessments and reviews survive stale mentor saves, update the date and disappear after deletion', async (t) => {
  const { request } = setup(t);
  const s = student(); await request('/students', { method: 'POST', body: s });
  const { token } = await json(request('/students/student/share', { method: 'POST', body: {} }));
  const review = await json(request('/students/student/review-link', { method: 'POST', body: {} }));
  await request(`/share/${token}/self`, { owner: null, method: 'POST', body: { scores: { visual: 6 } }, status: 400 });
  await request(`/share/${token}/self`, { owner: null, method: 'POST', body: { scores: {} }, status: 400 });
  await request(`/share/${token}/self`, { owner: null, method: 'POST', body: { scores: { visual: 3, unrecognized: 5 } } });
  await request(`/review/${review.token}`, { owner: null, method: 'POST', body: { rating: 0 }, status: 400 });
  await request(`/review/${review.token}`, { owner: null, method: 'POST', body: { rating: 5, comment: ' Спасибо ' } });
  const fresh = (await json(request('/students')))[0];
  assert.ok(fresh.updatedAt > s.updatedAt); assert.equal(fresh.review.comment, 'Спасибо');
  assert.deepEqual(fresh.selfAssessments[0].scores, { visual: 3 });
  await request('/students/student', { method: 'PUT', body: { ...s, updatedAt: new Date().toISOString(), role: 'Designer' } });
  const saved = (await json(request('/students')))[0];
  assert.deepEqual(saved.review, fresh.review); assert.deepEqual(saved.selfAssessments, fresh.selfAssessments);
  await request('/students/student', { method: 'DELETE' });
  await request(`/share/${token}`, { owner: null, status: 404 });
  await request(`/review/${review.token}`, { owner: null, status: 404 });
});

test('Files round trip through R2, reject cross-account reads/writes and are cleaned with the student', async (t) => {
  const { request, objects } = setup(t);
  await request('/files/cv-test', { method: 'PUT', body: 'CV test', raw: true });
  assert.equal(await (await request('/files/cv-test')).text(), 'CV test');
  await request('/files/cv-test', { owner: null, status: 401 });
  await request('/files/cv-test', { owner: 'bob', status: 404 });
  await request('/files/cv-test', { owner: 'bob', method: 'PUT', body: 'Other', raw: true, status: 403 });
  await request('/files/cv-test', { owner: 'bob', method: 'DELETE' });
  assert.equal(objects.size, 1);
  await request('/students', { method: 'POST', body: { ...student(), cvs: [{ id: 'cv-test', name: 'CV.txt' }] } });
  await request('/students/student', { method: 'DELETE' });
  assert.equal(objects.size, 0); await request('/files/cv-test', { status: 404 });
});

test('Invalid JSON shapes return client errors, imports retain legacy status and valid data', async (t) => {
  const { request } = setup(t);
  for (const body of [null, [], 'text', 12]) await request('/workspaces', { method: 'POST', body, status: 400 });
  await request('/students', { method: 'POST', body: { id: '../bad' }, status: 400 });
  await request('/import', { method: 'POST', body: { students: [{ id: 'valid-id' }] }, status: 400 });
  await request('/import', { method: 'POST', body: { students: [{ ...student(), assessments: [] }] }, status: 400 });
  await request('/import', { method: 'POST', body: { students: [{ ...student(), tasks: [{ id: '" onclick="alert(1)', text: 'Bad ID' }] }] }, status: 400 });
  await request('/import', { method: 'POST', body: { students: [{ ...student(), status: 'hired' }] } });
  const saved = (await json(request('/students')))[0];
  assert.equal(saved.status, 'hired'); assert.deepEqual(saved.assessments, student().assessments);
  await request('/workspaces', { method: 'POST', body: { name: '  ' }, status: 400 });
});

test('All demo profiles pass validation and survive a backup round trip', async (t) => {
  globalThis.window = new EventTarget();
  t.after(() => { delete globalThis.window; });
  const { demoStudents } = await import('../public/js/demo.js');
  const { request } = setup(t);
  const profiles = demoStudents().map((s) => ({ ...s, workspaceId: 'workspace' }));
  await request('/import', { method: 'POST', body: { students: profiles } });
  const saved = await json(request('/students'));
  assert.equal(saved.length, profiles.length);
  await request('/import', { method: 'POST', body: { students: saved } });
  assert.deepEqual(await json(request('/students')), saved);
});
