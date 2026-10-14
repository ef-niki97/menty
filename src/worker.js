// Menty API: многопользовательский сервис. Вход через Google и Яндекс (плюс пароль администратора как запасной),
// данные каждого ментора изолированы по owner_id, файлы режутся на куски в D1.
// Статику сайта отдаёт сам Cloudflare (см. [assets] в wrangler.toml).

const MAX_FILE = 10 * 1024 * 1024;
const CHUNK = 192 * 1024; // сырых байт в куске; в базе кусок лежит как base64-текст (лимит строки D1 — 2 МБ)
const MAX_DOC = 1024 * 1024;
const SESSION_DAYS = 30;
const COOKIE = 'menty_session';
const OAUTH_COOKIE = 'menty_oauth';
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{10,43}$/; // новые ссылки — 10 символов, старые — 43
const INVITE_RE = /^[A-Za-z0-9_-]{6,43}$/;

const SKILL_IDS = ['visual', 'typo', 'ux', 'proto', 'ds', 'product', 'ia', 'responsive', 'motion', 'a11y',
  'comm', 'pitch', 'feedback', 'time', 'team', 'initiative', 'critical', 'adapt', 'empathy', 'selfdev',
  'prompt', 'ai_research', 'ai_visual', 'ai_proto', 'ai_flow'];
// Что показывать на публичной странице: по умолчанию всё; ментор отключает разделы чекбоксами.
const SHARE_KEYS = ['competencies', 'history', 'goal', 'portfolio', 'cv', 'sessions', 'tasks'];
const cleanOpts = (o) => Object.fromEntries(SHARE_KEYS.map((k) => [k, !(o && o[k] === false)]));
const parseOpts = (t) => { try { return cleanOpts(JSON.parse(t)); } catch { return cleanOpts(null); } };
// Скрытое вырезаем на сервере, а не только прячем в интерфейсе. Договор и личная заметка не публикуются никогда.
function publicView(doc, opts) {
  const { privateNote, contracts, workspaceId, review, ...st } = doc;
  const list = Array.isArray(st.assessments) && st.assessments.length ? st.assessments : [{ id: 'none', date: st.createdAt, scores: {}, comment: '' }];
  if (!opts.competencies) { st.assessments = [{ id: list[list.length - 1].id, date: list[list.length - 1].date, scores: {}, comment: '' }]; st.selfAssessments = []; }
  else if (!opts.history) st.assessments = list.slice(-1);
  if (!opts.goal) st.goal = { position: '', company: '', salary: null, currency: '₽', horizon: '' };
  if (!opts.portfolio) st.portfolios = [];
  if (!opts.cv) st.cvs = [];
  if (!opts.sessions) st.sessions = [];
  if (!opts.tasks) st.tasks = [];
  return { ...st, shareOpts: opts };
}
const isAi = (id) => id === 'prompt' || id.startsWith('ai_');

// Была короткая версия с десятибалльной шкалой (записи с v:2). Возвращаем пятибалльную: хард и софт делим на 2.
function restoreScale(d) {
  let changed = false;
  for (const a of [...(Array.isArray(d.assessments) ? d.assessments : []), ...(Array.isArray(d.selfAssessments) ? d.selfAssessments : [])]) {
    if (!a || a.v !== 2) continue;
    for (const k of Object.keys(a.scores || {})) if (!isAi(k) && a.scores[k] > 0) a.scores[k] = Math.max(1, Math.min(5, Math.round(a.scores[k] / 2)));
    delete a.v; changed = true;
  }
  return changed;
}

// Ограничение частоты запросов (привязки ratelimits из wrangler.toml). Если привязки нет — не ограничиваем (локально и в тестах).
// Счётчики локальны для дата-центра Cloudflare и «мягкие»: это защита от перебора и злоупотреблений, а не точный учёт.
async function limited(env, name, key) {
  const rl = env[name]; if (!rl) return false;
  try { return !(await rl.limit({ key })).success; } catch { return false; }
}
const tooMany = () => json({ error: 'Слишком много запросов, подождите минуту' }, 429, { 'retry-after': '60' });

const enc = new TextEncoder();
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const fail = (status, error) => json({ error }, status);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redirect = (loc, cookies = []) => { const h = new Headers({ location: loc, 'cache-control': 'no-store' }); for (const c of cookies) h.append('set-cookie', c); return new Response(null, { status: 302, headers: h }); };

const toB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const newToken = () => { let t = ''; while (t.length < 10) for (const b of crypto.getRandomValues(new Uint8Array(16))) if (b < 228 && t.length < 10) t += ALPHABET[b % 57]; return t; }; // 10 символов ≈ 58 бит, без неоднозначных символов
const fromB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randToken = () => b64u(crypto.getRandomValues(new Uint8Array(32))); // 256 бит
const sha256hex = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
// Сравнение без утечки по времени: сравниваем SHA-256 от обеих строк одинаковой длины.
async function safeEq(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}

const cookie = (name, value, maxAge, same = 'Strict', path = '/') => `${name}=${value}; HttpOnly; Secure; SameSite=${same}; Path=${path}; Max-Age=${maxAge}`;
const getCookie = (req, name) => (req.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1] || null;

