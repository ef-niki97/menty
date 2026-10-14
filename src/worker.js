// Menty API: вход по почте и паролю, менти и файлы CV — в D1 (файлы режутся на куски).
// Статику сайта отдаёт сам Cloudflare (см. [assets] в wrangler.toml).

const MAX_FILE = 10 * 1024 * 1024;
const CHUNK = 192 * 1024; // сырых байт в куске; в базе кусок лежит как base64-текст (лимит строки D1 — 2 МБ)
const MAX_DOC = 1024 * 1024;
const SESSION_DAYS = 30;
const COOKIE = 'menty_session';
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{10,43}$/; // новые ссылки — 10 символов, старые — 43

const enc = new TextEncoder();
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const fail = (status, error) => json({ error }, status);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const toB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const newToken = () => { let t = ''; while (t.length < 10) for (const b of crypto.getRandomValues(new Uint8Array(16))) if (b < 228 && t.length < 10) t += ALPHABET[b % 57]; return t; }; // 10 символов ≈ 58 бит, без неоднозначных символов
const fromB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

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
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, type TEXT NOT NULL, size INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, student_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS file_chunks (id TEXT NOT NULL, n INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (id, n))'),
  ]);
  schemaReady = true;
}

const deleteFile = (env, id) => env.DB.batch([
  env.DB.prepare('DELETE FROM file_chunks WHERE id = ?1').bind(id),
  env.DB.prepare('DELETE FROM files WHERE id = ?1').bind(id),
]);

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

  // Публичная ссылка только для просмотра: отдаём карточку без личной заметки ментора.
  const pub = p.match(/^\/api\/share\/([^/]+)$/);
  if (pub && m === 'GET') {
    if (!TOKEN_RE.test(pub[1])) return fail(404, 'Ссылка недействительна');
    await ensureSchema(env);
    const row = await env.DB.prepare('SELECT s.data FROM shares h JOIN students s ON s.id = h.student_id WHERE h.token = ?1').bind(pub[1]).first();
    if (!row) return fail(404, 'Ссылка недействительна');
    const { privateNote, ...student } = JSON.parse(row.data);
    return json(student, 200, { 'x-robots-tag': 'noindex, nofollow' });
  }

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

  let r = p.match(/^\/api\/students\/([^/]+)\/share$/);
  if (r && ID_RE.test(r[1])) {
    const id = r[1], q = () => env.DB.prepare('SELECT token FROM shares WHERE student_id = ?1').bind(id).first();
    if (m === 'GET') return json({ token: (await q())?.token || null });
    if (m === 'POST') {
      if (!(await env.DB.prepare('SELECT id FROM students WHERE id = ?1').bind(id).first())) return fail(404, 'Ученик не найден');
      await env.DB.prepare('INSERT INTO shares (token, student_id, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(student_id) DO NOTHING').bind(newToken(), id, new Date().toISOString()).run();
      return json({ token: (await q()).token });
    }
    if (m === 'DELETE') { await env.DB.prepare('DELETE FROM shares WHERE student_id = ?1').bind(id).run(); return json({ ok: true }); }
  }

  r = p.match(/^\/api\/students\/([^/]+)$/);
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
        for (const k of keys) await deleteFile(env, k);
        await env.DB.prepare('DELETE FROM shares WHERE student_id = ?1').bind(id).run();
        await env.DB.prepare('DELETE FROM students WHERE id = ?1').bind(id).run();
      }
      return json({ ok: true });
    }
  }

  r = p.match(/^\/api\/files\/([^/]+)$/);
  if (r && ID_RE.test(r[1])) {
    const key = r[1];
    if (m === 'PUT') {
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.length > MAX_FILE) return fail(413, 'Файл больше 10 МБ');
      const stmts = [
        env.DB.prepare('DELETE FROM file_chunks WHERE id = ?1').bind(key),
        env.DB.prepare('INSERT INTO files (id, type, size) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET type = ?2, size = ?3')
          .bind(key, req.headers.get('content-type') || 'application/octet-stream', bytes.length),
      ];
      for (let n = 0, off = 0; off < bytes.length; n++, off += CHUNK) stmts.push(env.DB.prepare('INSERT INTO file_chunks (id, n, data) VALUES (?1, ?2, ?3)').bind(key, n, toB64(bytes.subarray(off, off + CHUNK))));
      for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40));
      return json({ ok: true });
    }
    if (m === 'GET') {
      const meta = await env.DB.prepare('SELECT type, size FROM files WHERE id = ?1').bind(key).first();
      if (!meta) return fail(404, 'Файл не найден');
      const { results } = await env.DB.prepare('SELECT data FROM file_chunks WHERE id = ?1 ORDER BY n').bind(key).all();
      const out = new Uint8Array(meta.size); let off = 0;
      for (const row of results) { const part = fromB64(row.data); out.set(part, off); off += part.length; }
      return new Response(out, { headers: { 'content-type': meta.type, 'content-disposition': 'attachment', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' } });
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
