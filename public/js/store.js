// Слой данных. Источник правды — сервер (D1 + R2), см. src/worker.js.
// Список учеников держим в памяти: чтение синхронное, а каждая запись сразу уходит на сервер.
import { api } from './api.js';
import { slugify, linkedInUrl } from './ui.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()).replace('.', ''));
const now = () => new Date().toISOString();

let cache = [];
let spaces = []; // воркспейсы; ученики лежат в одном из них (student.workspaceId)
let wsId = '';
const WS_KEY = 'menty_ws'; // выбранный воркспейс помним в браузере
const rememberWs = () => { try { localStorage.setItem(WS_KEY, wsId); } catch { /* без хранилища выберется первый */ } };
let queue = Promise.resolve(); // записи идут по очереди, чтобы порядок сохранялся
const fail = (msg) => window.dispatchEvent(new CustomEvent('menty:error', { detail: msg }));
const sync = (fn) => { queue = queue.then(fn).catch((e) => { if (e.status !== 401) fail('Не удалось сохранить на сервере, проверьте соединение и обновите страницу'); console.error(e); }); return queue; };
const save = (s) => sync(() => api('PUT', `/students/${s.id}`, s));

export async function initStore() {
  [cache, spaces] = await Promise.all([api('GET', '/students'), api('GET', '/workspaces')]);
  let saved = ''; try { saved = localStorage.getItem(WS_KEY) || ''; } catch { /* нет доступа к хранилищу */ }
  wsId = spaces.some((w) => w.id === saved) ? saved : spaces[0]?.id || '';
}
export const resetStore = () => { cache = []; spaces = []; wsId = ''; };

// ---------- воркспейсы ----------
export const workspaces = () => spaces;
export const currentWs = () => spaces.find((w) => w.id === wsId) || spaces[0] || null;
export async function renameWorkspace(id, name) {
  const w = await api('PUT', `/workspaces/${id}`, { name }); const x = spaces.find((s) => s.id === id); if (x) x.name = w.name;
}
export async function deleteWorkspace(id) {
  await api('DELETE', `/workspaces/${id}`); spaces = spaces.filter((w) => w.id !== id);
  if (wsId === id) { wsId = spaces[0]?.id || ''; rememberWs(); }
}
export const setWs = (id) => { if (spaces.some((w) => w.id === id)) { wsId = id; rememberWs(); } };
export async function createWorkspace(name) {
  const w = await api('POST', '/workspaces', { name }); spaces.push(w); wsId = w.id; rememberWs(); return w;
}

// ---------- файлы ----------
export const putFile = (id, blob) => api('PUT', `/files/${id}`, blob);
export const getFile = async (id) => (await api('GET', `/files/${id}`, undefined, true)).blob();

// ---------- чтение ----------
export const allStudents = () => cache;
export const students = () => cache.filter((s) => s.workspaceId === currentWs()?.id); // только текущий воркспейс
export const getStudent = (id) => cache.find((s) => s.id === id);

// ---------- запись ----------
function mutate(id, fn) { const s = getStudent(id); if (!s) return; fn(s); s.updatedAt = now(); save(s); return s; }