// ---------- сессии и пользователи ----------
// В cookie лежит случайный токен, в базе — только его SHA-256: утечка базы не даёт войти.
async function createSession(env, userId) {
  const t = randToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)').bind(await sha256hex(t), userId, Date.now() + SESSION_DAYS * 864e5).run();
  env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(Date.now()).run().catch(() => {}); // подчищаем просроченные
  return t;
}
async function getUser(req, env) {
  const t = getCookie(req, COOKIE); if (!t || t.length > 100) return null;
  return await env.DB.prepare('SELECT u.id, u.email, u.name, u.avatar, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2').bind(await sha256hex(t), Date.now()).first() || null;
}
const adminEmail = (env) => env.ADMIN_EMAIL.trim().toLowerCase();
async function ensureAdminUser(env) {
  const email = adminEmail(env);
  let u = await env.DB.prepare('SELECT id, email, name, avatar, role FROM users WHERE email = ?1').bind(email).first();
  if (!u) {
    u = { id: crypto.randomUUID(), email, name: 'Админ', avatar: null, role: 'admin' };
    await env.DB.prepare('INSERT INTO users (id, email, name, avatar, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(u.id, u.email, u.name, u.avatar, u.role, new Date().toISOString()).run();
  } else if (u.role !== 'admin') { await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?1").bind(u.id).run(); u.role = 'admin'; }
  return u;
}
// Вход по паролю выключен; включается переменной ALLOW_PASSWORD_LOGIN=1 вместе с секретом ADMIN_PASSWORD (запасной путь).
const allowPassword = (env) => env.ALLOW_PASSWORD_LOGIN === '1' && !!env.ADMIN_PASSWORD;
const signupMode = (env) => (['open', 'invite', 'closed'].includes(env.SIGNUP_MODE) ? env.SIGNUP_MODE : 'invite');
const maxStudents = (env, user) => (user.role === 'admin' ? Infinity : Number(env.MAX_STUDENTS) || 100);
const maxStorage = (env, user) => (user.role === 'admin' ? Infinity : (Number(env.QUOTA_MB) || 200) * 1024 * 1024);

// ---------- схема ----------
const BASE_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, avatar TEXT, role TEXT NOT NULL DEFAULT 'mentor', created_at TEXT NOT NULL, last_login TEXT)",
  'CREATE TABLE IF NOT EXISTS identities (provider TEXT NOT NULL, provider_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (provider, provider_id))',
  'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, created_by TEXT NOT NULL, created_at TEXT NOT NULL, used_by TEXT, used_at TEXT)',
  'CREATE TABLE IF NOT EXISTS file_chunks (id TEXT NOT NULL, n INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (id, n))',
];
// Таблицы с данными менторов: у каждой строки есть владелец (owner_id).
const TENANT_DDL = {
  students: 'CREATE TABLE students (owner_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (owner_id, id))',
  workspaces: 'CREATE TABLE workspaces (owner_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (owner_id, id))',
  shares: 'CREATE TABLE shares (token TEXT PRIMARY KEY, owner_id TEXT NOT NULL, student_id TEXT NOT NULL, opts TEXT, created_at TEXT NOT NULL, UNIQUE (owner_id, student_id))',
  review_links: 'CREATE TABLE review_links (token TEXT PRIMARY KEY, owner_id TEXT NOT NULL, student_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (owner_id, student_id))',
};
const FILES_DDL = 'CREATE TABLE files (id TEXT PRIMARY KEY, owner_id TEXT, type TEXT NOT NULL, size INTEGER NOT NULL, r2 INTEGER NOT NULL DEFAULT 0)'; // r2 = 1: файл лежит в R2, 0 — старым способом, кусками в D1

async function tableCols(env, t) { const { results } = await env.DB.prepare(`PRAGMA table_info(${t})`).all(); return results.map((r) => r.name); }

// Один раз переводим одиночную базу в многопользовательскую: все существующие данные становятся данными администратора.
async function migrateTenancy(env) {
  const admin = await ensureAdminUser(env), stmts = [], q = (s) => env.DB.prepare(s);
  const old = {};
  for (const t of Object.keys(TENANT_DDL)) old[t] = await tableCols(env, t);
  for (const [t, ddl] of Object.entries(TENANT_DDL)) {
    const cols = old[t];
    if (!cols.length) { stmts.push(q(ddl)); continue; }               // новая установка
    if (cols.includes('owner_id')) continue;                          // уже переведено
    stmts.push(q(`ALTER TABLE ${t} RENAME TO ${t}_old`), q(ddl));
    if (t === 'students') stmts.push(q('INSERT INTO students (owner_id, id, data, updated_at) SELECT ?1, id, data, updated_at FROM students_old').bind(admin.id));
    if (t === 'workspaces') stmts.push(q('INSERT INTO workspaces (owner_id, id, name, created_at) SELECT ?1, id, name, created_at FROM workspaces_old').bind(admin.id));
    if (t === 'shares') stmts.push(q(`INSERT INTO shares (token, owner_id, student_id, opts, created_at) SELECT token, ?1, student_id, ${cols.includes('opts') ? 'opts' : 'NULL'}, created_at FROM shares_old`).bind(admin.id));
    if (t === 'review_links') stmts.push(q('INSERT INTO review_links (token, owner_id, student_id, created_at) SELECT token, ?1, student_id, created_at FROM review_links_old').bind(admin.id));
    stmts.push(q(`DROP TABLE ${t}_old`));
  }
  const fcols = await tableCols(env, 'files');
  if (!fcols.length) stmts.push(q(FILES_DDL));
  else if (!fcols.includes('owner_id')) stmts.push(q('ALTER TABLE files ADD COLUMN owner_id TEXT'), q('UPDATE files SET owner_id = ?1 WHERE owner_id IS NULL').bind(admin.id));
  await env.DB.batch(stmts);
  // у администратора всегда есть воркспейс, а старые ученики лежат в нём
  const ws = await defaultWs(env, admin.id);
  await env.DB.prepare("UPDATE students SET data = json_set(data, '$.workspaceId', ?2) WHERE owner_id = ?1 AND json_extract(data, '$.workspaceId') IS NULL").bind(admin.id, ws).run();
  await env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('tenancy', '1')").run();
}

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch(BASE_SCHEMA.map((s) => env.DB.prepare(s)));
  if (!(await env.DB.prepare("SELECT v FROM meta WHERE k = 'tenancy'").first())) {
    try { await migrateTenancy(env); }
    catch (e) { if (!(await env.DB.prepare("SELECT v FROM meta WHERE k = 'tenancy'").first())) throw e; } // параллельный запрос мог уже всё сделать
  }
  if (!(await env.DB.prepare("SELECT v FROM meta WHERE k = 'files_r2'").first())) {
    if (!(await tableCols(env, 'files')).includes('r2')) await env.DB.prepare('ALTER TABLE files ADD COLUMN r2 INTEGER NOT NULL DEFAULT 0').run();
    await env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('files_r2', '1')").run();
  }
  // Один раз откатываем оценки, сохранённые в десятибалльной шкале (старые данные).
  if (!(await env.DB.prepare("SELECT v FROM meta WHERE k = 'scale5_restored'").first())) {
    const { results } = await env.DB.prepare('SELECT owner_id, data FROM students').all(), stmts = [];
    for (const r of results) { const d = JSON.parse(r.data); if (restoreScale(d)) stmts.push(upsert(env, r.owner_id, d)); }
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    await env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('scale5_restored', '1')").run();
  }
  schemaReady = true;
}

