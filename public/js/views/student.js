import * as store from '../store.js';
import { GRADES, STATUSES, CURRENCIES, HORIZONS, GROUPS, SKILLS, LEVELS } from '../config.js';
import { esc, icon, avatar, fileToAvatar, fullName, fmtDate, fmtMoney, fmtSize, today, safeUrl, host, toast, openModal, downloadBlob, ACT } from '../ui.js';
import { radar, radarLegend, scoreOrb } from '../radar.js';
import { skillsEditorHtml, bindSkillsEditor } from '../skills-editor.js';
import { datePicker } from '../datepicker.js';
import { total, latest, growth, fmt1, signed } from '../metrics.js';

const MAX_FILE = 10 * 1024 * 1024;
let cmp = { id: '', base: '' }; // с какой оценкой сравниваем текущую
const sid = (el) => el.closest('[data-sid]').dataset.sid;
const rerender = () => window.__rerender();
const notFound = () => ({ shell: 'app', nav: 'students', html: `<div class="page empty view" style="padding-top:96px">${icon('person_off', 'ol')}<p>Ученик не найден</p><a class="pill dark" href="#/students">К списку</a></div>` });
const dChip = (d) => d === null || Math.abs(d) < 0.05 ? '' : `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '↑' : '↓'} ${fmt1(Math.abs(d))}</span>`;

// ---------- блоки ----------
function skillRows(now, base) {
  return GROUPS.map((g) => `<div class="sr-grp"><div class="sr-h"><span class="i" style="color:${g.color}">${g.icon}</span>${g.label}</div>
    ${SKILLS.filter((s) => s.g === g.id).map((s) => {
      const v = now.scores[s.id] || 0, b = base ? base.scores[s.id] || 0 : null;
      return `<div class="sr"><span class="sr-n">${esc(s.label)}</span><div class="bar sr-bar"><i style="width:${(v / 5) * 100}%;background:${g.color}"></i>${b ? `<u class="tick" style="left:${(b / 5) * 100}%" title="Было: ${LEVELS[b]}"></u>` : ''}</div><span class="sr-l">${LEVELS[v]}</span>${b === null ? '<span></span>' : dChip(v - b) || '<span></span>'}</div>`;
    }).join('')}</div>`).join('');
}

function competenciesCard(s, now, base) {
  const opts = s.assessments.filter((a) => a.id !== now.id);
  return `<div class="card"><div class="card-h"><h2 class="d-s">Компетенции</h2>
      <div class="row">${opts.length ? `<div class="selw">${icon('expand_more', 'trail')}<select class="field sm" id="cmp-sel" aria-label="Сравнить с"><option value="">Без сравнения</option>${opts.map((a) => `<option value="${a.id}" ${base?.id === a.id ? 'selected' : ''}>Было: ${fmtDate(a.date)}</option>`).join('')}</select></div>` : ''}
      <a class="pill dark sm" href="#/student/${s.id}/assess">${icon('add_chart')} Новая оценка</a></div></div>
    ${radar([...(base ? [{ scores: base.scores, kind: 'prev' }] : []), { scores: now.scores, kind: 'now' }])}
    ${radarLegend(!!base, base ? `Было · ${fmtDate(base.date)}` : '', `${base ? 'Стало' : 'Оценка'} · ${fmtDate(now.date)}`)}
    ${scoreOrb(now.scores, base?.scores, { animate: true })}
    <details class="more"><summary>Все навыки подробно ${icon('expand_more')}</summary>${skillRows(now, base)}</details></div>`;
}

function historyCard(s, now) {
  const list = [...s.assessments].reverse();
  return `<div class="card"><div class="card-h"><h2 class="d-s">История оценок</h2><span class="small">${s.assessments.length} шт.</span></div><div class="tl">
    ${list.map((a) => { const i = s.assessments.indexOf(a), prev = s.assessments[i - 1], t = total(a.scores), isNow = a.id === now.id;
      return `<div class="tl-i ${isNow ? 'acc' : ''}"><div class="row spread"><div class="tl-t">${fmtDate(a.date)} <span class="muted">· ${fmt1(t)}/5</span> ${prev ? dChip(t - total(prev.scores)) : ''}</div>
        ${isNow ? '<span class="chip acc">Текущая</span>' : `<button class="chip" data-act="st-cmp" data-id="${a.id}">Сравнить</button>`}</div>${a.comment ? `<div class="tl-s">${esc(a.comment)}</div>` : ''}</div>`; }).join('')}</div></div>`;
}

