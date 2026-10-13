// Menty API: вход по почте и паролю, менти в D1 (JSON-документы), файлы CV в R2.
// Статику сайта отдаёт сам Cloudflare (см. [assets] в wrangler.toml).

const MAX_FILE = 15 * 1024 * 1024;
const MAX_DOC = 1024 * 1024;
const SESSION_DAYS = 30;
const COOKIE = 'menty_session';
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const enc = new TextEncoder();
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const fail = (status, error) => json({ error }, status);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
// Сравнение без утечки по времени: сравниваем SHA-256 от обеих строк одинаковой длины.
async function safeEq(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}

async function makeToken(env) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  return `${exp}.${await hmac(env.SESSION_SECRET, `session:${exp}`)}`;
}
async function isAuthed(req, env) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  return safeEq(sig, await hmac(env.SESSION_SECRET, `session:${exp}`));
}
const cookie = (value, maxAge) => `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
  schemaReady = true;
}

const validDoc = (d) => d && typeof d === 'object' && !Array.isArray(d) && typeof d.id === 'string' && ID_RE.test(d.id);
const upsert = (env, d) => env.DB.prepare('INSERT INTO students (id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET data = ?2, updated_at = ?3')
  .bind(d.id, JSON.stringify(d), new Date().toISOString());

async function readJson(req, limit = MAX_DOC) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) throw new Response('bad content-type', { status: 415 });
  const text = await req.text();
  if (text.length > limit) throw new Response('too large', { status: 413 });
  try { return JSON.parse(text); } catch { throw new Response('bad json', { status: 400 }); }
}

async function route(req, env, url) {
  const { pathname: p } = url, m = req.method;

  if (p === '/api/login' && m === 'POST') {
    const { email, password } = await readJson(req, 4096);
    const valid = typeof email === 'string' && typeof password === 'string';
    // Обе проверки выполняем всегда, чтобы по времени ответа нельзя было понять, что неверно.
    const emailOk = valid && await safeEq(email.trim().toLowerCase(), env.ADMIN_EMAIL.toLowerCase());
    const passOk = valid && await safeEq(password, env.ADMIN_PASSWORD);
    const ok = emailOk && passOk;
    if (!ok) { await sleep(800); return fail(401, 'Неверная почта или пароль'); }
    return json({ email: env.ADMIN_EMAIL }, 200, { 'set-cookie': cookie(await makeToken(env), SESSION_DAYS * 86400) });
  }
  if (p === '/api/logout' && m === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) });

  if (!(await isAuthed(req, env))) return fail(401, 'Требуется вход');
  if (p === '/api/me' && m === 'GET') return json({ email: env.ADMIN_EMAIL });

  await ensureSchema(env);

  if (p === '/api/students' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT data FROM students').all();
    return json(results.map((r) => JSON.parse(r.data)));
  }
  if (p === '/api/students' && m === 'POST') {
    const d = await readJson(req); if (!validDoc(d)) return fail(400, 'Некорректные данные');
    await upsert(env, d).run(); return json({ ok: true });
  }
  if (p === '/api/import' && m === 'POST') {
    const { students } = await readJson(req, 20 * MAX_DOC);
    if (!Array.isArray(students) || !students.every(validDoc)) return fail(400, 'Некорректный файл');
    for (let i = 0; i < students.length; i += 50) await env.DB.batch(students.slice(i, i + 50).map((d) => upsert(env, d)));
    return json({ ok: true, count: students.length });
  }

  let r = p.match(/^\/api\/students\/([^/]+)$/);
  if (r && ID_RE.test(r[1])) {
    const id = r[1];
    if (m === 'PUT') {
      const d = await readJson(req); if (!validDoc(d) || d.id !== id) return fail(400, 'Некорректные данные');
      await upsert(env, d).run(); return json({ ok: true });
    }
    if (m === 'DELETE') {
      const row = await env.DB.prepare('SELECT data FROM students WHERE id = ?1').bind(id).first();
      if (row) {
        const keys = (JSON.parse(row.data).cvs || []).map((c) => c.id).filter((k) => typeof k === 'string' && ID_RE.test(k));
        if (keys.length) await env.FILES.delete(keys);
        await env.DB.prepare('DELETE FROM students WHERE id = ?1').bind(id).run();
      }
      return json({ ok: true });
    }
  }

  r = p.match(/^\/api\/files\/([^/]+)$/);
  if (r && ID_RE.test(r[1])) {
    const key = r[1];
    if (m === 'PUT') {
      const body = await req.arrayBuffer();
      if (body.byteLength > MAX_FILE) return fail(413, 'Файл больше 15 МБ');
      await env.FILES.put(key, body, { httpMetadata: { contentType: req.headers.get('content-type') || 'application/octet-stream' } });
      return json({ ok: true });
    }
    if (m === 'GET') {
      const obj = await env.FILES.get(key); if (!obj) return fail(404, 'Файл не найден');
      return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', 'content-disposition': 'attachment', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' } });
    }
  }
  return fail(404, 'Не найдено');
}

export default {
  async fetch(req, env) {
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET || !env.ADMIN_EMAIL) return fail(500, 'Не заданы секреты ADMIN_PASSWORD и SESSION_SECRET');
    try { return await route(req, env, new URL(req.url)); }
    catch (e) { if (e instanceof Response) return e; console.error(e); return fail(500, 'Ошибка сервера'); }
  },
};