// Основной воркспейс пользователя; если нет ни одного — создаём.
async function defaultWs(env, owner) {
  const r = await env.DB.prepare('SELECT id FROM workspaces WHERE owner_id = ?1 ORDER BY created_at, rowid LIMIT 1').bind(owner).first();
  if (r) return r.id;
  const id = newToken();
  await env.DB.prepare('INSERT INTO workspaces (owner_id, id, name, created_at) VALUES (?1, ?2, ?3, ?4)').bind(owner, id, 'Основной', new Date().toISOString()).run();
  return id;
}
// Ученик всегда лежит в существующем воркспейсе владельца: без указания — в основном.
async function placeInWorkspace(env, owner, d) {
  if (!d.workspaceId) { d.workspaceId = await defaultWs(env, owner); return true; }
  return typeof d.workspaceId === 'string' && !!(await env.DB.prepare('SELECT id FROM workspaces WHERE owner_id = ?1 AND id = ?2').bind(owner, d.workspaceId).first());
}
const wsOut = (r) => ({ id: r.id, name: r.name, createdAt: r.created_at });
const wsName = (v) => (typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 60 ? v.trim() : null);

// Файлы лежат в R2 (ключ «владелец/id»), в D1 остаётся только описание. Если привязки R2 нет, работает старый путь: куски base64 в D1.
const r2Key = (owner, id) => `${owner}/${id}`;
async function readLegacy(env, id, size) {
  const { results } = await env.DB.prepare('SELECT data FROM file_chunks WHERE id = ?1 ORDER BY n').bind(id).all();
  const out = new Uint8Array(size); let off = 0;
  for (const row of results) { const part = fromB64(row.data); out.set(part, off); off += part.length; }
  return out;
}
// Переносит старый файл из D1 в R2 (читает куски, кладёт объект, помечает, удаляет куски).
async function moveToR2(env, owner, id, meta, bytes) {
  await env.FILES.put(r2Key(owner, id), bytes, { httpMetadata: { contentType: meta.type } });
  await env.DB.batch([env.DB.prepare('UPDATE files SET r2 = 1 WHERE id = ?1 AND owner_id = ?2').bind(id, owner), env.DB.prepare('DELETE FROM file_chunks WHERE id = ?1').bind(id)]);
}
async function deleteFile(env, owner, id) {
  const f = await env.DB.prepare('SELECT r2 FROM files WHERE id = ?1 AND owner_id = ?2').bind(id, owner).first();
  if (!f) return;
  if (f.r2 && env.FILES) await env.FILES.delete(r2Key(owner, id));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM file_chunks WHERE id = ?1').bind(id),
    env.DB.prepare('DELETE FROM files WHERE id = ?1 AND owner_id = ?2').bind(id, owner),
  ]);
}

const validDoc = (d) => d && typeof d === 'object' && !Array.isArray(d) && typeof d.id === 'string' && ID_RE.test(d.id);
const upsert = (env, owner, d) => env.DB.prepare('INSERT INTO students (owner_id, id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(owner_id, id) DO UPDATE SET data = ?3, updated_at = ?4')
  .bind(owner, d.id, JSON.stringify(d), new Date().toISOString());

async function readJson(req, limit = MAX_DOC) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) throw new Response('bad content-type', { status: 415 });
  const text = await req.text();
  if (text.length > limit) throw new Response('too large', { status: 413 });
  try { return JSON.parse(text); } catch { throw new Response('bad json', { status: 400 }); }
}

// ---------- вход через Google и Яндекс (OAuth 2.0 с PKCE) ----------
const PROVIDERS = {
  google: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', info: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile', extra: { prompt: 'select_account' }, redirectInToken: true, idKey: 'GOOGLE_CLIENT_ID', secretKey: 'GOOGLE_CLIENT_SECRET',
    authHeader: (t) => `Bearer ${t}`,
    profile: (j) => ({ id: j.sub, email: j.email_verified ? j.email : null, name: j.name || j.email, avatar: j.picture || null }),
  },
  yandex: {
    auth: 'https://oauth.yandex.ru/authorize', token: 'https://oauth.yandex.ru/token', info: 'https://login.yandex.ru/info?format=json',
    scope: '', extra: {}, redirectInToken: false, idKey: 'YANDEX_CLIENT_ID', secretKey: 'YANDEX_CLIENT_SECRET', // права задаются в настройках приложения
    authHeader: (t) => `OAuth ${t}`,
    profile: (j) => ({ id: String(j.id), email: j.default_email || null, name: j.display_name || j.real_name || j.login || j.default_email, avatar: j.default_avatar_id && !j.is_avatar_empty ? `https://avatars.yandex.net/get-yapic/${j.default_avatar_id}/islands-200` : null }),
  },
};
const providerOn = (env, name) => !!(env[PROVIDERS[name].idKey] && env[PROVIDERS[name].secretKey]);
const cleanInvite = (s) => { s = (s || '').trim(); return INVITE_RE.test(s) ? s : ''; };

