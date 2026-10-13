// Слой данных. Источник правды — сервер (D1 + R2), см. src/worker.js.
// Список учеников держим в памяти: чтение синхронное, а каждая запись сразу уходит на сервер.
import { api } from './api.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()).replace('.', ''));
const now = () => new Date().toISOString();

let cache = [];
let queue = Promise.resolve(); // записи идут по очереди, чтобы порядок сохранялся
const fail = (msg) => window.dispatchEvent(new CustomEvent('menty:error', { detail: msg }));
const sync = (fn) => { queue = queue.then(fn).catch((e) => { if (e.status !== 401) fail('Не удалось сохранить на сервере — проверьте соединение и обновите страницу'); console.error(e); }); return queue; };
const save = (s) => sync(() => api('PUT', `/students/${s.id}`, s));

export async function initStore() { cache = await api('GET', '/students'); }
export const resetStore = () => { cache = []; };

// ---------- файлы ----------
export const putFile = (id, blob) => api('PUT', `/files/${id}`, blob);
export const getFile = async (id) => (await api('GET', `/files/${id}`, undefined, true)).blob();

// ---------- чтение ----------
export const students = () => cache;
export const getStudent = (id) => cache.find((s) => s.id === id);

// ---------- запись ----------
function mutate(id, fn) { const s = getStudent(id); if (!s) return; fn(s); s.updatedAt = now(); save(s); return s; }

export async function addStudent(d) {
  const t = now();
  const s = {
    id: uid(), createdAt: t, updatedAt: t,
    firstName: d.firstName.trim(), lastName: d.lastName.trim(),
    grade: d.grade, status: d.status || 'active', avatar: d.avatar || '',
    company: d.company?.trim() || '', role: d.role?.trim() || '',
    goal: { position: d.targetRole?.trim() || '', company: d.targetCompany?.trim() || '', salary: d.salary ? Number(d.salary) : null, currency: d.currency || '₽', horizon: d.horizon || '' },
    portfolios: [], cvs: [], sessions: [], tasks: [],
    assessments: [{ id: uid(), date: t, scores: { ...d.scores }, comment: 'Первичная оценка' }],
    privateNote: d.privateNote?.trim() || '',
  };
  if (d.portfolio) s.portfolios.push({ id: uid(), url: d.portfolio, title: 'Портфолио', note: '', addedAt: t });
  if (d.cv) { const id = uid(); await putFile(id, d.cv); s.cvs.push({ id, name: d.cv.name, size: d.cv.size, type: d.cv.type, addedAt: t }); }
  await api('POST', '/students', s);
  cache.push(s); return s;
}
export const updateStudent = (id, patch) => mutate(id, (s) => Object.assign(s, patch));
export const addAssessment = (id, scores, comment) => mutate(id, (s) => s.assessments.push({ id: uid(), date: now(), scores: { ...scores }, comment: comment?.trim() || '' }));
// Портфолио и CV не удаляются — только добавляются новые версии, чтобы сохранялась история.
export const addPortfolio = (id, p) => mutate(id, (s) => s.portfolios.push({ id: uid(), url: p.url, title: p.title?.trim() || 'Портфолио', note: p.note?.trim() || '', addedAt: now() }));
export async function addCv(id, file) {
  const fid = uid(); await putFile(fid, file);
  return mutate(id, (s) => s.cvs.push({ id: fid, name: file.name, size: file.size, type: file.type, addedAt: now() }));
}
export const addSession = (id, { date, text }) => mutate(id, (s) => s.sessions.push({ id: uid(), date, text: text.trim() }));
export const removeSession = (id, sid) => mutate(id, (s) => { s.sessions = s.sessions.filter((x) => x.id !== sid); });
export const addTask = (id, text) => mutate(id, (s) => s.tasks.push({ id: uid(), text: text.trim(), done: false, createdAt: now() }));
export const toggleTask = (id, tid) => mutate(id, (s) => { const t = s.tasks.find((x) => x.id === tid); if (t) t.done = !t.done; });
export const removeTask = (id, tid) => mutate(id, (s) => { s.tasks = s.tasks.filter((x) => x.id !== tid); });
export async function removeStudent(id) {
  await queue; await api('DELETE', `/students/${id}`); // сервер удалит и файлы CV
  cache = cache.filter((x) => x.id !== id);
}

// ---------- резервная копия (файлы CV в неё не входят) ----------
export const exportJson = () => JSON.stringify({ app: 'menty', version: 1, exportedAt: now(), students: cache }, null, 2);
export async function importJson(text) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.students)) throw new Error('Неверный формат файла');
  await api('POST', '/import', { students: d.students }); await initStore();
}
export async function seed(list) { await api('POST', '/import', { students: list }); await initStore(); }
export const uidNew = uid;
