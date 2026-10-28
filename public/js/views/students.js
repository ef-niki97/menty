import { students, seed } from '../store.js';
import { GRADES, STATUSES, RESULTS, mentorshipStatus, studentResult } from '../config.js';
import { esc, icon, avatar, fullName, workLine, fmtDate, ACT, toast } from '../ui.js';
import { total, growth, latest, fmt1, signed } from '../metrics.js';
import { demoStudents } from '../demo.js';
import { closeStudentMenu } from '../student-menu.js';

const F = { q: '', grade: '', status: '', result: '' };
let layout = 'list';
try { layout = localStorage.getItem('menty_students_view') === 'cards' ? 'cards' : 'list'; } catch {}
const sorting = { key: 'updatedAt', direction: 'desc' };
const SORTS = {
  grade: { label: 'Грейд', asc: 'от начального', desc: 'от старшего' },
  level: { label: 'Оценка', asc: 'по возрастанию', desc: 'по убыванию' },
  status: { label: 'Статус', asc: 'от А до Я', desc: 'от Я до А' },
  result: { label: 'Результат', asc: 'от А до Я', desc: 'от Я до А' },
  updatedAt: { label: 'Обновлён', asc: 'сначала старые', desc: 'сначала новые' },
};
const initialDirection = (key) => ['status', 'result'].includes(key) ? 'asc' : 'desc';
const sortHeading = (key) => {
  const active = sorting.key === key, direction = active ? sorting.direction : initialDirection(key), label = SORTS[key].label;
  return `<button type="button" class="sort-btn" data-sort="${key}" aria-pressed="${active}" aria-label="${label}${active ? ': ' + SORTS[key][direction] : ': сортировать'}">${label}${icon('arrow_back', `sort-arrow ${direction}`)}</button>`;
};
function compareStudents(a, b) {
  let result;
  switch (sorting.key) {
    case 'grade': result = GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade); break;
    case 'level': result = total(latest(a).scores) - total(latest(b).scores); break;
    case 'status': result = STATUSES[mentorshipStatus(a)].label.localeCompare(STATUSES[mentorshipStatus(b)].label, 'ru'); break;
    case 'result': result = RESULTS[studentResult(a)].label.localeCompare(RESULTS[studentResult(b)].label, 'ru'); break;
    default: result = a.updatedAt.localeCompare(b.updatedAt);
  }
  return (sorting.direction === 'asc' ? result : -result) || b.updatedAt.localeCompare(a.updatedAt) || fullName(a).localeCompare(fullName(b), 'ru');
}
const layoutIcon = (mode) => `<span class="i" aria-hidden="true"><svg viewBox="0 0 24 24" style="fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round">${mode === 'list' ? '<path d="M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01"/>' : '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'}</svg></span>`;
const statTile = (v, k) => `<div class="card tight stat"><div class="v">${v}</div><div class="k">${k}</div></div>`;
const menuButton = (s) => `<button type="button" class="ws-dots student-menu-trigger" data-act="student-menu" aria-label="Действия: ${esc(fullName(s))}" aria-haspopup="menu" aria-expanded="false">${icon('more_horiz')}</button>`;
const score = (s) => {
  const value = total(latest(s).scores), delta = growth(s);
  return `<span class="num" aria-label="Оценка ${fmt1(value)} из 5">${fmt1(value)}</span>${delta === null ? '' : `<span class="delta ${delta > .04 ? 'up' : delta < -.04 ? 'down' : ''}" aria-label="Изменение оценки ${signed(delta)}">${signed(delta)}</span>`}`;
};
const chip = (state, label = '') => `<span class="chip ${state.tone}"${label ? ` title="${esc(label)}" aria-label="${esc(label)}: ${esc(state.label)}"` : ''}>${state.label}</span>`;
function rows(list) {
  if (!list.length) return `<div class="empty">${icon('search_off', 'ol')}<p>Никого не нашли. Попробуйте изменить фильтры.</p></div>`;
  return list.map((s) => {
    const status = STATUSES[mentorshipStatus(s)], result = RESULTS[studentResult(s)];
    if (layout === 'cards') return `<article class="card student-card" data-sid="${esc(s.id)}">
      <a class="student-card-link" href="/student/${esc(s.id)}">
        <div class="student-card-head">${avatar(s, 'lg')}<div class="student-card-identity"><h2>${esc(fullName(s))}</h2><p class="small student-card-description">${esc(workLine(s))}</p></div></div>
        <div class="student-card-badges"><span class="chip on">${esc(s.grade)}</span>${chip(status, 'Статус менторства')}${chip(result, 'Результат')}</div>
        <div class="student-card-goal"><span class="small">Цель</span><b>${esc(s.goal.position || 'Не указана')}</b>${s.goal.company ? `<span class="small">${esc(s.goal.company)}</span>` : ''}</div>
        <div class="student-card-score"><span class="small">Оценка</span><div class="prog">${score(s)}<span class="small">/5</span></div></div>
      </a>${menuButton(s)}</article>`;
    return `<div class="student-table-row" data-sid="${esc(s.id)}"><a class="trow" href="/student/${esc(s.id)}">
      <div class="who">${avatar(s)}<div class="grow"><b>${esc(fullName(s))}</b><div class="small ell">${esc(workLine(s))}</div></div></div>
      <div><span class="chip on">${esc(s.grade)}</span></div>
      <div class="ell">${s.goal.position ? `<b>${esc(s.goal.position)}</b>${s.goal.company ? `<div class="small ell">${esc(s.goal.company)}</div>` : ''}` : '<span class="muted">Не указано</span>'}</div>
      <div class="prog">${score(s)}</div><div>${chip(status)}</div><div>${chip(result)}</div><div class="small student-updated">${fmtDate(s.updatedAt)}</div>
    </a>${menuButton(s)}</div>`;
  }).join('');
}
function filtered() {
  const q = F.q.trim().toLowerCase();
  return students().filter((s) => (!F.grade || s.grade === F.grade) && (!F.status || mentorshipStatus(s) === F.status) && (!F.result || studentResult(s) === F.result)
    && (!q || [fullName(s), s.company, s.jobless ? 'без работы в поисках работы' : '', s.role, s.goal.position].join(' ').toLowerCase().includes(q))).sort(compareStudents);
}
const filterSelect = (id, label, empty, options, value) => `<div class="selw"><select class="field sm" id="${id}" aria-label="${label}" data-empty-label="${empty}"><option value="">Всё</option>${Object.entries(options).map(([key, state]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${state.label}</option>`).join('')}</select></div>`;
export function studentsView() {
  const all = students();
  const head = `<div class="section-h"><div><div class="eyebrow">Менти</div><h1 class="d-m">Ученики</h1></div><a class="pill dark" href="/students/new">${icon('add')} Добавить ученика</a></div>`;
  if (!all.length) return { shell: 'app', nav: 'students', html: `<div class="page view" style="padding-top:48px">${head}
    <div class="card empty-card">${icon('group_add', 'ol')}<h2 class="d-s">Пока никого нет</h2><p class="lede">Добавьте первого ученика, чтобы оценить компетенции и построить стартовую диаграмму</p>
    <div class="row" style="justify-content:center;margin-top:24px"><a class="pill dark" href="/students/new">${icon('add')} Добавить ученика</a><button class="pill ghost" data-act="seed-demo">Загрузить демо-данные</button></div></div></div>` };
  const active = all.filter((s) => mentorshipStatus(s) === 'active').length;
  const avgNow = all.reduce((a, s) => a + total(latest(s).scores), 0) / all.length;
  const gs = all.map(growth).filter((g) => g !== null), avgG = gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null;
  return {
    shell: 'app', nav: 'students',
    html: `<div class="page view students-page" style="padding-top:48px">${head}
      <div class="grid g4" style="margin-bottom:28px">${statTile(all.length, 'учеников всего')}${statTile(active, 'активных')}${statTile(fmt1(avgNow) + '<small>/5</small>', 'средняя оценка')}${statTile(avgG === null ? 'Не указано' : signed(avgG), 'средний рост с начала')}</div>
      <div class="filters">
        <div class="selw grow-s search-field">${icon('search', 'lead')}<input class="field sm" id="f-q" placeholder="Поиск по имени, компании, должности" autocomplete="off" value="${esc(F.q)}"><button type="button" class="search-clear ${F.q ? '' : 'hide'}" id="clear-search" aria-label="Очистить поиск">${icon('close')}</button></div>
        ${filterSelect('f-grade', 'Грейд', 'Все грейды', Object.fromEntries(GRADES.map((grade) => [grade, { label: grade }])), F.grade)}
        ${filterSelect('f-status', 'Статус', 'Все статусы', STATUSES, F.status)}
        ${filterSelect('f-result', 'Результат', 'Результат', RESULTS, F.result)}
        <div class="seg layout-toggle" id="student-layout" role="group" aria-label="Вид учеников"><button type="button" data-layout="list" aria-label="Список" title="Список" aria-pressed="${layout === 'list'}" class="${layout === 'list' ? 'on' : ''}">${layoutIcon('list')}</button><button type="button" data-layout="cards" aria-label="Карточки" title="Карточки" aria-pressed="${layout === 'cards'}" class="${layout === 'cards' ? 'on' : ''}">${layoutIcon('cards')}</button></div>
      </div>
      <div class="students-results ${layout === 'cards' ? 'cards-mode' : 'card tbl'}">
        <div class="thead"><div>Ученик</div><div data-sort-heading="grade">${sortHeading('grade')}</div><div>Цель</div><div data-sort-heading="level">${sortHeading('level')}</div><div data-sort-heading="status">${sortHeading('status')}</div><div data-sort-heading="result">${sortHeading('result')}</div><div data-sort-heading="updatedAt">${sortHeading('updatedAt')}</div></div>
        <div id="rows">${rows(filtered())}</div>
      </div></div>`,
    mount(root) {
      const paint = () => { closeStudentMenu(); root.querySelector('#rows').innerHTML = rows(filtered()); };
      const updateSort = () => {
        root.querySelectorAll('[data-sort-heading]').forEach((heading) => { heading.innerHTML = sortHeading(heading.dataset.sortHeading); });
        paint();
      };
      root.querySelector('.thead').addEventListener('click', (e) => {
        const button = e.target.closest('[data-sort]'); if (!button) return;
        const key = button.dataset.sort;
        sorting.direction = sorting.key === key ? (sorting.direction === 'asc' ? 'desc' : 'asc') : initialDirection(key);
        sorting.key = key; updateSort(); root.querySelector(`[data-sort="${key}"]`).focus({ preventScroll: true });
      });
      root.querySelector('#student-layout').addEventListener('click', (e) => {
        const button = e.target.closest('[data-layout]'); if (!button) return;
        layout = button.dataset.layout; try { localStorage.setItem('menty_students_view', layout); } catch {}
        root.querySelectorAll('[data-layout]').forEach((b) => { b.classList.toggle('on', b === button); b.setAttribute('aria-pressed', String(b === button)); });
        root.querySelector('.students-results').className = `students-results ${layout === 'cards' ? 'cards-mode' : 'card tbl'}`;
        paint();
      });
      const searchInput = root.querySelector('#f-q'), clearSearch = root.querySelector('#clear-search');
      searchInput.addEventListener('input', (e) => { F.q = e.target.value; clearSearch.classList.toggle('hide', !F.q); paint(); });
      clearSearch.addEventListener('click', () => { searchInput.value = ''; searchInput.dispatchEvent(new Event('input', { bubbles: true })); searchInput.focus(); });
      root.querySelector('#f-status').addEventListener('change', (e) => { F.status = e.target.value; paint(); });
      root.querySelector('#f-result').addEventListener('change', (e) => { F.result = e.target.value; paint(); });
      root.querySelector('#f-grade').addEventListener('change', (e) => { F.grade = e.target.value; paint(); });
    },
  };
}
ACT['seed-demo'] = async () => { try { await seed(demoStudents()); toast('Демо-данные загружены'); window.__rerender(); } catch { toast('Не удалось загрузить демо-данные'); } };