// Адрес карточки — фамилия латиницей; при совпадении добавляем номер.
function newId(lastName) {
  const base = slugify(lastName); if (!base) return uid();
  let id = base, n = 2; while (cache.some((s) => s.id === id)) id = `${base}-${n++}`;
  return id;
}
export async function addStudent(d) {
  const t = now();
  const s = {
    id: newId(d.lastName), workspaceId: currentWs()?.id, createdAt: t, updatedAt: t,
    firstName: d.firstName.trim(), lastName: d.lastName.trim(),
    grade: d.grade, status: d.status || 'active', avatar: d.avatar || '',
    linkedin: linkedInUrl(d.linkedin) || '',
    jobless: !!d.jobless, company: d.jobless ? '' : d.company?.trim() || '', role: d.jobless ? '' : d.role?.trim() || '',
    goal: { position: d.targetRole?.trim() || '', company: d.targetCompany?.trim() || '', salary: d.salary ? Number(d.salary) : null, currency: d.currency || '₽', horizon: d.horizon || '' },
    portfolios: [], cvs: [], contracts: [], sessions: [], tasks: [],
    assessments: [{ id: uid(), date: t, scores: { ...d.scores }, comment: 'Первичная оценка' }],
    privateNote: d.privateNote?.trim() || '',
  };
  if (d.portfolio) s.portfolios.push({ id: uid(), url: d.portfolio, title: 'Портфолио', note: '', addedAt: t });
  if (d.cv) { const id = uid(); await putFile(id, d.cv); s.cvs.push({ id, name: d.cv.name, size: d.cv.size, type: d.cv.type, addedAt: t }); }
  if (d.contract) { const id = uid(); await putFile(id, d.contract); s.contracts.push({ id, name: d.contract.name, size: d.contract.size, type: d.contract.type, addedAt: t }); }
  await api('POST', '/students', s);
  cache.push(s); return s;
}
export const updateStudent = (id, patch) => mutate(id, (s) => Object.assign(s, patch));
export const addAssessment = (id, scores, comment) => mutate(id, (s) => s.assessments.push({ id: uid(), date: now(), scores: { ...scores }, comment: comment?.trim() || '' }));
// Исправление текущей оценки сохраняет её дату и место в истории.
export const updateAssessment = (id, assessmentId, scores, comment) => mutate(id, (s) => {
  const a = s.assessments.find((a) => a.id === assessmentId);
  if (a) { a.scores = { ...scores }; a.comment = comment?.trim() || ''; }
});
// Новая версия портфолио становится актуальной, предыдущие остаются в истории.
export const addPortfolio = (id, p) => mutate(id, (s) => {
  s.portfolios.push({ id: uid(), url: p.url, title: p.title?.trim() || 'Портфолио', note: p.note?.trim() || '', addedAt: now() });
  delete s.portfolioActive;
});
export const activePortfolioId = (s) => s.portfolios.some((p) => p.id === s.portfolioActive) ? s.portfolioActive : s.portfolios[s.portfolios.length - 1]?.id;
export const setActivePortfolio = (id, pid) => mutate(id, (s) => { if (s.portfolios.some((p) => p.id === pid)) s.portfolioActive = pid; });
export const removePortfolio = (id, pid) => mutate(id, (s) => {
  s.portfolios = s.portfolios.filter((p) => p.id !== pid);
  if (s.portfolioActive === pid) delete s.portfolioActive;
});
// Какой файл «актуальный»: выбранный ментором, а если не выбран — самый новый.
const ACTIVE_KEY = { cvs: 'cvActive', contracts: 'contractActive' };
export const activeFileId = (s, kind) => { const list = s[kind] || [], a = s[ACTIVE_KEY[kind]]; return list.some((x) => x.id === a) ? a : list[list.length - 1]?.id; };
export const setActiveFile = (id, kind, fid) => mutate(id, (s) => { s[ACTIVE_KEY[kind]] = fid; });
export async function removeFile(id, kind, fid) {
  await api('DELETE', `/files/${fid}`); // сначала на сервере, чтобы карточка не потеряла ссылку при ошибке
  return mutate(id, (s) => { s[kind] = (s[kind] || []).filter((x) => x.id !== fid); if (s[ACTIVE_KEY[kind]] === fid) delete s[ACTIVE_KEY[kind]]; });
}
export async function addCv(id, file) {
  const fid = uid(); await putFile(fid, file);
  return mutate(id, (s) => s.cvs.push({ id: fid, name: file.name, size: file.size, type: file.type, addedAt: now() }));
}
export async function addContract(id, file) {
  const fid = uid(); await putFile(fid, file);
  return mutate(id, (s) => { (s.contracts ||= []).push({ id: fid, name: file.name, size: file.size, type: file.type, addedAt: now() }); });
}
export const addSession = (id, { date, text }) => mutate(id, (s) => s.sessions.push({ id: uid(), date, text: text.trim() }));
export const removeSession = (id, sid) => mutate(id, (s) => { s.sessions = s.sessions.filter((x) => x.id !== sid); });
export const addTask = (id, text) => mutate(id, (s) => s.tasks.push({ id: uid(), text: text.trim(), done: false, createdAt: now() }));
export const updateTask = (id, tid, text) => mutate(id, (s) => {
  const t = s.tasks.find((x) => x.id === tid);
  if (t && text.trim()) t.text = text.trim();
});
export const toggleTask = (id, tid) => mutate(id, (s) => { const t = s.tasks.find((x) => x.id === tid); if (t) t.done = !t.done; });
export const removeTask = (id, tid) => mutate(id, (s) => { s.tasks = s.tasks.filter((x) => x.id !== tid); });
export async function removeStudent(id) {
  await queue; await api('DELETE', `/students/${id}`); // сервер удалит и файлы CV
  cache = cache.filter((x) => x.id !== id);
}

// ---------- резервная копия (файлы CV в неё не входят) ----------
export const exportJson = () => JSON.stringify({ app: 'menty', version: 2, exportedAt: now(), workspaces: spaces, students: cache }, null, 2);
export async function importJson(text) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.students)) throw new Error('Неверный формат файла');
  await api('POST', '/import', { students: d.students, workspaces: d.workspaces }); await initStore();
}
export async function seed(list) { await api('POST', '/import', { students: list.map((s) => ({ ...s, workspaceId: currentWs()?.id })) }); await initStore(); }
export const uidNew = uid;

// Самооценки приходят от менти напрямую в базу — подтягиваем их, не трогая остальные локальные правки.
export async function refreshSelf(id) {
  const fresh = (await api('GET', '/students')).find((x) => x.id === id), s = getStudent(id); if (!fresh || !s) return false;
  const changed = (fresh.selfAssessments?.length || 0) !== (s.selfAssessments?.length || 0) || fresh.review?.date !== s.review?.date;
  if (changed) { s.selfAssessments = fresh.selfAssessments; s.review = fresh.review; } return changed;
}
// Ссылка, по которой менти оставляет отзыв: создаётся один раз, повторный вызов отдаёт ту же.
export const reviewLink = async (id) => (await api('POST', `/students/${id}/review-link`, {})).token;
export const submitSelf = (token, scores) => api('POST', `/share/${encodeURIComponent(token)}/self`, { scores });

// ---------- публичная ссылка на профиль ----------
export const getShare = (id) => api('GET', `/students/${id}/share`); // { token, opts }
export const createShare = (id) => api('POST', `/students/${id}/share`, {});
export const setShareOpts = (id, opts) => api('PUT', `/students/${id}/share`, { opts });
export const revokeShare = (id) => api('DELETE', `/students/${id}/share`);