const goalCard = (s) => {
  const g = s.goal, h = HORIZONS.find(([v]) => v === g.horizon);
  const empty = !g.position && !g.company && !g.salary;
  return `<div class="card dark goal"><div class="eyebrow lt">Цель</div>
    ${empty ? '<p class="muted" style="margin-top:8px">Цель не заполнена — добавьте её через «Редактировать».</p>' : `<div class="goal-pos">${esc(g.position || 'Должность не указана')}</div>
    ${g.company ? `<div class="muted">${esc(g.company)}</div>` : ''}
    <div class="goal-row"><div><span>Зарплата</span><b>${fmtMoney(g.salary, g.currency)}</b></div><div><span>Срок</span><b>${h && h[0] ? h[1] : '—'}</b></div><div><span>Сейчас</span><b>${esc(s.grade)}</b></div></div>`}</div>`;
};

function portfolioCard(s) {
  const list = [...s.portfolios].reverse();
  return `<div class="card"><div class="card-h"><h2 class="d-s">Портфолио</h2><button class="pill ghost sm" data-act="st-add-pf">${icon('add')} Новая версия</button></div>
    ${list.length ? `<div class="list">${list.map((p, i) => `<div class="li ${i ? 'old' : ''}"><span class="ico-sq">${icon('link')}</span><div class="grow"><a class="link ell" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.title)}</a><div class="small ell">${esc(host(p.url))} · ${fmtDate(p.addedAt)}</div>${p.note ? `<div class="small note">${esc(p.note)}</div>` : ''}</div>${i === 0 ? '<span class="chip ok">Актуальное</span>' : ''}</div>`).join('')}</div>` : '<p class="small">Ссылок пока нет.</p>'}
    ${list.length > 1 ? '<p class="small hint">Прошлые версии сохраняются в истории.</p>' : ''}</div>`;
}

function cvCard(s) {
  const list = [...s.cvs].reverse();
  return `<div class="card"><div class="card-h"><h2 class="d-s">CV</h2><label class="pill ghost sm" for="cv-up" style="cursor:pointer">${icon('upload')} Загрузить новое</label><input id="cv-up" type="file" hidden accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.rtf"></div>
    ${list.length ? `<div class="list">${list.map((c, i) => `<div class="li ${i ? 'old' : ''}"><span class="ico-sq">${icon('description')}</span><div class="grow"><b class="ell">${esc(c.name)}</b><div class="small">${fmtSize(c.size)} · ${fmtDate(c.addedAt)}</div></div>${i === 0 ? '<span class="chip ok">Актуальное</span>' : ''}<button class="chip" data-act="st-cv-dl" data-id="${c.id}" data-name="${esc(c.name)}" aria-label="Скачать">${icon('download')}</button></div>`).join('')}</div>` : '<p class="small">CV пока не загружено.</p>'}</div>`;
}

const tasksCard = (s) => `<div class="card"><div class="card-h"><h2 class="d-s">Задачи</h2><span class="small">${s.tasks.filter((t) => t.done).length}/${s.tasks.length}</span></div>
  <div class="tasks">${s.tasks.map((t) => `<div class="task ${t.done ? 'done' : ''}"><button class="tk" data-act="st-task" data-id="${t.id}" aria-label="Отметить">${t.done ? icon('check') : ''}</button><span class="grow">${esc(t.text)}</span><button class="x" data-act="st-task-del" data-id="${t.id}" aria-label="Удалить">${icon('close')}</button></div>`).join('') || '<p class="small">Нет задач.</p>'}</div>
  <form class="row add-row" id="task-form"><input class="field sm" name="text" placeholder="Новая задача для ученика" autocomplete="off" required><button class="pill dark sm" type="submit">Добавить</button></form></div>`;

