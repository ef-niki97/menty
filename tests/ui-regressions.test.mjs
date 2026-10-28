import test from 'node:test';
import assert from 'node:assert/strict';
import { today, fmtDate } from '../public/js/ui.js';
import { radar } from '../public/js/radar.js';
import { blend } from '../public/js/metrics.js';

test('Calendar dates remain local on both sides of UTC midnight', (t) => {
  const previous = process.env.TZ;
  t.after(() => { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; });
  process.env.TZ = 'Asia/Nicosia';
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-28T22:30:00Z').getTime() });
  assert.equal(today(), '2026-10-29');
  process.env.TZ = 'America/Los_Angeles';
  assert.match(fmtDate('2026-10-29'), /^29 /);
  t.mock.timers.setTime(new Date('2026-10-29T01:00:00Z').getTime());
  assert.equal(today(), '2026-10-28');
});

test('Average assessment tooltips display fractional scores without undefined labels', () => {
  const html = radar([{ kind: 'now', scores: blend({ visual: 2 }, { visual: 3 }) }]);
  assert.doesNotMatch(html, /undefined|NaN/);
  assert.match(html, /2,5\/5<\/title>/);
});

test('Profile refresh detects new self assessments when the 20-entry history is full', async (t) => {
  globalThis.window = new EventTarget();
  t.after(() => { delete globalThis.window; });
  t.mock.method(console, 'info', () => {});
  let list = [{ id: 'test', workspaceId: 'ws', privateNote: 'Keep local note', selfAssessments: Array.from({ length: 20 }, (_, i) => ({ id: String(i), scores: { visual: 2 } })) }];
  t.mock.method(globalThis, 'fetch', async (url) => Response.json(url.endsWith('/workspaces') ? [{ id: 'ws' }] : list));
  const store = await import('../public/js/store.js');
  await store.initStore();
  list = [{ ...list[0], privateNote: 'Stale server note', selfAssessments: [...list[0].selfAssessments.slice(1), { id: '20', scores: { visual: 5 } }] }];
  assert.equal(await store.refreshSelf('test'), true);
  assert.equal(store.getStudent('test').selfAssessments.at(-1).scores.visual, 5);
  assert.equal(store.getStudent('test').privateNote, 'Keep local note');
  assert.equal(await store.refreshSelf('test'), false);
});
