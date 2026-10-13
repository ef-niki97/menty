// Слой данных. Сейчас — localStorage (карточки) + IndexedDB (файлы CV).
// Вся работа с данными идёт только через эти функции, поэтому позже их можно
// заменить на запросы к серверу, не трогая экраны.

const KEY = 'menty:v1';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const now = () => new Date().toISOString();

let db = load();
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && Array.isArray(d.students)) return d; } catch { /* пусто или битые данные */ }
  return { students: [] };
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
  catch { window.dispatchEvent(new CustomEvent('menty:error', { detail: 'Не удалось сохранить данные — переполнено хранилище браузера' })); return false; }
}

// ---------- файлы (IndexedDB) ----------
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open('menty-files', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('files');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('files', mode); const q = fn(t.objectStore('files')); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
export const putFile = (id, blob) => tx('readwrite', (s) => s.put(blob, id));
export const getFile = (id) => tx('readonly', (s) => s.get(id));
const delFile = (id) => tx('readwrite', (s) => s.delete(id)).catch(() => {});

// ---------- чтение ----------
export const students = () => db.students;
export const getStudent = (id) => db.students.find((s) => s.id === id);

// ---------- запись ----------
function mutate(id, fn) { const s = getStudent(id); if (!s) return; fn(s); s.updatedAt = now(); persist(); return s; }

export async function addStudent(d) {
  const t = now();
  const s = {
    id: uid(), createdAt: t, updatedAt: t,
    firstName: d.firstName.trim(), lastName: d.lastName.trim(),
    grade: d.grade, status: d.status || 'active',
    company: d.company?.trim() || '', role: d.role?.trim() || '',
    goal: { position: d.targetRole?.trim() || '', company: d.targetCompany?.trim() || '', salary: d.salary ? Number(d.salary) : null, currency: d.currency || '₽', horizon: d.horizon || '' },
    portfolios: [], cvs: [], sessions: [], tasks: [],
    assessments: [{ id: uid(), date: t, scores: { ...d.scores }, comment: 'Первичная оценка' }],
    privateNote: d.privateNote?.trim() || '',
  };
  if (d.portfolio) s.portfolios.push({ id: uid(), url: d.portfolio, title: 'Портфолио', note: '', addedAt: t });
  if (d.cv) { const id = uid(); await putFile(id, d.cv); s.cvs.push({ id, name: d.cv.name, size: d.cv.size, type: d.cv.type, addedAt: t }); }
  db.students.push(s); persist(); return s;
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
  const s = getStudent(id); if (!s) return;
  await Promise.all(s.cvs.map((c) => delFile(c.id)));
  db.students = db.students.filter((x) => x.id !== id); persist();
}

// ---------- резервная копия (файлы CV в неё не входят) ----------
export const exportJson = () => JSON.stringify({ app: 'menty', version: 1, exportedAt: now(), ...db }, null, 2);
export function importJson(text) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.students)) throw new Error('Неверный формат файла');
  db = { students: d.students }; return persist();
}
export function seed(list) { db.students.push(...list); persist(); }
export const uidNew = uid;