const sessionsCard = (s) => `<div class="card"><div class="card-h"><h2 class="d-s">Встречи и заметки</h2></div>
  <form class="col" id="session-form"><div class="row">${datePicker('date', today())}<button class="pill dark sm" type="submit" style="margin-left:auto">Записать</button></div><textarea class="field sm" name="text" rows="2" placeholder="О чём говорили, договорённости, что обсудить дальше" required></textarea></form>
  <div class="tl" style="margin-top:20px">${[...s.sessions].sort((a, b) => b.date.localeCompare(a.date)).map((x) => `<div class="tl-i"><div class="row spread"><div class="tl-t">${fmtDate(x.date)}</div><button class="x" data-act="st-sess-del" data-id="${x.id}" aria-label="Удалить">${icon('close')}</button></div><div class="tl-s pre">${esc(x.text)}</div></div>`).join('') || '<p class="small">Записей пока нет.</p>'}</div></div>`;

const privateCard = (s) => `<div class="card flat"><div class="card-h"><h2 class="d-s">${icon('lock')} Личная заметка</h2><span class="small">видите только вы</span></div>
  <textarea class="field" id="private-note" rows="4" placeholder="Сильные стороны, риски, на что обратить внимание…">${esc(s.privateNote)}</textarea></div>`;

// ---------- страница ученика ----------
export function studentView({ id }) {
  const s = store.getStudent(id); if (!s) return notFound();
  if (cmp.id !== id) cmp = { id, base: s.assessments.length > 1 ? s.assessments[0].id : '' };
  const now = latest(s), base = s.assessments.find((a) => a.id === cmp.base && a.id !== now.id) || null;
  const st = STATUSES[s.status] || STATUSES.active, g = growth(s);
  return {
    shell: 'app', nav: 'students',
    html: `<div class="page view" data-sid="${s.id}" style="padding-top:36px">
      <a class="back" href="#/students">${icon('arrow_back')} Ученики</a>
      <div class="hero"><div class="hero-l"><label class="av-edit" for="av-up" title="Сменить фото">${avatar(s, 'xl')}<span class="av-cam">${icon('photo_camera')}</span></label><input id="av-up" type="file" accept="image/*" hidden><div><h1 class="d-m">${esc(fullName(s))}</h1>
        <div class="row wrap" style="margin:10px 0 6px"><span class="chip on">${esc(s.grade)}</span><span class="chip ${st.tone}">${st.label}</span><span class="chip">${fmt1(total(now.scores))}/5 ${g === null ? '' : dChip(g)}</span></div>
        <div class="muted">${esc([s.role, s.company].filter(Boolean).join(' · ') || 'Место работы не указано')}</div></div></div>
        <button class="pill ghost" data-act="st-edit">${icon('edit')} Редактировать</button></div>
      <div class="detail"><div class="col-main">${competenciesCard(s, now, base)}${historyCard(s, now)}${sessionsCard(s)}</div>
        <div class="col-side">${goalCard(s)}${portfolioCard(s)}${cvCard(s)}${tasksCard(s)}${privateCard(s)}</div></div></div>`,
    mount(root) {
      root.querySelector('#cmp-sel')?.addEventListener('change', (e) => { cmp.base = e.target.value; rerender(); });
      root.querySelector('#private-note').addEventListener('change', (e) => { store.updateStudent(id, { privateNote: e.target.value.trim() }); toast('Заметка сохранена'); });
      root.querySelector('#task-form').addEventListener('submit', (e) => { e.preventDefault(); const t = new FormData(e.target).get('text'); if (t.trim()) { store.addTask(id, t); rerender(); } });
      root.querySelector('#session-form').addEventListener('submit', (e) => { e.preventDefault(); const f = new FormData(e.target); store.addSession(id, { date: f.get('date'), text: f.get('text') }); toast('Запись добавлена'); rerender(); });
      root.querySelector('#av-up').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { store.updateStudent(id, { avatar: await fileToAvatar(f) }); toast('Фото обновлено'); rerender(); } catch { toast('Не удалось прочитать изображение'); }
      });
      root.querySelector('#cv-up').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return; if (f.size > MAX_FILE) { toast('Файл больше 10 МБ'); return; }
        try { await store.addCv(id, f); toast('Новая версия CV загружена'); rerender(); } catch { toast('Не удалось сохранить файл'); }
      });
    },
  };
}

