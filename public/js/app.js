import { initAuth, isAuthed, logout, forgetUser, currentUser } from './auth.js';
import { api } from './api.js';
import { initStore, resetStore, exportJson, importJson, workspaces, currentWs, setWs, createWorkspace, renameWorkspace, deleteWorkspace, allStudents } from './store.js';
import { $, ACT, confirmDialog, esc, icon, logo, toast, downloadBlob, today, openModal } from './ui.js';
import { loginView } from './views/login.js';
import { studentsView } from './views/students.js';
import { wizardView } from './views/wizard.js';
import { studentView, assessView } from './views/student.js';
import { shareView, shareAssessView } from './views/share.js';
import { reviewView } from './views/review.js';
import { siteFooter } from './footer.js';
import { beginStartup, measureStartup, finishStartup } from './diagnostics.js';
import './dropdown.js';

// [шаблон пути, экран, нужна ли авторизация]
const routes = [
  ['login', loginView, false],
  ['students', studentsView, true],
  ['students/new', wizardView, true],
  ['student/:id', studentView, true],
  ['student/:id/assess', assessView, true],
  ['s/:token', shareView, false],
  ['s/:token/assess', shareAssessView, false],
  ['r/:token', reviewView, false],
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

function wsSwitcher() {
  const cur = currentWs(); if (!cur) return '';
  return `<div class="ws"><button class="ws-btn" data-act="ws-toggle" aria-haspopup="true" aria-label="Воркспейс">${icon('menu')}<span class="ell">${esc(cur.name)}</span>${icon('expand_more')}</button>
    <div class="wsmenu" id="wsmenu"><div class="ws-cap">Воркспейсы</div>
      ${workspaces().map((w) => `<div class="ws-row"><button class="um-i" data-act="ws-pick" data-id="${esc(w.id)}"><span class="ell grow">${esc(w.name)}</span>${w.id === cur.id ? icon('check') : ''}</button>
        <button class="ws-dots" data-act="ws-more" data-id="${esc(w.id)}" aria-label="Действия с воркспейсом «${esc(w.name)}»">${icon('more_horiz')}</button>
        <div class="ws-sub"><button class="um-i" data-act="ws-rename" data-id="${esc(w.id)}">${icon('edit', 'ol')} Переименовать</button><button class="um-i danger" data-act="ws-del" data-id="${esc(w.id)}">${icon('delete', 'ol')} Удалить воркспейс</button></div></div>`).join('')}
      <div class="um-sep"></div><button class="um-i" data-act="ws-new">${icon('add')} Создать воркспейс</button></div></div>`;
}
function nav(active) {
  const u = currentUser();
  return `<header class="nav"><div class="nav-in"><a href="/students" aria-label="Menty">${logo(28)}</a>
    ${wsSwitcher()}
    <nav class="nav-links"><a href="/students" class="${active === 'students' ? 'on' : ''}">Ученики</a></nav>
    <div class="nav-right"><button class="avatar-btn" data-act="menu-toggle" aria-label="Меню профиля">${esc(u.name[0])}</button></div>
    <div class="umenu" id="umenu"><div class="um-name">${esc(u.name)}</div><div class="small" style="margin-bottom:8px">${esc(u.email)}</div><div class="um-sep"></div>
      <button class="um-i" data-act="backup">${icon('download')} Скачать резервную копию</button>
      <label class="um-i" for="restore-in">${icon('upload')} Восстановить из копии</label><input id="restore-in" type="file" accept="application/json,.json" hidden>
      ${u.role === 'admin' ? `<button class="um-i" data-act="invites">${icon('group_add', 'ol')} Приглашения</button>` : ''}
      <div class="um-sep"></div><button class="um-i" data-act="logout">${icon('logout')} Выйти</button>
      ${u.role === 'admin' ? '' : `<button class="um-i danger" data-act="acc-del">${icon('person_remove', 'ol')} Удалить аккаунт</button>`}
      <div class="um-sep"></div>
      <a class="um-i" href="/privacy" target="_blank" rel="noopener">${icon('shield', 'ol')} Политика конфиденциальности</a>
      <a class="um-i" href="/terms" target="_blank" rel="noopener">${icon('description', 'ol')} Условия использования</a></div></div></header>`;
}

function render(path, keep) {
  let m = match(path) || match('students');
  if (!isAuthed() && m.auth) { go('/login', true); return; }
  if (isAuthed() && path === 'login') { go('/students', true); return; }
  const v = m.fn(m.params), y = window.scrollY;
  app.innerHTML = (v.shell === 'app' ? `${nav(v.nav)}<main class="app-content">${v.html}</main>` : `<div class="app-content">${v.html}</div>`) + siteFooter();
  app.classList.toggle('still', !!keep);
  v.mount?.(app);
  const restore = $('#restore-in'); restore?.addEventListener('change', onRestore);
  window.scrollTo(0, keep ? y : 0);
}
function route(keep) {
  const path = location.pathname.replace(/^\/+|\/+$/g, '') || 'students';
  render(path, keep && path === lastPath); lastPath = path;
}
// Адреса без #: переходы идут через History API, сервер на любой путь отдаёт index.html.
function go(path, replace) { history[replace ? 'replaceState' : 'pushState'](null, '', path); route(false); }
window.__go = go;
window.__rerender = () => route(true);
window.addEventListener('popstate', () => route(false));
// Старые ссылки вида /#/share/… и /#/student/… переносим на новые адреса.
if (location.hash.startsWith('#/')) history.replaceState(null, '', location.hash.slice(1).replace(/^\/share\//, '/s/'));
window.addEventListener('menty:error', (e) => toast(e.detail));
window.addEventListener('menty:unauth', () => { forgetUser(); resetStore(); if (location.pathname !== '/login' && !/^\/[sr]\//.test(location.pathname)) go('/login'); });

document.addEventListener('click', (e) => {
  const l = e.target.closest('a[href^="/"]');
  if (l && !l.getAttribute('href').startsWith('/api/') && !l.target && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); go(l.getAttribute('href')); return; }
  const a = e.target.closest('[data-act]');
  if (a && ACT[a.dataset.act]) { if (a.tagName === 'A') e.preventDefault(); ACT[a.dataset.act](a, e); }
  if (!e.target.closest('#umenu') && !e.target.closest('[data-act=menu-toggle]')) $('#umenu')?.classList.remove('on');
  if (!e.target.closest('#wsmenu') && !e.target.closest('[data-act=ws-toggle]')) $('#wsmenu')?.classList.remove('on');
  if (!e.target.closest('.fwrap')) document.querySelectorAll('.fmenu.on').forEach((m) => m.classList.remove('on'));
});

ACT.invites = async () => {
  $('#umenu')?.classList.remove('on');
  const link = (c) => `${location.origin}/login?invite=${c}`;
  openModal(`<h2 class="d-s">Приглашения</h2><p class="small" style="margin:6px 0 18px">Новый ментор может зарегистрироваться только по ссылке-приглашению. Каждая ссылка одноразовая.</p>
    <button type="button" class="pill dark" id="iv-new">${icon('add')} Создать приглашение</button><div class="col" id="iv-list" style="gap:10px;margin-top:18px"></div>
    <div class="row" style="justify-content:flex-end;margin-top:20px"><button type="button" class="pill ghost" data-close>Закрыть</button></div>`,
  async (m) => {
    const list = m.querySelector('#iv-list');
    const paint = async () => {
      try { const rows = await api('GET', '/invites'); list.innerHTML = rows.map((r) => `<div class="row" style="gap:8px">${r.usedBy ? `<span class="small grow ell">Использовано: ${esc(r.usedBy)}</span>` : `<input class="field sm" readonly value="${esc(link(r.code))}" style="flex:1;min-width:0"><button type="button" class="pill ghost sm" data-copy="${esc(r.code)}">Скопировать</button><button type="button" class="x" style="opacity:1" data-del="${esc(r.code)}" aria-label="Удалить">${icon('close')}</button>`}</div>`).join('') || '<p class="small">Пока нет приглашений</p>'; }
      catch { list.innerHTML = '<div class="form-err">Не удалось загрузить</div>'; }
    };
    await paint();
    m.addEventListener('click', async (e) => {
      try {
        if (e.target.closest('#iv-new')) { await api('POST', '/invites', {}); await paint(); }
        const c = e.target.closest('[data-copy]'), d = e.target.closest('[data-del]');
        if (c) { try { await navigator.clipboard.writeText(link(c.dataset.copy)); } catch { c.previousElementSibling.select(); document.execCommand('copy'); } toast('Ссылка скопирована'); }
        if (d) { await api('DELETE', `/invites/${d.dataset.del}`); await paint(); }
      } catch { toast('Не удалось выполнить действие'); }
    });
  });
};
ACT['acc-del'] = () => {
  $('#umenu')?.classList.remove('on'); const email = currentUser().email;
  openModal(`<h2 class="d-s">Удалить аккаунт</h2><p class="small" style="margin:6px 0 18px">Все ваши ученики, оценки, файлы и ссылки будут удалены без возможности восстановления. Перед этим можно скачать резервную копию в меню профиля. Чтобы подтвердить, введите свою почту.</p>
    <form class="col" id="ad-form"><input class="field" name="confirm" placeholder="${esc(email)}" autocomplete="off" data-1p-ignore data-lpignore="true" required>
    <div class="row spread" style="margin-top:8px"><button type="button" class="pill ghost" data-close>Отмена</button><button class="pill danger-ghost" type="submit">Удалить навсегда</button></div></form>`,
  (m, close) => m.querySelector('#ad-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('DELETE', '/account', { confirm: new FormData(e.target).get('confirm') }); close(); forgetUser(); resetStore(); toast('Аккаунт удалён'); go('/login'); }
    catch { toast('Не удалось удалить: проверьте почту'); }
  }));
};
ACT['ws-toggle'] = () => { $('#umenu')?.classList.remove('on'); $('#wsmenu').classList.toggle('on'); };
ACT['ws-pick'] = (el) => { setWs(el.dataset.id); go('/students'); };
ACT['ws-more'] = (el) => el.closest('.ws-row').classList.toggle('open');
ACT['ws-rename'] = (el) => {
  const w = workspaces().find((x) => x.id === el.dataset.id); if (!w) return;
  $('#wsmenu')?.classList.remove('on');
  openModal(`<h2 class="d-s" style="margin-bottom:20px">Название воркспейса</h2>
    <form class="col" id="ws-form"><div><label class="lbl">Название</label><input class="field" name="name" maxlength="60" value="${esc(w.name)}" autocomplete="off" data-1p-ignore data-lpignore="true" required></div>
    <div class="row spread" style="margin-top:8px"><button type="button" class="pill ghost" data-close>Отмена</button><button class="pill dark" type="submit">Сохранить</button></div></form>`,
  (m, close) => {
    const inp = m.querySelector('input'); inp.select();
    m.querySelector('#ws-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const name = inp.value.trim(); if (!name) return;
      try { await renameWorkspace(w.id, name); close(); toast('Название изменено'); window.__rerender(); } catch { toast('Не удалось переименовать'); }
    });
  });
};
ACT['ws-del'] = async (el) => {
  const w = workspaces().find((x) => x.id === el.dataset.id); if (!w) return;
  if (workspaces().length <= 1) { toast('Нельзя удалить единственный воркспейс'); return; }
  if (allStudents().some((s) => s.workspaceId === w.id)) { toast('В воркспейсе есть ученики, сначала удалите их'); return; }
  if (!(await confirmDialog({ title: `Удалить воркспейс «${w.name}»?`, text: 'Воркспейс должен быть пустым' }))) return;
  try { await deleteWorkspace(w.id); toast('Воркспейс удалён'); go('/students'); } catch { toast('Не удалось удалить воркспейс'); }
};
ACT['ws-new'] = () => {
  $('#wsmenu')?.classList.remove('on');
  openModal(`<h2 class="d-s">Новый воркспейс</h2><p class="small" style="margin:6px 0 20px">Воркспейс: отдельное пространство со своим списком учеников, например группа или поток</p>
    <form class="col" id="ws-form"><div><label class="lbl">Название</label><input class="field" name="name" maxlength="60" placeholder="Например: Поток осень 2026" autocomplete="off" data-1p-ignore data-lpignore="true" required></div>
    <div class="row spread" style="margin-top:8px"><button type="button" class="pill ghost" data-close>Отмена</button><button class="pill dark" type="submit">Создать</button></div></form>`,
  (m, close) => m.querySelector('#ws-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const name = new FormData(e.target).get('name').trim(); if (!name) return;
    try { await createWorkspace(name); close(); toast('Воркспейс создан'); go('/students'); } catch { toast('Не удалось создать воркспейс'); }
  }));
};
ACT['menu-toggle'] = () => { $('#wsmenu')?.classList.remove('on'); $('#umenu').classList.toggle('on'); };
ACT.logout = async () => { await logout(); resetStore(); go('/login'); };
ACT.backup = () => { downloadBlob(new Blob([exportJson()], { type: 'application/json' }), `menty-backup-${today()}.json`); toast('Копия скачана. Файлы CV в неё не входят'); $('#umenu')?.classList.remove('on'); };
async function onRestore(e) {
  const f = e.target.files[0]; if (!f) return;
  if (!(await confirmDialog({ title: 'Восстановить из копии?', text: 'Текущие данные будут заменены данными из файла', ok: 'Восстановить' }))) { e.target.value = ''; return; }
  f.text().then(importJson).then(() => { toast('Данные восстановлены'); go('/students'); }).catch(() => toast('Не удалось восстановить данные из файла'));
}

beginStartup();
await measureStartup('auth', initAuth);
if (isAuthed()) await measureStartup('data', initStore).catch(() => toast('Не удалось загрузить данные'));
await measureStartup('render', () => route(false));
finishStartup();