// Находит или создаёт пользователя по профилю провайдера. Новых принимаем по правилам SIGNUP_MODE (по умолчанию — по приглашению).
async function resolveUser(env, provider, prof, invite) {
  const email = prof.email.trim().toLowerCase(), now = new Date().toISOString();
  const ident = await env.DB.prepare('SELECT user_id FROM identities WHERE provider = ?1 AND provider_id = ?2').bind(provider, prof.id).first();
  let user = ident ? await env.DB.prepare('SELECT id, email, name, avatar, role FROM users WHERE id = ?1').bind(ident.user_id).first() : null;
  if (!user) {
    user = await env.DB.prepare('SELECT id, email, name, avatar, role FROM users WHERE email = ?1').bind(email).first(); // тот же подтверждённый адрес — тот же человек
    if (!user) {
      const isAdmin = email === adminEmail(env), mode = signupMode(env);
      if (!isAdmin && mode !== 'open') {
        if (mode === 'closed') return { error: 'signup_closed' };
        if (!invite) return { error: 'invite_required' };
        const claim = await env.DB.prepare('UPDATE invites SET used_by = ?2, used_at = ?3 WHERE code = ?1 AND used_by IS NULL').bind(invite, email, now).run();
        if (claim.meta?.changes !== 1) return { error: 'invite_invalid' };
      }
      user = { id: crypto.randomUUID(), email, name: (prof.name || email).slice(0, 100), avatar: prof.avatar, role: isAdmin ? 'admin' : 'mentor' };
      try { await env.DB.prepare('INSERT INTO users (id, email, name, avatar, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(user.id, user.email, user.name, user.avatar, user.role, now).run(); }
      catch (e) { // не удалось создать аккаунт — возвращаем приглашение, чтобы оно не пропало зря
        if (!isAdmin && mode !== 'open') await env.DB.prepare('UPDATE invites SET used_by = NULL, used_at = NULL WHERE code = ?1').bind(invite).run().catch(() => {});
        throw e;
      }
    }
    await env.DB.prepare('INSERT OR IGNORE INTO identities (provider, provider_id, user_id) VALUES (?1, ?2, ?3)').bind(provider, prof.id, user.id).run();
  }
  await env.DB.prepare('UPDATE users SET last_login = ?2, avatar = COALESCE(avatar, ?3) WHERE id = ?1').bind(user.id, now, prof.avatar).run();
  await defaultWs(env, user.id);
  return { user };
}

async function oauth(req, env, url, name, step) {
  const cfg = PROVIDERS[name];
  if (!providerOn(env, name)) return redirect('/login?error=provider_disabled');
  const id = env[cfg.idKey], secret = env[cfg.secretKey], redirectUri = `${url.origin}/api/auth/${name}/callback`;
  const clear = cookie(OAUTH_COOKIE, '', 0, 'Lax', '/api/auth');
  if (step === 'start') {
    const state = randToken(), verifier = randToken(), invite = cleanInvite(url.searchParams.get('invite'));
    const q = new URLSearchParams({ client_id: id, redirect_uri: redirectUri, response_type: 'code', state, code_challenge: b64u(await crypto.subtle.digest('SHA-256', enc.encode(verifier))), code_challenge_method: 'S256', ...cfg.extra });
    if (cfg.scope) q.set('scope', cfg.scope);
    // cookie с Lax: провайдер возвращает пользователя на наш сайт переходом с другого домена
    return redirect(`${cfg.auth}?${q}`, [cookie(OAUTH_COOKIE, `${state}.${verifier}.${invite}`, 600, 'Lax', '/api/auth')]);
  }
  const [state, verifier, invite = ''] = (getCookie(req, OAUTH_COOKIE) || '').split('.'), code = url.searchParams.get('code');
  if (!code || !state || !verifier || url.searchParams.get('state') !== state) return redirect('/login?error=auth_failed', [clear]);
  let prof;
  try {
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: id, client_secret: secret, code_verifier: verifier });
    if (cfg.redirectInToken) body.set('redirect_uri', redirectUri);
    const tr = await fetch(cfg.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body });
    const tok = tr.ok ? await tr.json() : null; if (!tok?.access_token) return redirect('/login?error=auth_failed', [clear]);
    const ir = await fetch(cfg.info, { headers: { authorization: cfg.authHeader(tok.access_token), accept: 'application/json' } });
    if (!ir.ok) return redirect('/login?error=auth_failed', [clear]);
    prof = cfg.profile(await ir.json());
  } catch (e) { console.error(e); return redirect('/login?error=auth_failed', [clear]); }
  if (!prof?.id || !prof.email) return redirect('/login?error=no_email', [clear]);
  const res = await resolveUser(env, name, prof, cleanInvite(invite));
  if (res.error) return redirect(`/login?error=${res.error}`, [clear]);
  return redirect('/students', [cookie(COOKIE, await createSession(env, res.user.id), SESSION_DAYS * 86400), clear]);
}