ACT['st-cmp'] = (el) => { cmp.base = el.dataset.id; rerender(); };
ACT['st-task'] = (el) => { store.toggleTask(sid(el), el.dataset.id); rerender(); };
ACT['st-task-del'] = (el) => { store.removeTask(sid(el), el.dataset.id); rerender(); };
ACT['st-sess-del'] = (el) => { if (confirm('Удалить эту запись?')) { store.removeSession(sid(el), el.dataset.id); rerender(); } };
ACT['st-cv-dl'] = async (el) => {
  try { const blob = await store.getFile(el.dataset.id); if (!blob) throw 0; downloadBlob(blob, el.dataset.name); } catch { toast('Файл не найден (в резервную копию файлы не входят)'); }
};
ACT['st-add-pf'] = (el) => {
  const id = sid(el);
  openModal(`<h2 class="d-s">Новая версия портфолио</h2><p class="small" style="margin:6px 0 20px">Прежние ссылки останутся в истории.</p>
    <form class="col" id="pf-form"><div><label class="lbl">Ссылка *</label><input class="field" name="url" placeholder="behance.net/…, сайт, Notion, PDF" required></div>
    <div><label class="lbl">Название</label><input class="field" name="title" placeholder="Например: Сайт, версия 2"></div>
    <div><label class="lbl">Что изменилось</label><input class="field" name="note" placeholder="Добавил 2 кейса, переделал главную"></div>
    <div class="form-err hide" id="pf-err">${icon('error')} Проверьте ссылку</div>
    <div class="row spread" style="margin-top:8px"><button type="button" class="pill ghost" data-close>Отмена</button><button class="pill dark" type="submit">Добавить</button></div></form>`,
  (m, close) => m.querySelector('#pf-form').addEventListener('submit', (e) => {
    e.preventDefault(); const f = new FormData(e.target), url = safeUrl(f.get('url') || '');
    if (!url) { m.querySelector('#pf-err').classList.remove('hide'); return; }
    store.addPortfolio(id, { url, title: f.get('title'), note: f.get('note') }); close(); toast('Портфолио добавлено'); rerender();
  }));
};
ACT['st-edit'] = (el) => {
  const id = sid(el), s = store.getStudent(id), g = s.goal;
  const f = (label, name, v, ph = '', type = 'text') => `<div><label class="lbl">${label}</label><input class="field" name="${name}" type="${type}" value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off"></div>`;
  const sel = (label, name, opts, cur) => `<div><label class="lbl">${label}</label><div class="selw">${icon('expand_more', 'trail')}<select class="field" name="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>`;
  openModal(`<h2 class="d-s" style="margin-bottom:20px">Редактировать ученика</h2><form class="col" id="ed-form">
    ${s.avatar ? `<div class="row">${avatar(s, 'lg')}<button type="button" class="pill ghost sm" id="ed-av-del">Убрать фото</button></div>` : ''}
    <div class="grid g2">${f('Имя', 'firstName', s.firstName)}${f('Фамилия', 'lastName', s.lastName)}</div>
    <div class="grid g2">${sel('Грейд', 'grade', GRADES.map((x) => [x, x]), s.grade)}${sel('Статус', 'status', Object.entries(STATUSES).map(([k, v]) => [k, v.label]), s.status)}</div>
    <div class="grid g2">${f('Компания', 'company', s.company)}${f('Должность', 'role', s.role)}</div>
    <div class="divider" style="margin:4px 0"></div>
    ${f('Целевая должность', 'targetRole', g.position)}${f('Целевая компания или направление', 'targetCompany', g.company)}
    <div class="grid g3">${f('Ожидаемая зарплата', 'salary', g.salary ?? '', '150000', 'number')}${sel('Валюта', 'currency', CURRENCIES.map((x) => [x, x]), g.currency)}${sel('Срок', 'horizon', HORIZONS, g.horizon)}</div>
    <div class="row spread" style="margin-top:12px"><button type="button" class="pill danger-ghost" id="ed-del">Удалить ученика</button><div class="row"><button type="button" class="pill ghost" data-close>Отмена</button><button class="pill dark" type="submit">Сохранить</button></div></div></form>`,
  (m, close) => {
    m.querySelector('#ed-form').addEventListener('submit', (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
      if (!d.firstName.trim() || !d.lastName.trim()) { toast('Имя и фамилия обязательны'); return; }
      store.updateStudent(id, { firstName: d.firstName.trim(), lastName: d.lastName.trim(), grade: d.grade, status: d.status, company: d.company.trim(), role: d.role.trim(),
        goal: { position: d.targetRole.trim(), company: d.targetCompany.trim(), salary: d.salary ? Number(d.salary) : null, currency: d.currency, horizon: d.horizon } });
      close(); toast('Сохранено'); rerender();
    });
    m.querySelector('#ed-av-del')?.addEventListener('click', () => { store.updateStudent(id, { avatar: '' }); close(); toast('Фото убрано'); rerender(); });
    m.querySelector('#ed-del').addEventListener('click', async () => {
      if (!confirm(`Удалить ${fullName(s)} вместе с историей оценок и файлами? Это нельзя отменить.`)) return;
      await store.removeStudent(id); close(); toast('Ученик удалён'); location.hash = '#/students';
    });
  });
};

