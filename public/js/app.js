import { initAuth, isAuthed, logout, forgetUser, currentUser } from './auth.js';
import { initStore, resetStore, exportJson, importJson } from './store.js';
import { $, ACT, esc, icon, logo, toast, downloadBlob, today } from './ui.js';
import { loginView } from './views/login.js';
import { studentsView } from './views/students.js';
import { wizardView } from './views/wizard.js';
import { studentView, assessView } from './views/student.js';

// [шаблон пути, экран, нужна ли авторизация]
const routes = [
  ['login', loginView, false],
  ['students', studentsView, true],
  ['students/new', wizardView, true],
  ['student/:id', studentView, true],
  ['student/:id/assess', assessView, true],
];
function match(path) {
  for (const [pat, fn, auth] of routes) {
    const a = pat.split('/'), b = path.split('/'); if (a.length !== b.length) continue;
    const params = {};
    if (a.every((s, i) => (s.startsWith(':') ? ((params[s.slice(1)] = decodeURIComponent(b[i])), true) : s === b[i]))) return { fn, params, auth };
  }
  return null;
}

const app = $('#app');
let lastPath = null;

function nav(active) {
  const u = currentUser();
  return `<header class="nav"><div class="nav-in"><a href="#/students" aria-label="Menty">${logo(28)}</a>
    <nav class="nav-links"><a href="#/students" class="${active === 'students' ? 'on' : ''}">Ученики</a></nav>
    <div class="nav-right"><a class="pill dark sm" href="#/students/new">${icon('add')} Ученик</a>
      <button class="avatar-btn" data-act="menu-toggle" aria-label="Меню профиля">${esc(u.name[0])}</button></div>
    <div class="umenu" id="umenu"><div class="um-name">${esc(u.name)}</div><div class="small" style="margin-bottom:8px">${esc(u.email)}</div><div class="um-sep"></div>
      <button class="um-i" data-act="backup">${icon('download')} Скачать резервную копию</button>
      <label class="um-i" for="restore-in">${icon('upload')} Восстановить из копии</label><input id="restore-in" type="file" accept="application/json,.json" hidden>
      <div class="um-sep"></div><button class="um-i" data-act="logout">${icon('logout')} Выйти</button></div></div></header>`;
}

function render(path, keep) {
  let m = match(path) || match('students');
  if (!isAuthed() && m.auth) { location.replace('#/login'); return; }
  if (isAuthed() && path === 'login') { location.replace('#/students'); return; }
  const v = m.fn(m.params), y = window.scrollY;
  app.innerHTML = v.shell === 'app' ? `${nav(v.nav)}<main>${v.html}</main>` : v.html;
  app.classList.toggle('still', !!keep);
  v.mount?.(app);
  const restore = $('#restore-in'); restore?.addEventListener('change', onRestore);
  window.scrollTo(0, keep ? y : 0);
}
function route(keep) {
  const path = (location.hash || '#/students').replace(/^#\//, '') || 'students';
  render(path, keep && path === lastPath); lastPath = path;
}
window.__rerender = () => route(true);
window.addEventListener('hashchange', () => route(false));
window.addEventListener('menty:error', (e) => toast(e.detail));
window.addEventListener('menty:unauth', () => { forgetUser(); resetStore(); if (location.hash !== '#/login') location.hash = '#/login'; });

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  if (a && ACT[a.dataset.act]) { if (a.tagName === 'A') e.preventDefault(); ACT[a.dataset.act](a, e); }
  if (!e.target.closest('#umenu') && !e.target.closest('[data-act=menu-toggle]')) $('#umenu')?.classList.remove('on');
});

ACT['menu-toggle'] = () => $('#umenu').classList.toggle('on');
ACT.logout = async () => { await logout(); resetStore(); location.hash = '#/login'; };
ACT.backup = () => { downloadBlob(new Blob([exportJson()], { type: 'application/json' }), `menty-backup-${today()}.json`); toast('Копия скачана. Файлы CV в неё не входят'); $('#umenu')?.classList.remove('on'); };
function onRestore(e) {
  const f = e.target.files[0]; if (!f) return;
  if (!confirm('Заменить все текущие данные данными из файла?')) { e.target.value = ''; return; }
  f.text().then(importJson).then(() => { toast('Данные восстановлены'); location.hash = '#/students'; window.__rerender(); }).catch(() => toast('Не удалось восстановить данные из файла'));
}

await initAuth();
if (isAuthed()) await initStore().catch(() => toast('Не удалось загрузить данные'));
route(false);
