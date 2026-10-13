import { students, seed } from '../store.js';
import { GRADES, STATUSES } from '../config.js';
import { esc, icon, avatar, fullName, fmtDate, ACT, toast } from '../ui.js';
import { total, growth, latest, fmt1, signed } from '../metrics.js';
import { demoStudents } from '../demo.js';

const F = { q: '', grade: '', status: '' };

const statTile = (v, k) => `<div class="card tight stat"><div class="v">${v}</div><div class="k">${k}</div></div>`;

function rows(list) {
  if (!list.length) return `<div class="empty">${icon('search_off', 'ol')}<p>Никого не нашли. Попробуйте изменить фильтры.</p></div>`;
  return list.map((s) => {
    const t = total(latest(s).scores), g = growth(s), st = STATUSES[s.status] || STATUSES.active;
    return `<a class="trow" href="#/student/${s.id}">
      <div class="who">${avatar(s)}<div class="grow"><b>${esc(fullName(s))}</b><div class="small ell">${esc([s.role, s.company].filter(Boolean).join(' · ') || 'Место работы не указано')}</div></div></div>
      <div><span class="chip on">${esc(s.grade)}</span></div>
      <div class="ell">${s.goal.position ? `<b>${esc(s.goal.position)}</b>${s.goal.company ? `<div class="small ell">${esc(s.goal.company)}</div>` : ''}` : '<span class="muted">—</span>'}</div>
      <div class="prog"><div class="bar"><i style="width:${(t / 5) * 100}%"></i></div><span class="num">${fmt1(t)}</span>${g === null ? '' : `<span class="delta ${g > 0.04 ? 'up' : g < -0.04 ? 'down' : ''}">${signed(g)}</span>`}</div>
      <div><span class="chip ${st.tone}">${st.label}</span></div>
      <div class="small">${fmtDate(s.updatedAt)}</div>
    </a>`;
  }).join('');
}

function filtered() {
  const q = F.q.trim().toLowerCase();
  return students().filter((s) => (!F.grade || s.grade === F.grade) && (!F.status || s.status === F.status)
    && (!q || [fullName(s), s.company, s.role, s.goal.position].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function studentsView() {
  const all = students();
  const head = `<div class="section-h"><div><div class="eyebrow">Менти</div><h1 class="d-m">Ученики</h1></div><a class="pill dark" href="#/students/new">${icon('add')} Добавить ученика</a></div>`;
  if (!all.length) {
    return { shell: 'app', nav: 'students', html: `<div class="page view" style="padding-top:48px">${head}
      <div class="card empty-card">${icon('group_add', 'ol')}<h2 class="d-s">Пока никого нет</h2><p class="lede">Добавьте первого ученика — оценим компетенции и построим стартовую диаграмму.</p>
      <div class="row" style="justify-content:center;margin-top:24px"><a class="pill dark" href="#/students/new">${icon('add')} Добавить ученика</a><button class="pill ghost" data-act="seed-demo">Загрузить демо-данные</button></div></div></div>` };
  }
  const active = all.filter((s) => s.status === 'active').length;
  const avgNow = all.reduce((a, s) => a + total(latest(s).scores), 0) / all.length;
  const gs = all.map(growth).filter((g) => g !== null); const avgG = gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null;
  return {
    shell: 'app', nav: 'students',
    html: `<div class="page view" style="padding-top:48px">${head}
      <div class="grid g4" style="margin-bottom:28px">${statTile(all.length, 'учеников всего')}${statTile(active, 'активных')}${statTile(fmt1(avgNow) + '<small>/5</small>', 'средний уровень')}${statTile(avgG === null ? '—' : signed(avgG), 'средний рост с начала')}</div>
      <div class="filters">
        <div class="selw grow-s">${icon('search', 'lead')}<input class="field sm" id="f-q" placeholder="Поиск по имени, компании, должности" autocomplete="off" value="${esc(F.q)}"></div>
        <div class="seg" id="f-grade"><button class="${!F.grade ? 'on' : ''}" data-g="">Все грейды</button>${GRADES.filter((g) => all.some((s) => s.grade === g)).map((g) => `<button class="${F.grade === g ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>
        <div class="selw">${icon('expand_more', 'trail')}<select class="field sm" id="f-status"><option value="">Любой статус</option>${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${F.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      </div>
      <div class="card tbl">
        <div class="thead"><div>Ученик</div><div>Грейд</div><div>Цель</div><div>Уровень</div><div>Статус</div><div>Обновлён</div></div>
        <div id="rows">${rows(filtered())}</div>
      </div></div>`,
    mount(root) {
      const paint = () => { root.querySelector('#rows').innerHTML = rows(filtered()); };
      root.querySelector('#f-q').addEventListener('input', (e) => { F.q = e.target.value; paint(); });
      root.querySelector('#f-status').addEventListener('change', (e) => { F.status = e.target.value; paint(); });
      root.querySelector('#f-grade').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return; F.grade = b.dataset.g;
        root.querySelectorAll('#f-grade button').forEach((x) => x.classList.toggle('on', x === b)); paint();
      });
    },
  };
}

ACT['seed-demo'] = async () => { try { await seed(demoStudents()); toast('Демо-данные загружены'); window.__rerender(); } catch { toast('Не удалось загрузить демо-данные'); } };