// ---------- новая оценка (переоценка) ----------
export function assessView({ id }) {
  const s = store.getStudent(id); if (!s) return notFound();
  const prev = latest(s), scores = { ...prev.scores };
  return {
    shell: 'app', nav: 'students',
    html: `<div class="page view" style="padding-top:36px"><a class="back" href="#/student/${s.id}">${icon('arrow_back')} ${esc(fullName(s))}</a>
      <div class="eyebrow" style="margin-top:20px">Новая оценка</div><h1 class="d-m">Как изменился ${esc(s.firstName)}?</h1>
      <p class="lede" style="margin:8px 0 28px">Значения подставлены из прошлой оценки (${fmtDate(prev.date)}). Измените то, что выросло — пунктир на диаграмме покажет, как было.</p>
      <div class="skills-wrap"><div class="skills-col" id="as-skills">${skillsEditorHtml(scores, prev.scores)}
        <div class="private"><label class="lbl">Комментарий к оценке</label><textarea class="field" id="as-comment" placeholder="Что изменилось, за счёт чего, над чем работаем дальше"></textarea></div>
        <div class="row spread" style="margin-top:8px"><a class="pill ghost" href="#/student/${s.id}">Отмена</a><button class="pill dark lg" id="as-save">${icon('check')} Сохранить оценку</button></div></div>
        <aside class="skills-side"><div class="card"><div id="as-radar"></div><div id="as-tiles"></div></div></aside></div></div>`,
    mount(root) {
      const draw = () => { root.querySelector('#as-radar').innerHTML = radar([{ scores: prev.scores, kind: 'prev' }, { scores, kind: 'now' }]) + radarLegend(true, `Было · ${fmtDate(prev.date)}`, 'Стало'); root.querySelector('#as-tiles').innerHTML = scoreOrb(scores, prev.scores); };
      draw(); bindSkillsEditor(root.querySelector('#as-skills'), scores, draw);
      root.querySelector('#as-save').addEventListener('click', () => {
        const same = SKILLS.every((k) => (scores[k.id] || 0) === (prev.scores[k.id] || 0));
        if (same && !confirm('Оценки не изменились. Всё равно сохранить?')) return;
        store.addAssessment(id, scores, root.querySelector('#as-comment').value); cmp = { id, base: prev.id };
        toast('Оценка сохранена'); location.hash = `#/student/${id}`;
      });
    },
  };
}
