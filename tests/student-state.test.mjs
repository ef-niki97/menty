import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES, RESULTS, mentorshipStatus, studentResult } from '../public/js/config.js';

test('Legacy employment retains its outcome without mutating stored data', () => {
  const original = Object.freeze({ status: 'hired', updatedAt: '2026-01-01', review: { rating: 5 } });
  assert.equal(mentorshipStatus(original), 'done');
  assert.equal(studentResult(original), 'hired');
  assert.equal(original.status, 'hired');
  assert.equal(original.updatedAt, '2026-01-01');
  assert.equal(original.review.rating, 5);
});
test('Mentorship status and outcome remain independent for every supported combination', () => {
  for (const status of Object.keys(STATUSES)) for (const result of Object.keys(RESULTS)) {
    const stored = JSON.parse(JSON.stringify({ status, result }));
    assert.equal(mentorshipStatus(stored), status);
    assert.equal(studentResult(stored), result);
  }
  assert.equal(studentResult({ status: 'hired', result: 'achieved' }), 'achieved');
});
test('Finishing mentorship does not infer that its goal was reached', () => {
  assert.equal(studentResult({ status: 'done' }), 'progress');
  assert.equal(mentorshipStatus({ status: 'paused' }), 'paused');
  assert.equal(studentResult({ status: 'paused' }), 'progress');
  assert.equal(mentorshipStatus({}), 'active');
  assert.equal(studentResult({}), 'progress');
});

test('The store preserves legacy imports and writes both independent fields for a new student', async (t) => {
  globalThis.window = new EventTarget();
  t.after(() => { delete globalThis.window; });
  t.mock.method(console, 'info', () => {});
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'POST') { writes.push(JSON.parse(options.body)); return Response.json({ ok: true }); }
    return Response.json(url.endsWith('/workspaces') ? [{ id: 'workspace' }] : [{ id: 'old', workspaceId: 'workspace', status: 'hired', updatedAt: '2025-01-01' }]);
  });
  const store = await import('../public/js/store.js');
  await store.initStore();
  assert.equal(store.getStudent('old').status, 'hired');
  assert.equal(studentResult(store.getStudent('old')), 'hired');
  assert.equal(store.getStudent('old').updatedAt, '2025-01-01');
  await store.addStudent({ firstName: 'Тест', lastName: 'Менти', grade: 'Junior', status: 'paused', result: 'hired', scores: {} });
  assert.equal(writes[0].status, 'paused');
  assert.equal(writes[0].result, 'hired');
  assert.equal(writes[0].workspaceId, 'workspace');
  assert.equal(JSON.parse(store.exportJson()).students.find((s) => s.id === writes[0].id).result, 'hired');
});