async function route(req, env, url) {
  const { pathname: p } = url, m = req.method, ip = req.headers.get('cf-connecting-ip') || 'unknown';
  // вход: не больше AUTH_LIMIT попыток в минуту с одного адреса
  if ((p.startsWith('/api/auth/') && p !== '/api/auth/providers') || p === '/api/login') {
    if (await limited(env, 'AUTH_LIMIT', ip)) return p.startsWith('/api/auth/') ? redirect('/login?error=rate_limited') : tooMany();
  }
  await ensureSchema(env);

  // ----- вход и выход -----
  if (p === '/api/auth/providers' && m === 'GET') return json({ google: providerOn(env, 'google'), yandex: providerOn(env, 'yandex'), password: allowPassword(env), signup: signupMode(env) });
  const oa = p.match(/^\/api\/auth\/(google|yandex)\/(start|callback)$/);
  if (oa && m === 'GET') return oauth(req, env, url, oa[1], oa[2]);

  if (p === '/api/login' && m === 'POST') { // запасной вход администратора по паролю (по умолчанию выключен)
    if (!allowPassword(env)) return fail(404, 'Не найдено');
    const { email, password } = await readJson(req, 4096);
    const valid = typeof email === 'string' && typeof password === 'string';
    // Обе проверки выполняем всегда, чтобы по времени ответа нельзя было понять, что неверно.
    const emailOk = valid && await safeEq(email.trim().toLowerCase(), adminEmail(env));
    const passOk = valid && await safeEq(password, env.ADMIN_PASSWORD);
    if (!(emailOk && passOk)) { await sleep(800); return fail(401, 'Неверная почта или пароль'); }
    const admin = await ensureAdminUser(env); await defaultWs(env, admin.id);
    return json(admin, 200, { 'set-cookie': cookie(COOKIE, await createSession(env, admin.id), SESSION_DAYS * 86400) });
  }
  if (p === '/api/logout' && m === 'POST') {
    const t = getCookie(req, COOKIE); if (t) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256hex(t)).run();
    return json({ ok: true }, 200, { 'set-cookie': cookie(COOKIE, '', 0) });
  }

  // ----- публичные страницы по токенам (без входа) -----
  // Публичная ссылка только для просмотра: отдаём карточку без личной заметки ментора.
  const pub = p.match(/^\/api\/share\/([^/]+)$/);
  if (pub && m === 'GET') {
    if (!TOKEN_RE.test(pub[1])) return fail(404, 'Ссылка недействительна');
    if (await limited(env, 'PUBLIC_LIMIT', ip)) return tooMany();
    const row = await env.DB.prepare('SELECT s.data, h.opts FROM shares h JOIN students s ON s.owner_id = h.owner_id AND s.id = h.student_id WHERE h.token = ?1').bind(pub[1]).first();
    if (!row) return (await limited(env, 'MISS_LIMIT', ip)) ? tooMany() : fail(404, 'Ссылка недействительна'); // частые промахи по токенам — признак перебора
    return json(publicView(JSON.parse(row.data), parseOpts(row.opts)), 200, { 'x-robots-tag': 'noindex, nofollow' });
  }

  // Отзыв менти по отдельной ссылке (после трудоустройства): без входа, один токен — один ученик.
  const rv = p.match(/^\/api\/review\/([^/]+)$/);
  if (rv && (m === 'GET' || m === 'POST')) {
    if (!TOKEN_RE.test(rv[1])) return fail(404, 'Ссылка недействительна');
    if (await limited(env, m === 'POST' ? 'WRITE_LIMIT' : 'PUBLIC_LIMIT', ip) || (m === 'POST' && await limited(env, 'WRITE_LIMIT', `tok:${rv[1]}`))) return tooMany();
    const row = await env.DB.prepare('SELECT s.owner_id, s.data FROM review_links l JOIN students s ON s.owner_id = l.owner_id AND s.id = l.student_id WHERE l.token = ?1').bind(rv[1]).first();
    if (!row) return (await limited(env, 'MISS_LIMIT', ip)) ? tooMany() : fail(404, 'Ссылка недействительна');
    const doc = JSON.parse(row.data);
    if (m === 'POST') {
      const { rating, comment } = await readJson(req, 8192);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail(400, 'Поставьте оценку от 1 до 5');
      if (comment !== undefined && typeof comment !== 'string') return fail(400, 'Некорректный комментарий');
      doc.review = { rating, comment: (comment || '').trim().slice(0, 2000), date: new Date().toISOString() };
      await upsert(env, row.owner_id, doc).run();
      return json({ ok: true });
    }
    return json({ firstName: doc.firstName, lastName: doc.lastName, avatar: doc.avatar || '', review: doc.review ? { rating: doc.review.rating, comment: doc.review.comment, date: doc.review.date } : null }, 200, { 'x-robots-tag': 'noindex, nofollow' });
  }

  // Самооценка менти по публичной ссылке: принимаем только оценки навыков 0–5.
  const self = p.match(/^\/api\/share\/([^/]+)\/self$/);
  if (self && m === 'POST') {
    if (!TOKEN_RE.test(self[1])) return fail(404, 'Ссылка недействительна');
    if (await limited(env, 'WRITE_LIMIT', ip) || await limited(env, 'WRITE_LIMIT', `tok:${self[1]}`)) return tooMany();
    const { scores } = await readJson(req, 4096), clean = {};
    for (const k of SKILL_IDS) {
      const v = scores?.[k]; if (v === undefined) continue;
      if (!Number.isInteger(v) || v < 0 || v > 5) return fail(400, 'Некорректные оценки');
      clean[k] = v;
    }
    if (!Object.values(clean).some((v) => v > 0)) return fail(400, 'Оцените хотя бы один навык');
    const row = await env.DB.prepare('SELECT s.owner_id, s.data, h.opts FROM shares h JOIN students s ON s.owner_id = h.owner_id AND s.id = h.student_id WHERE h.token = ?1').bind(self[1]).first();
    if (!row) return (await limited(env, 'MISS_LIMIT', ip)) ? tooMany() : fail(404, 'Ссылка недействительна');
    if (!parseOpts(row.opts).competencies) return fail(403, 'Оценка по этой ссылке отключена');
    const doc = JSON.parse(row.data);
    doc.selfAssessments = [...(Array.isArray(doc.selfAssessments) ? doc.selfAssessments : []), { id: newToken(), date: new Date().toISOString(), scores: clean }].slice(-20);
    await upsert(env, row.owner_id, doc).run();
    return json({ ok: true });
  }

  // ----- дальше только для вошедших; все запросы ограничены данными владельца -----
  const user = await getUser(req, env);
  if (!user) return fail(401, 'Требуется вход');
  const owner = user.id;
  if (await limited(env, 'API_LIMIT', owner)) return tooMany(); // на аккаунт, чтобы сбойный клиент или скрипт не завалил базу
  if (p === '/api/me' && m === 'GET') return json(user);

  if (p === '/api/account' && m === 'DELETE') { // удаление аккаунта со всеми данными
    if (user.role === 'admin') return fail(403, 'Аккаунт администратора удалить нельзя');
    const { confirm } = await readJson(req, 1024);
    if (typeof confirm !== 'string' || confirm.trim().toLowerCase() !== user.email) return fail(400, 'Введите свою почту для подтверждения');
    if (env.FILES) { // сначала стираем объекты ментора в R2
      let cursor;
      do { const l = await env.FILES.list({ prefix: `${owner}/`, cursor, limit: 1000 }); if (l.objects.length) await env.FILES.delete(l.objects.map((o) => o.key)); cursor = l.truncated ? l.cursor : undefined; } while (cursor);
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM file_chunks WHERE id IN (SELECT id FROM files WHERE owner_id = ?1)').bind(owner),
      env.DB.prepare('DELETE FROM files WHERE owner_id = ?1').bind(owner),
      env.DB.prepare('DELETE FROM shares WHERE owner_id = ?1').bind(owner),
      env.DB.prepare('DELETE FROM review_links WHERE owner_id = ?1').bind(owner),
      env.DB.prepare('DELETE FROM students WHERE owner_id = ?1').bind(owner),
      env.DB.prepare('DELETE FROM workspaces WHERE owner_id = ?1').bind(owner),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(owner),
      env.DB.prepare('DELETE FROM identities WHERE user_id = ?1').bind(owner),
      env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(owner),
    ]);
    return json({ ok: true }, 200, { 'set-cookie': cookie(COOKIE, '', 0) });
  }

  // приглашения для новых менторов — только администратор
  if (p === '/api/invites' && (m === 'GET' || m === 'POST')) {
    if (user.role !== 'admin') return fail(403, 'Недостаточно прав');
    if (m === 'POST') {
      const code = newToken();
      await env.DB.prepare('INSERT INTO invites (code, created_by, created_at) VALUES (?1, ?2, ?3)').bind(code, owner, new Date().toISOString()).run();
      return json({ code });
    }
    const { results } = await env.DB.prepare('SELECT code, created_at, used_by, used_at FROM invites ORDER BY created_at DESC LIMIT 50').all();
    return json(results.map((r) => ({ code: r.code, createdAt: r.created_at, usedBy: r.used_by, usedAt: r.used_at })));
  }
  const iv = p.match(/^\/api\/invites\/([^/]+)$/);
  if (iv && m === 'DELETE') {
    if (user.role !== 'admin') return fail(403, 'Недостаточно прав');
    await env.DB.prepare('DELETE FROM invites WHERE code = ?1 AND used_by IS NULL').bind(iv[1]).run();
    return json({ ok: true });
  }

  // перенос старых файлов из D1 в R2 пачками (только администратор)
  if (p === '/api/admin/migrate-files' && m === 'POST') {
    if (user.role !== 'admin') return fail(403, 'Недостаточно прав');
    if (!env.FILES) return fail(409, 'Хранилище R2 не подключено');
    const { results } = await env.DB.prepare('SELECT id, owner_id, type, size FROM files WHERE r2 = 0 ORDER BY size LIMIT 3').all();
    for (const f of results) await moveToR2(env, f.owner_id, f.id, f, await readLegacy(env, f.id, f.size));
    return json({ moved: results.length, left: (await env.DB.prepare('SELECT COUNT(*) AS n FROM files WHERE r2 = 0').first()).n });
  }

  if (p === '/api/workspaces' && m === 'GET') {
    await defaultWs(env, owner);
    const { results } = await env.DB.prepare('SELECT id, name, created_at FROM workspaces WHERE owner_id = ?1 ORDER BY created_at, rowid').bind(owner).all();
    return json(results.map(wsOut));
  }
  if (p === '/api/workspaces' && m === 'POST') {
    const name = wsName((await readJson(req, 4096)).name); if (!name) return fail(400, 'Введите название (до 60 символов)');
    if ((await env.DB.prepare('SELECT COUNT(*) AS n FROM workspaces WHERE owner_id = ?1').bind(owner).first()).n >= 30) return fail(403, 'Достигнут лимит воркспейсов');
    const row = { id: newToken(), name, created_at: new Date().toISOString() };
    await env.DB.prepare('INSERT INTO workspaces (owner_id, id, name, created_at) VALUES (?1, ?2, ?3, ?4)').bind(owner, row.id, row.name, row.created_at).run();
    return json(wsOut(row));
  }
  let r = p.match(/^\/api\/workspaces\/([^/]+)$/);
  if (r && ID_RE.test(r[1])) {
    const id = r[1], cur = await env.DB.prepare('SELECT id, name, created_at FROM workspaces WHERE owner_id = ?1 AND id = ?2').bind(owner, id).first();
    if (!cur) return fail(404, 'Воркспейс не найден');
    if (m === 'PUT') {
      const name = wsName((await readJson(req, 4096)).name); if (!name) return fail(400, 'Введите название (до 60 символов)');
      await env.DB.prepare('UPDATE workspaces SET name = ?3 WHERE owner_id = ?1 AND id = ?2').bind(owner, id, name).run();
      return json(wsOut({ ...cur, name }));
    }
    if (m === 'DELETE') {
      if ((await env.DB.prepare('SELECT COUNT(*) AS n FROM workspaces WHERE owner_id = ?1').bind(owner).first()).n <= 1) return fail(409, 'Нельзя удалить последний воркспейс');
      if ((await env.DB.prepare("SELECT COUNT(*) AS n FROM students WHERE owner_id = ?1 AND json_extract(data, '$.workspaceId') = ?2").bind(owner, id).first()).n) return fail(409, 'В воркспейсе есть ученики');
      await env.DB.prepare('DELETE FROM workspaces WHERE owner_id = ?1 AND id = ?2').bind(owner, id).run();
      return json({ ok: true });
    }
  }

  if (p === '/api/students' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT data FROM students WHERE owner_id = ?1').bind(owner).all();
    return json(results.map((r) => JSON.parse(r.data)));
  }
  if (p === '/api/students' && m === 'POST') {
    const d = await readJson(req); if (!validDoc(d)) return fail(400, 'Некорректные данные');
    if (!(await placeInWorkspace(env, owner, d))) return fail(400, 'Воркспейс не найден');
    const exists = await env.DB.prepare('SELECT 1 AS x FROM students WHERE owner_id = ?1 AND id = ?2').bind(owner, d.id).first();
    if (!exists && (await env.DB.prepare('SELECT COUNT(*) AS n FROM students WHERE owner_id = ?1').bind(owner).first()).n >= maxStudents(env, user)) return fail(403, 'Достигнут лимит учеников');
    restoreScale(d); await upsert(env, owner, d).run(); return json({ ok: true });
  }
  if (p === '/api/import' && m === 'POST') {
    const { students, workspaces } = await readJson(req, 20 * MAX_DOC);
    if (!Array.isArray(students) || !students.every(validDoc)) return fail(400, 'Некорректный файл');
    const have = new Set((await env.DB.prepare('SELECT id FROM students WHERE owner_id = ?1').bind(owner).all()).results.map((x) => x.id));
    if (have.size + students.filter((d) => !have.has(d.id)).length > maxStudents(env, user)) return fail(403, 'Достигнут лимит учеников');
    for (const x of Array.isArray(workspaces) ? workspaces.slice(0, 30) : []) {
      if (x && typeof x.id === 'string' && ID_RE.test(x.id) && wsName(x.name)) await env.DB.prepare('INSERT OR IGNORE INTO workspaces (owner_id, id, name, created_at) VALUES (?1, ?2, ?3, ?4)').bind(owner, x.id, wsName(x.name), new Date().toISOString()).run();
    }
    for (const d of students) { restoreScale(d); if (!(await placeInWorkspace(env, owner, d))) d.workspaceId = await defaultWs(env, owner); } // неизвестный воркспейс из копии → основной
    for (let i = 0; i < students.length; i += 50) await env.DB.batch(students.slice(i, i + 50).map((d) => upsert(env, owner, d)));
    return json({ ok: true, count: students.length });
  }

  r = p.match(/^\/api\/students\/([^/]+)\/review-link$/);
  if (r && ID_RE.test(r[1]) && (m === 'GET' || m === 'POST')) {
    const id = r[1], q = () => env.DB.prepare('SELECT token FROM review_links WHERE owner_id = ?1 AND student_id = ?2').bind(owner, id).first();
    if (m === 'POST' && !(await q())) {
      if (!(await env.DB.prepare('SELECT 1 AS x FROM students WHERE owner_id = ?1 AND id = ?2').bind(owner, id).first())) return fail(404, 'Ученик не найден');
      await env.DB.prepare('INSERT INTO review_links (token, owner_id, student_id, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(owner_id, student_id) DO NOTHING').bind(newToken(), owner, id, new Date().toISOString()).run();
    }
    return json({ token: (await q())?.token || null });
  }

  r = p.match(/^\/api\/students\/([^/]+)\/share$/);
  if (r && ID_RE.test(r[1])) {
    const id = r[1], q = () => env.DB.prepare('SELECT token, opts FROM shares WHERE owner_id = ?1 AND student_id = ?2').bind(owner, id).first();
    const out = async () => { const x = await q(); return { token: x?.token || null, opts: parseOpts(x?.opts) }; };
    if (m === 'GET') return json(await out());
    if (m === 'PUT') {
      if (!(await q())) return fail(404, 'Ссылка не создана');
      const { opts } = await readJson(req, 4096);
      await env.DB.prepare('UPDATE shares SET opts = ?3 WHERE owner_id = ?1 AND student_id = ?2').bind(owner, id, JSON.stringify(cleanOpts(opts))).run();
      return json(await out());
    }
    if (m === 'POST') {
      if (!(await env.DB.prepare('SELECT 1 AS x FROM students WHERE owner_id = ?1 AND id = ?2').bind(owner, id).first())) return fail(404, 'Ученик не найден');
      await env.DB.prepare('INSERT INTO shares (token, owner_id, student_id, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(owner_id, student_id) DO NOTHING').bind(newToken(), owner, id, new Date().toISOString()).run();
      return json(await out());
    }
    if (m === 'DELETE') { await env.DB.prepare('DELETE FROM shares WHERE owner_id = ?1 AND student_id = ?2').bind(owner, id).run(); return json({ ok: true }); }
  }

  r = p.match(/^\/api\/students\/([^/]+)$/);
  if (r && ID_RE.test(r[1])) {
    const id = r[1];
    if (m === 'PUT') {
      const d = await readJson(req); if (!validDoc(d) || d.id !== id) return fail(400, 'Некорректные данные');
      if (!(await placeInWorkspace(env, owner, d))) return fail(400, 'Воркспейс не найден');
      // Самооценки и отзыв пишет менти через публичную ссылку — устаревший кэш ментора их не затирает.
      const cur = await env.DB.prepare('SELECT data FROM students WHERE owner_id = ?1 AND id = ?2').bind(owner, id).first();
      if (cur) { const old = JSON.parse(cur.data); for (const k of ['selfAssessments', 'review']) { if (old[k]) d[k] = old[k]; else delete d[k]; } }
      else if ((await env.DB.prepare('SELECT COUNT(*) AS n FROM students WHERE owner_id = ?1').bind(owner).first()).n >= maxStudents(env, user)) return fail(403, 'Достигнут лимит учеников');
      restoreScale(d); await upsert(env, owner, d).run(); return json({ ok: true });
    }
    if (m === 'DELETE') {
      const row = await env.DB.prepare('SELECT data FROM students WHERE owner_id = ?1 AND id = ?2').bind(owner, id).first();
      if (row) {
        const doc = JSON.parse(row.data), keys = [...(doc.cvs || []), ...(doc.contracts || [])].map((c) => c.id).filter((k) => typeof k === 'string' && ID_RE.test(k));
        for (const k of keys) await deleteFile(env, owner, k);
        await env.DB.prepare('DELETE FROM shares WHERE owner_id = ?1 AND student_id = ?2').bind(owner, id).run();
        await env.DB.prepare('DELETE FROM review_links WHERE owner_id = ?1 AND student_id = ?2').bind(owner, id).run();
        await env.DB.prepare('DELETE FROM students WHERE owner_id = ?1 AND id = ?2').bind(owner, id).run();
      }
      return json({ ok: true });
    }
  }

  r = p.match(/^\/api\/files\/([^/]+)$/);
  if (r && ID_RE.test(r[1])) {
    const key = r[1];
    if (m === 'PUT') {
      if (await limited(env, 'UPLOAD_LIMIT', owner)) return tooMany();
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.length > MAX_FILE) return fail(413, 'Файл больше 10 МБ');
      const cur = await env.DB.prepare('SELECT owner_id, size FROM files WHERE id = ?1').bind(key).first();
      if (cur && cur.owner_id !== owner) return fail(403, 'Недостаточно прав'); // чужой файл перезаписывать нельзя
      const used = (await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM files WHERE owner_id = ?1').bind(owner).first()).n - (cur?.size || 0);
      if (used + bytes.length > maxStorage(env, user)) return fail(413, 'Превышен лимит хранилища');
      const type = req.headers.get('content-type') || 'application/octet-stream';
      if (env.FILES) {
        await env.FILES.put(r2Key(owner, key), bytes, { httpMetadata: { contentType: type } });
        await env.DB.batch([
          env.DB.prepare('DELETE FROM file_chunks WHERE id = ?1').bind(key),
          env.DB.prepare('INSERT INTO files (id, owner_id, type, size, r2) VALUES (?1, ?2, ?3, ?4, 1) ON CONFLICT(id) DO UPDATE SET type = ?3, size = ?4, r2 = 1').bind(key, owner, type, bytes.length),
        ]);
        return json({ ok: true });
      }
      const stmts = [
        env.DB.prepare('DELETE FROM file_chunks WHERE id = ?1').bind(key),
        env.DB.prepare('INSERT INTO files (id, owner_id, type, size, r2) VALUES (?1, ?2, ?3, ?4, 0) ON CONFLICT(id) DO UPDATE SET type = ?3, size = ?4, r2 = 0').bind(key, owner, type, bytes.length),
      ];
      for (let n = 0, off = 0; off < bytes.length; n++, off += CHUNK) stmts.push(env.DB.prepare('INSERT INTO file_chunks (id, n, data) VALUES (?1, ?2, ?3)').bind(key, n, toB64(bytes.subarray(off, off + CHUNK))));
      for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40));
      return json({ ok: true });
    }
    if (m === 'DELETE') { await deleteFile(env, owner, key); return json({ ok: true }); }
    if (m === 'GET') {
      const meta = await env.DB.prepare('SELECT type, size, r2 FROM files WHERE id = ?1 AND owner_id = ?2').bind(key, owner).first();
      if (!meta) return fail(404, 'Файл не найден');
      const headers = { 'content-type': meta.type, 'content-disposition': 'attachment', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' };
      if (meta.r2) {
        const obj = env.FILES ? await env.FILES.get(r2Key(owner, key)) : null;
        if (!obj) return fail(404, 'Файл не найден');
        return new Response(obj.body, { headers });
      }
      const bytes = await readLegacy(env, key, meta.size);
      if (env.FILES) { try { await moveToR2(env, owner, key, meta, bytes); } catch (e) { console.error(e); } } // старый файл при первом чтении переезжает в R2
      return new Response(bytes, { headers });
    }
  }
  return fail(404, 'Не найдено');
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.hostname === 'www.menty.work') { u.hostname = 'menty.work'; return Response.redirect(u.toString(), 308); } // единый адрес: www → без www
    if (!env.ADMIN_EMAIL) return fail(500, 'Не задан ADMIN_EMAIL');
    try { return await route(req, env, new URL(req.url)); }
    catch (e) { if (e instanceof Response) return e; console.error(e); return fail(500, 'Ошибка сервера'); }
  },
};
