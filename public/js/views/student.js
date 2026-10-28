import * as store from '../store.js';
import { GRADES, STATUSES, RESULTS, mentorshipStatus, studentResult, CURRENCIES, HORIZONS, GROUPS, SKILLS, LEVELS } from '../config.js';
import { confirmDialog, esc, icon, avatar, fileToAvatar, fullName, workLine, fmtDate, fmtMoney, fmtSize, today, safeUrl, linkedInUrl, linkedInLink, host, toast, openModal, downloadBlob, ACT } from '../ui.js';
import { radar, radarLegend, scoreOrb } from '../radar.js';
import { skillsEditorHtml, bindSkillsEditor } from '../skills-editor.js';
import { datePicker } from '../datepicker.js';
import { total, latest, growth, fmt1, signed, selfLatest, blend } from '../metrics.js';

const MAX_FILE = 10 * 1024 * 1024;
let cmp = { id: '', base: '' }; // с какой оценкой сравниваем текущую
let view = 'mentor'; // чья оценка на диаграмме: mentor | self | avg
let last = null; // последний показанный профиль — чтобы переключать вид без перезагрузки
const sid = (el) => el.closest('[data-sid]').dataset.sid;
const rerender = () => window.__rerender();
const notFound = () => ({ shell: 'app', nav: 'students', html: `<div class="page empty view" style="padding-top:96px">${icon('person_off', 'ol')}<p>Ученик не найден</p><a class="pill dark" href="/students">К списку</a></div>` });
const dChip = (d) => d === null || Math.abs(d) < 0.05 ? '' : `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '↑' : '↓'} ${fmt1(Math.abs(d))}</span>`;

// ---------- блоки ----------
function skillRows(now, base) {
  return GROUPS.map((g) => `<div class="sr-grp"><div class="sr-h"><span style="color:${g.color}">${icon(g.icon)}</span>${g.label}</div>
    ${SKILLS.filter((s) => s.g === g.id).map((s) => {
      const v = now.scores[s.id] || 0, b = base ? base.scores[s.id] || 0 : null;
      return `<div class="sr"><span class="sr-n">${esc(s.label)}</span><div class="bar sr-bar"><i style="width:${(v / 5) * 100}%;background:${g.color}"></i>${b ? `<u class="tick" style="left:${(b / 5) * 100}%" title="Было: ${LEVELS[b]}"></u>` : ''}</div><span class="sr-l">${LEVELS[v] || `${fmt1(v)}/5`}</span>${b === null ? '<span></span>' : dChip(v - b) || '<span></span>'}</div>`;
    }).join('')}</div>`).join('');
}

const VIEWS = [['mentor', 'Ментор'], ['self', 'Менти'], ['avg', 'Среднее']];
function competenciesCard(s, now, base, ro) {
  const me = selfLatest(s), mode = me ? view : 'mentor';
  const cur = mode === 'self' ? me : mode === 'avg' ? { date: me.date, scores: blend(now.scores, me.scores) } : now;
  const bs = mode === 'mentor' ? base : null;
  const opts = s.assessments.filter((a) => a.id !== now.id);
  const nowLabel = mode === 'self' ? `Самооценка менти · ${fmtDate(cur.date)}` : mode === 'avg' ? 'Среднее: ментор и менти' : `${bs ? 'Стало' : 'Оценка'} · ${fmtDate(now.date)}`;
  const seg = me ? `<div class="seg" role="group" aria-label="Чья оценка">${VIEWS.map(([v, l]) => `<button type="button" class="${mode === v ? 'on' : ''}" data-act="st-view" data-v="${v}">${l}</button>`).join('')}</div>` : '';
  const sel = !ro && mode === 'mentor' && opts.length ? `<div class="selw">${icon('expand_more', 'trail')}<select class="field sm" id="cmp-sel" aria-label="Сравнить с"><option value="">Без сравнения</option>${opts.map((a) => `<option value="${a.id}" ${base?.id === a.id ? 'selected' : ''}>Было: ${fmtDate(a.date)}</option>`).join('')}</select></div>` : '';
  const bar = seg || sel ? `<div class="cmp-bar">${seg}${sel}</div>` : '';
  const miss = SKILLS.filter((k) => !(cur.scores?.[k.id] > 0)).length;
  const note = (me ? `<div class="small cmp-note">Менти оценил себя ${fmtDate(me.date)}</div>` : '')
    + (!ro && mode === 'mentor' && miss && miss < SKILLS.length ? `<div class="small cmp-note">Не оценено компетенций: ${miss} (бледные подписи на диаграмме). Нажмите «Обновить компетенции», чтобы оценить новые.</div>` : '');
  return `<div class="card" id="comp-card"><div class="card-h"><h2 class="d-s">Компетенции</h2>
      ${ro ? '' : `<a class="pill dark sm" href="/student/${s.id}/assess">Обновить компетенции</a>`}</div>
    ${bar}${note}
    ${radar([...(bs ? [{ scores: bs.scores, kind: 'prev' }] : []), { scores: cur.scores, kind: 'now' }])}
    ${radarLegend(!!bs, bs ? `Было · ${fmtDate(bs.date)}` : '', nowLabel)}
    ${scoreOrb(cur.scores, bs?.scores, { animate: true })}
    <details class="more"><summary>Все навыки подробно ${icon('expand_more')}</summary>${skillRows(cur, bs)}</details></div>`;
}

function historyCard(s, now) {
  const list = [...s.assessments].reverse();
  return `<div class="card"><div class="card-h"><h2 class="d-s">История оценок</h2><span class="small">${s.assessments.length} шт.</span></div><div class="tl">
    ${list.map((a) => { const i = s.assessments.indexOf(a), prev = s.assessments[i - 1], t = total(a.scores), isNow = a.id === now.id;
      return `<div class="tl-i ${isNow ? 'acc' : ''}"><div class="row spread"><div class="tl-t">${fmtDate(a.date)} <span class="muted">· ${fmt1(t)}/5</span> ${prev ? dChip(t - total(prev.scores)) : ''}</div>
        </div>${a.comment ? `<div class="tl-s">${esc(a.comment)}</div>` : ''}</div>`; }).join('')}</div></div>`;
}

const goalCard = (s, ro) => {
  const g = s.goal, h = HORIZONS.find(([v]) => v === g.horizon);
  const empty = !g.position && !g.company && !g.salary;
  return `<div class="card dark goal"><div class="eyebrow lt">Цель</div>
    ${empty ? `<p class="muted" style="margin-top:8px">${ro ? 'Цель пока не указана' : 'Цель не заполнена, добавьте её через «Редактировать»'}</p>` : `<div class="goal-pos">${esc(g.position || 'Должность не указана')}</div>
    ${g.company ? `<div class="muted">${esc(g.company)}</div>` : ''}
    <div class="goal-row"><div><span>Зарплата</span><b>${fmtMoney(g.salary, g.currency)}</b></div><div><span>Срок</span><b>${h && h[0] ? h[1] : 'Не указано'}</b></div><div><span>Сейчас</span><b>${esc(s.grade)}</b></div></div>`}</div>`;
};

function portfolioCard(s, ro) {
  const list = [...s.portfolios].reverse(), active = store.activePortfolioId(s);
  return `<div class="card" id="portfolio-card"><div class="card-h"><h2 class="d-s">Портфолио</h2>${ro ? '' : `<button class="pill ghost sm" data-act="st-add-pf">${icon('add')} Добавить</button>`}</div>
    ${list.length ? `<div class="list">${list.map((p) => `<div class="li ${p.id === active ? '' : 'old'}"><span class="ico-sq">${icon('link')}</span><div class="grow"><a class="link ell" href="${esc(safeUrl(p.url) || '#')}" target="_blank" rel="noopener noreferrer">${esc(p.title)}</a><div class="small ell">${esc(host(p.url))} · ${fmtDate(p.addedAt)}</div>${p.note ? `<div class="small note">${esc(p.note)}</div>` : ''}</div>${p.id === active ? '<span class="chip ok">Актуальное</span>' : ''}
      ${ro ? '' : `<div class="fwrap"><button type="button" class="ws-dots" data-act="file-menu" aria-label="Действия со ссылкой портфолио">${icon('more_horiz')}</button>
        <div class="fmenu"><a class="um-i" href="${esc(safeUrl(p.url) || '#')}" target="_blank" rel="noopener noreferrer">${icon('link')} Открыть ссылку</a>
          ${p.id === active ? '' : `<button type="button" class="um-i" data-act="portfolio-active" data-id="${p.id}">${icon('check_circle', 'ol')} Сделать актуальным</button>`}
          <button type="button" class="um-i danger" data-act="portfolio-del" data-id="${p.id}" data-name="${esc(p.title)}">${icon('delete', 'ol')} Удалить</button></div></div>`}</div>`).join('')}</div>` : '<p class="small">Ссылок пока нет</p>'}
    ${list.length > 1 ? '<p class="small hint">Прошлые версии сохраняются в истории</p>' : ''}</div>`;
}

// Строка файла: имя скачивает файл, троеточие открывает меню (скачать, сделать актуальным, удалить). Актуальный файл помечен чипом.
function fileRow(s, c, kind, ro, ic, activeId, word) {
  const act = c.id === activeId;
  return `<div class="li ${act ? '' : 'old'}"><span class="ico-sq">${icon(ic)}</span><div class="grow">${ro ? `<b class="ell">${esc(c.name)}</b>` : `<button type="button" class="link-btn ell" data-act="st-cv-dl" data-id="${c.id}" data-name="${esc(c.name)}" title="Скачать">${esc(c.name)}</button>`}<div class="small">${fmtSize(c.size)} · ${fmtDate(c.addedAt)}</div></div>${act ? `<span class="chip ok">${word}</span>` : ''}
    ${ro ? '' : `<div class="fwrap"><button type="button" class="ws-dots" data-act="file-menu" aria-label="Действия с файлом">${icon('more_horiz')}</button>
      <div class="fmenu"><button class="um-i" data-act="st-cv-dl" data-id="${c.id}" data-name="${esc(c.name)}">${icon('download', 'ol')} Скачать</button>
        ${act ? '' : `<button class="um-i" data-act="file-active" data-kind="${kind}" data-id="${c.id}">${icon('check_circle', 'ol')} Сделать активным</button>`}
        <button class="um-i danger" data-act="file-del" data-kind="${kind}" data-id="${c.id}" data-name="${esc(c.name)}">${icon('delete', 'ol')} Удалить</button></div></div>`}</div>`;
}
function cvCard(s, ro) {
  const list = [...s.cvs].reverse(), act = store.activeFileId(s, 'cvs');
  return `<div class="card"><div class="card-h"><h2 class="d-s">CV</h2>${ro ? '' : `<label class="pill ghost sm" for="cv-up" style="cursor:pointer">${icon('add')} Добавить</label><input id="cv-up" type="file" hidden accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.rtf">`}</div>
    ${list.length ? `<div class="list">${list.map((c) => fileRow(s, c, 'cvs', ro, 'description', act, 'Актуальное')).join('')}</div>` : '<p class="small">CV пока не загружено</p>'}</div>`;
}

// Договор виден только ментору: на публичной странице его нет (сервер его вообще не отдаёт).
function contractCard(s) {
  const list = [...(s.contracts || [])].reverse(), act = store.activeFileId(s, 'contracts');
  return `<div class="card"><div class="card-h"><h2 class="d-s">Договор</h2><label class="pill ghost sm" for="ct-up" style="cursor:pointer">${icon('add')} Добавить</label><input id="ct-up" type="file" hidden accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.rtf"></div>
    ${list.length ? `<div class="list">${list.map((c) => fileRow(s, c, 'contracts', false, 'contract', act, 'Актуальный')).join('')}</div>` : '<p class="small">Договор пока не загружен</p>'}</div>`;
}

// Отзыв после трудоустройства: ссылку отправляют менти, ответ появляется здесь.
const rvTokens = {};
const stars = (n) => `<span class="stars" aria-label="${n} из 5">${[1, 2, 3, 4, 5].map((i) => icon('star', i <= n ? '' : 'ol')).map((x, i) => `<span class="${i < n ? 'on' : ''}">${x}</span>`).join('')}</span>`;
function reviewCard(s) {
  const r = s.review, tok = rvTokens[s.id];
  return `<div class="card" id="rv-card"><div class="card-h"><h2 class="d-s">Отзыв</h2>${r ? `<span class="small">${fmtDate(r.date)}</span>` : ''}</div>
    ${r ? `<div class="rv-stars">${stars(r.rating)}<b>${r.rating}/5</b></div>${r.comment ? `<p class="rv-text pre">${esc(r.comment)}</p>` : '<p class="small">Без комментария</p>'}`
      : `<p class="small" style="margin-bottom:14px">Отзыва пока нет. Отправьте менти ссылку: откроется страница, где можно поставить оценку и написать комментарий.</p>`}
    <div class="rv-link ${r ? 'sm' : ''}"><input class="field sm" id="rv-url" readonly placeholder="Создаём ссылку…" value="${tok ? esc(`${location.origin}/r/${tok}`) : ''}"><button type="button" class="pill ${r ? 'ghost' : 'dark'} sm" id="rv-copy" data-act="rv-copy" ${tok ? '' : 'disabled'}>${icon('content_copy')} Скопировать</button></div></div>`;
}

const taskText = (t, ro = false) => ro ? `<span class="grow">${esc(t.text)}</span>` : `<button type="button" class="grow task-text" data-act="st-task-edit" data-id="${t.id}" aria-label="Редактировать задачу: ${esc(t.text)}">${esc(t.text)}</button>`;
const tasksCard = (s, ro) => `<div class="card" id="tasks-card"><div class="card-h"><h2 class="d-s">Задачи</h2><span class="small">${s.tasks.filter((t) => t.done).length}/${s.tasks.length}</span></div>
  <div class="tasks">${s.tasks.map((t) => `<div class="task ${t.done ? 'done' : ''}">${ro ? `<span class="tk">${t.done ? icon('check') : ''}</span>` : `<button class="tk" data-act="st-task" data-id="${t.id}" aria-label="Отметить">${t.done ? icon('check') : ''}</button>`}${taskText(t, ro)}${ro ? '' : `<button class="x" data-act="st-task-del" data-id="${t.id}" aria-label="Удалить">${icon('close')}</button>`}</div>`).join('') || '<p class="small">Нет задач</p>'}</div>
  ${ro ? '' : `<form class="row add-row" id="task-form"><input class="field sm" name="text" placeholder="Новая задача для ученика" autocomplete="off" required><button class="pill dark sm" type="submit">Добавить</button></form>`}</div>`;

const sessionsList = (s, ro) => `${[...s.sessions].sort((a, b) => b.date.localeCompare(a.date)).map((x) => `<div class="tl-i"><div class="row spread"><div class="tl-t">${fmtDate(x.date)}</div>${ro ? '' : `<button class="x" data-act="st-sess-del" data-id="${x.id}" aria-label="Удалить">${icon('close')}</button>`}</div><div class="tl-s pre">${esc(x.text)}</div></div>`).join('')}`;
const sessionsCard = (s, ro) => `<div class="card" id="sessions-card"><div class="card-h"><h2 class="d-s">Встречи и заметки</h2></div>
  ${ro ? '' : `<form class="col" id="session-form" novalidate><div class="row">${datePicker('date', today())}<button class="pill dark sm" type="submit" style="margin-left:auto">Записать</button></div><textarea class="field sm" name="text" rows="2" aria-label="Заметка о встрече" aria-describedby="session-error" placeholder="О чём говорили, договорённости, что обсудить дальше" required></textarea><p class="field-error hide" id="session-error" role="alert">Напишите, что обсудили на встрече</p></form>`}
  <div class="tl" data-sessions-list style="margin-top:${ro ? 0 : 20}px">${sessionsList(s, ro)}</div></div>`;

const privateCard = (s) => `<div class="card flat"><div class="card-h"><h2 class="d-s">${icon('lock')} Личная заметка</h2><span class="small">видите только вы</span></div>
  <textarea class="field" id="private-note" rows="4" placeholder="Сильные стороны, риски, на что обратить внимание…">${esc(s.privateNote)}</textarea></div>`;

// ---------- страница ученика ----------
// Общая вёрстка для кабинета ментора и для публичной ссылки (ro = только просмотр: без кнопок, форм и личной заметки).
export function studentPage(s, base, ro = false) {
  last = { s, base, ro }; const token = typeof ro === 'string' ? ro : ''; // для публичной страницы ro — это токен ссылки
  const show = (k) => !ro || s.shareOpts?.[k] !== false; // на публичной странице ментор мог скрыть разделы
  const now = latest(s), st = STATUSES[mentorshipStatus(s)], result = RESULTS[studentResult(s)], g = growth(s);
  const av = ro ? avatar(s, 'xl') : `<label class="av-edit" for="av-up" title="Сменить фото">${avatar(s, 'xl')}<span class="av-cam">${icon('photo_camera')}</span></label><input id="av-up" type="file" accept="image/*" hidden>`;
  return `<div class="hero"><div class="hero-l">${av}<div><div class="student-name"><h1 class="d-m">${esc(fullName(s))}</h1>${linkedInLink(s.linkedin)}</div>
      <div class="muted student-description">${esc(workLine(s))}</div>
      <div class="row wrap student-badges"><span class="chip on">${esc(s.grade)}</span><span class="chip ${st.tone}">${st.label}</span><span class="chip ${result.tone}">${result.label}</span>${show('competencies') ? `<span class="chip">${fmt1(total(now.scores))}/5 ${g === null ? '' : dChip(g)}</span>` : ''}</div></div></div>
      ${ro ? (show('competencies') ? `<div class="row"><a class="pill dark" href="/s/${esc(token)}/assess">Оценить компетенции</a></div>` : '') : `<div class="row"><button class="pill ghost" data-act="st-share">${icon('ios_share')} Поделиться</button><button class="pill ghost" data-act="st-edit">${icon('edit')} Редактировать</button></div>`}</div>
    <div class="detail"><div class="col-main">${show('competencies') ? competenciesCard(s, now, base, ro) : ''}${show('history') ? historyCard(s, now) : ''}${show('sessions') ? sessionsCard(s, ro) : ''}</div>
      <div class="col-side">${ro || studentResult(s) !== 'hired' ? '' : reviewCard(s)}${show('goal') ? goalCard(s, ro) : ''}${show('portfolio') ? portfolioCard(s, ro) : ''}${show('cv') ? cvCard(s, ro) : ''}${ro ? '' : contractCard(s)}${show('tasks') ? tasksCard(s, ro) : ''}${ro ? '' : privateCard(s)}</div></div>`;
}
// Оценка, с которой сравниваем по умолчанию: самая первая (если оценок больше одной).
export const defaultBase = (s) => (s.assessments.length > 1 ? s.assessments[0] : null);

export function studentView({ id }) {
  const s = store.getStudent(id); if (!s) return notFound();
  if (s.workspaceId) store.setWs(s.workspaceId); // открыли ученика из другого воркспейса — переключаемся на него
  if (cmp.id !== id) cmp = { id, base: defaultBase(s)?.id || '' };
  const now = latest(s), base = s.assessments.find((a) => a.id === cmp.base && a.id !== now.id) || null;
  return {
    shell: 'app', nav: 'students',
    html: `<div class="page view" data-sid="${s.id}" style="padding-top:36px">
      <a class="back" href="/students">${icon('arrow_back')} Ученики</a>
      ${studentPage(s, base)}</div>`,
    mount(root) {
      store.refreshSelf(id).then((changed) => { if (changed && location.pathname === `/student/${id}`) rerender(); }).catch(() => {});
      root.querySelector('#private-note').addEventListener('change', (e) => { store.updateStudent(id, { privateNote: e.target.value.trim() }); toast('Заметка сохранена'); });
      bindTaskForm(root, id);
      const sessionForm = root.querySelector('#session-form'), sessionText = sessionForm.elements.text;
      const sessionError = sessionForm.querySelector('#session-error');
      const showSessionError = (invalid) => {
        sessionText.setAttribute('aria-invalid', String(invalid));
        sessionError.classList.toggle('hide', !invalid);
      };
      sessionText.addEventListener('input', () => { if (sessionText.value.trim()) showSessionError(false); });
      sessionForm.addEventListener('submit', (e) => {
        e.preventDefault(); const f = new FormData(e.target), text = f.get('text');
        if (!text.trim()) { showSessionError(true); sessionText.focus(); return; }
        showSessionError(false);
        store.addSession(id, { date: f.get('date'), text });
        refreshSessions(id); e.target.elements.text.value = ''; toast('Запись добавлена');
      });
      root.querySelector('#av-up').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { store.updateStudent(id, { avatar: await fileToAvatar(f) }); toast('Фото обновлено'); rerender(); } catch { toast('Не удалось прочитать изображение'); }
      });
      if (studentResult(s) === 'hired') store.reviewLink(id).then((t) => { rvTokens[id] = t; const i = root.querySelector('#rv-url'); if (i) { i.value = `${location.origin}/r/${t}`; root.querySelector('#rv-copy').disabled = false; } }).catch(() => {});
      root.querySelector('#ct-up').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return; if (f.size > MAX_FILE) { toast('Файл больше 10 МБ'); return; }
        try { await store.addContract(id, f); toast('Договор загружен'); rerender(); } catch { toast('Не удалось сохранить файл'); }
      });
      root.querySelector('#cv-up').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return; if (f.size > MAX_FILE) { toast('Файл больше 10 МБ'); return; }
        try { await store.addCv(id, f); toast('Новая версия CV загружена'); rerender(); } catch { toast('Не удалось сохранить файл'); }
      });
    },
  };
}

document.addEventListener('change', (e) => { if (e.target.id === 'cmp-sel') { cmp.base = e.target.value; rerender(); } });
ACT['st-view'] = (el) => {
  view = el.dataset.v; const card = document.getElementById('comp-card'); if (!card || !last) return;
  const { s, base, ro } = last; card.outerHTML = competenciesCard(s, latest(s), base, ro);
};
ACT['rv-copy'] = async () => {
  const inp = document.getElementById('rv-url'); if (!inp?.value) return;
  try { await navigator.clipboard.writeText(inp.value); } catch { inp.select(); document.execCommand('copy'); }
  toast('Ссылка скопирована');
};
// Изменения задач не пересоздают диаграммы и незаполненные формы профиля.
function bindTaskForm(root, id) {
  root.querySelector('#task-form').addEventListener('submit', (e) => {
    e.preventDefault(); const text = new FormData(e.target).get('text');
    if (text.trim()) { store.addTask(id, text); refreshTasks(id, { focus: true, clear: true }); }
  });
}
function refreshTasks(id, { focus = false, clear = false } = {}) {
  const card = document.getElementById('tasks-card');
  if (!card) return;
  const text = card.querySelector('[name=text]').value;
  card.outerHTML = tasksCard(store.getStudent(id), false);
  bindTaskForm(document, id);
  const input = document.querySelector('#task-form [name=text]');
  if (!clear) input.value = text;
  if (focus) input.focus({ preventScroll: true });
}
ACT['st-task'] = (el) => { const id = sid(el); store.toggleTask(id, el.dataset.id); refreshTasks(id); };
ACT['st-task-del'] = (el) => { const id = sid(el); store.removeTask(id, el.dataset.id); refreshTasks(id); };
ACT['st-task-edit'] = (el) => {
  const id = sid(el), t = store.getStudent(id)?.tasks.find((t) => t.id === el.dataset.id);
  if (!t) return;
  const input = document.createElement('input');
  input.className = 'field sm task-input'; input.value = t.text;
  input.setAttribute('aria-label', 'Текст задачи');
  el.replaceWith(input);
  let cancelled = false;
  input.addEventListener('blur', () => {
    const text = input.value.trim();
    if (!cancelled && text && text !== t.text) store.updateTask(id, t.id, text);
    // Меняем только текст: клик по чекбоксу или удалению должен попасть в ту же кнопку.
    input.outerHTML = taskText(t);
  }, { once: true });
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault(); cancelled = e.key === 'Escape'; input.blur();
    }
  });
  input.focus(); input.select();
};
function refreshSessions(id) {
  const list = document.querySelector('[data-sessions-list]'), s = store.getStudent(id);
  if (list && s) list.innerHTML = sessionsList(s, false);
}
ACT['st-sess-del'] = async (el) => { if (await confirmDialog({ title: 'Удалить запись о встрече?', text: 'Запись исчезнет из истории' })) { const id = sid(el); store.removeSession(id, el.dataset.id); refreshSessions(id); } };
ACT['file-menu'] = (el) => {
  const menu = el.parentElement.querySelector('.fmenu'), open = menu.classList.contains('on');
  document.querySelectorAll('.fmenu.on').forEach((m) => m.classList.remove('on')); if (!open) menu.classList.add('on');
};
const closeFileMenus = () => document.querySelectorAll('.fmenu.on').forEach((m) => m.classList.remove('on'));
function refreshPortfolio(id) {
  const card = document.getElementById('portfolio-card'), s = store.getStudent(id);
  if (card && s) card.outerHTML = portfolioCard(s, false);
}
ACT['portfolio-active'] = (el) => {
  const id = sid(el); closeFileMenus(); store.setActivePortfolio(id, el.dataset.id);
  refreshPortfolio(id); toast('Портфолио теперь актуальное');
};
ACT['portfolio-del'] = async (el) => {
  const id = sid(el), pid = el.dataset.id; closeFileMenus();
  if (!(await confirmDialog({ title: 'Удалить ссылку на портфолио?', text: `«${el.dataset.name}» будет удалено из профиля` }))) return;
  store.removePortfolio(id, pid); refreshPortfolio(id); toast('Ссылка удалена');
};
ACT['file-active'] = (el) => { closeFileMenus(); store.setActiveFile(sid(el), el.dataset.kind, el.dataset.id); toast('Файл теперь актуальный'); rerender(); };
ACT['file-del'] = async (el) => {
  closeFileMenus();
  if (!(await confirmDialog({ title: 'Удалить файл?', text: `«${el.dataset.name}» будет удалён без возможности восстановления` }))) return;
  try { await store.removeFile(sid(el), el.dataset.kind, el.dataset.id); toast('Файл удалён'); rerender(); } catch { toast('Не удалось удалить файл'); }
};
ACT['st-cv-dl'] = async (el) => {
  closeFileMenus();
  try { const blob = await store.getFile(el.dataset.id); if (!blob) throw 0; downloadBlob(blob, el.dataset.name); } catch { toast('Файл не найден (в резервную копию файлы не входят)'); }
};
ACT['st-add-pf'] = (el) => {
  const id = sid(el);
  openModal(`<h2 class="d-s">Новая версия портфолио</h2><p class="small" style="margin:6px 0 20px">Прежние ссылки останутся в истории</p>
    <form class="col" id="pf-form"><div><label class="lbl">Ссылка *</label><input class="field" name="url" placeholder="behance.net/…, сайт, Notion, PDF" required></div>
    <div><label class="lbl">Название</label><input class="field" name="title" placeholder="Например: Сайт, версия 2"></div>
    <div><label class="lbl">Что изменилось</label><input class="field" name="note" placeholder="Добавил 2 кейса, переделал главную"></div>
    <div class="form-err hide" id="pf-err">${icon('error')} Проверьте ссылку</div>
    <div class="row spread" style="margin-top:8px"><button type="button" class="pill ghost" data-close>Отмена</button><button class="pill dark" type="submit">Добавить</button></div></form>`,
  (m, close) => m.querySelector('#pf-form').addEventListener('submit', (e) => {
    e.preventDefault(); const f = new FormData(e.target), url = safeUrl(f.get('url') || '');
    if (!url) { m.querySelector('#pf-err').classList.remove('hide'); return; }
    store.addPortfolio(id, { url, title: f.get('title'), note: f.get('note') }); close(); toast('Портфолио добавлено'); refreshPortfolio(id);
  }));
};
ACT['st-edit'] = (el) => {
  const id = sid(el), s = store.getStudent(id), g = s.goal;
  const f = (label, name, v, ph = '', type = 'text', dis = false) => `<div><label class="lbl">${label}</label><input class="field" ${dis ? 'disabled' : ''} name="${name}" type="${type}" value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off" data-1p-ignore data-lpignore="true" data-form-type="other"></div>`;
  const sel = (label, name, opts, cur) => `<div><label class="lbl">${label}</label><div class="selw">${icon('expand_more', 'trail')}<select class="field" name="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>`;
  openModal(`<h2 class="d-s" style="margin-bottom:20px">Редактировать ученика</h2><form class="col" id="ed-form">
    ${s.avatar ? `<div class="row">${avatar(s, 'lg')}<button type="button" class="pill ghost sm" id="ed-av-del">Убрать фото</button></div>` : ''}
    <div class="grid g2">${f('Имя', 'firstName', s.firstName)}${f('Фамилия', 'lastName', s.lastName)}</div>
    ${f('LinkedIn', 'linkedin', s.linkedin || '', 'linkedin.com/in/…')}
    <div class="grid g2">${sel('Грейд', 'grade', GRADES.map((x) => [x, x]), s.grade)}${sel('Статус менторства', 'status', Object.entries(STATUSES).map(([k, v]) => [k, v.label]), mentorshipStatus(s))}</div>
    ${sel('Результат', 'result', Object.entries(RESULTS).map(([k, v]) => [k, v.label]), studentResult(s))}
    <div class="grid g2"><div>${f('Компания', 'company', s.company, '', 'text', s.jobless)}<label class="chk"><input type="checkbox" name="jobless" ${s.jobless ? 'checked' : ''}><span>Сейчас без работы</span></label></div>${f('Должность', 'role', s.role, '', 'text', s.jobless)}</div>
    <div class="divider" style="margin:4px 0"></div>
    ${f('Целевая должность', 'targetRole', g.position)}${f('Целевая компания или направление', 'targetCompany', g.company)}
    <div class="grid g3">${f('Ожидаемая зарплата', 'salary', g.salary ?? '', '150000', 'number')}${sel('Валюта', 'currency', CURRENCIES.map((x) => [x, x]), g.currency)}${sel('Срок', 'horizon', HORIZONS, g.horizon)}</div>
    <div class="row spread" style="margin-top:12px"><button type="button" class="pill danger-ghost" id="ed-del">Удалить ученика</button><div class="row"><button type="button" class="pill ghost" data-close>Отмена</button><button class="pill dark" type="submit">Сохранить</button></div></div></form>`,
  (m, close) => {
    m.querySelector('#ed-form').addEventListener('submit', (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
      if (!d.firstName.trim() || !d.lastName.trim()) { toast('Имя и фамилия обязательны'); return; }
      if (d.linkedin.trim() && !linkedInUrl(d.linkedin)) { toast('Укажите ссылку на профиль LinkedIn'); return; }
      store.updateStudent(id, { linkedin: linkedInUrl(d.linkedin) || '', firstName: d.firstName.trim(), lastName: d.lastName.trim(), grade: d.grade, status: d.status, result: d.result, jobless: !!d.jobless, company: d.jobless ? '' : d.company.trim(), role: d.jobless ? '' : d.role.trim(),
        goal: { position: d.targetRole.trim(), company: d.targetCompany.trim(), salary: d.salary ? Number(d.salary) : null, currency: d.currency, horizon: d.horizon } });
      close(); toast('Сохранено'); rerender();
    });
    m.querySelector('[name=jobless]').addEventListener('change', (e) => { for (const n of ['company', 'role']) { const c = m.querySelector(`[name=${n}]`); c.disabled = e.target.checked; if (e.target.checked) c.value = ''; } });
    m.querySelector('#ed-av-del')?.addEventListener('click', () => { store.updateStudent(id, { avatar: '' }); close(); toast('Фото убрано'); rerender(); });
    m.querySelector('#ed-del').addEventListener('click', async () => {
      if (!(await confirmDialog({ title: `Удалить ученика ${fullName(s)}?`, text: 'Вместе с историей оценок, заметками и файлами. Это нельзя отменить.' }))) return;
      await store.removeStudent(id); close(); toast('Ученик удалён'); window.__go('/students');
    });
  });
};

// ---------- новая оценка (переоценка) ----------
export function assessView({ id }) {
  const s = store.getStudent(id); if (!s) return notFound();
  const prev = latest(s), scores = { ...prev.scores };
  return {
    shell: 'app', nav: 'students',
    html: `<div class="page view" style="padding-top:36px;padding-bottom:32px"><a class="back" href="/student/${s.id}">${icon('arrow_back')} ${esc(fullName(s))}</a>
      <h1 class="d-m" style="margin-top:20px">Обновите компетенции</h1>
      <p class="lede" style="margin:8px 0 20px">Уточните баллы текущей оценки (${fmtDate(prev.date)}) или сохраните переоценку для фиксации прогресса</p>
      <div class="assessment-mode"><label class="chk"><input type="checkbox" id="as-reassess"><span>Сохранить как переоценку</span></label>
        <p class="small hint" id="as-mode-hint">Баллы обновятся в текущей оценке, дата и запись в истории сохранятся</p></div>
      <div class="skills-wrap"><div class="skills-col" id="as-skills">${skillsEditorHtml(scores)}
        <div class="private"><label class="lbl">Комментарий к оценке</label><textarea class="field" id="as-comment" placeholder="Что изменилось, за счёт чего, над чем работаем дальше">${esc(prev.comment)}</textarea></div>
        </div>
        <aside class="skills-side"><div class="card"><div id="as-radar"></div><div id="as-tiles"></div></div></aside></div></div>
      <div class="stage-foot flat"><div class="in"><a class="pill ghost" href="/student/${s.id}">Отмена</a><button class="pill dark lg" id="as-save">Обновить текущую оценку</button></div></div>`,
    mount(root) {
      const checkbox = root.querySelector('#as-reassess'), comment = root.querySelector('#as-comment');
      const draw = () => {
        // Исправление сравниваем с предыдущей записью истории, переоценку — с текущей.
        const base = checkbox.checked ? prev : s.assessments[s.assessments.length - 2];
        root.querySelector('#as-radar').innerHTML = radar([...(base ? [{ scores: base.scores, kind: 'prev' }] : []), { scores, kind: 'now' }]) + radarLegend(!!base, base ? `Было · ${fmtDate(base.date)}` : '', checkbox.checked ? 'Новая оценка' : 'Текущая оценка');
        root.querySelector('#as-tiles').innerHTML = scoreOrb(scores, base?.scores);
      };
      draw(); bindSkillsEditor(root.querySelector('#as-skills'), scores, draw);
      let updateComment = prev.comment || '', reassessComment = '';
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) { updateComment = comment.value; comment.value = reassessComment; }
        else { reassessComment = comment.value; comment.value = updateComment; }
        root.querySelector('#as-save').textContent = checkbox.checked ? 'Сохранить переоценку' : 'Обновить текущую оценку';
        root.querySelector('#as-mode-hint').textContent = checkbox.checked
          ? 'Новая оценка сохранится с сегодняшней датой и войдёт в динамику роста'
          : 'Баллы обновятся в текущей оценке, дата и запись в истории сохранятся';
        draw();
      });
      root.querySelector('#as-save').addEventListener('click', async () => {
        const same = SKILLS.every((k) => (scores[k.id] || 0) === (prev.scores[k.id] || 0));
        if (checkbox.checked) {
          if (same && !(await confirmDialog({ title: 'Оценки не изменились', text: 'Всё равно сохранить новую переоценку?', ok: 'Сохранить', danger: false }))) return;
          store.addAssessment(id, scores, comment.value); cmp = { id, base: prev.id };
        } else {
          store.updateAssessment(id, prev.id, scores, comment.value);
        }
        toast(checkbox.checked ? 'Переоценка сохранена' : 'Текущая оценка обновлена'); window.__go(`/student/${id}`);
      });
    },
  };
}

// ---------- публичная ссылка ----------
ACT['st-share'] = (el) => {
  const id = sid(el), url = (t) => `${location.origin}/s/${t}`;
  openModal(`<h2 class="d-s">Поделиться профилем</h2>
    <p class="small" style="margin:6px 0 20px">Ссылка открывает профиль только для просмотра: без входа и без вашей личной заметки. Менти сможет пройти самооценку по тем же навыкам, и вы увидите обе оценки и среднюю. Данные всегда актуальные.</p>
    <div id="sh-body"><div class="small">Загрузка…</div></div>
    <div class="row" style="justify-content:flex-end;margin-top:20px"><button type="button" class="pill ghost" data-close>Закрыть</button></div>`,
  async (m) => {
    const body = m.querySelector('#sh-body');
    const PARTS = [['competencies', 'Компетенции'], ['history', 'История оценок'], ['goal', 'Цель'], ['portfolio', 'Портфолио'], ['cv', 'CV'], ['sessions', 'Встречи и заметки'], ['tasks', 'Задачи']];
    const paint = (sh) => {
      body.innerHTML = sh?.token
        ? `<div class="col" style="gap:14px"><input class="field" id="sh-url" readonly value="${esc(url(sh.token))}"><div class="row spread"><button type="button" class="pill dark" id="sh-copy">${icon('content_copy')} Скопировать ссылку</button><button type="button" class="pill danger-ghost" id="sh-off">Отключить</button></div>
          <div><div class="lbl" style="margin-bottom:2px">Что показывать по ссылке</div><div class="sh-opts">${PARTS.map(([k, l]) => `<label class="chk"><input type="checkbox" data-opt="${k}" ${sh.opts[k] !== false ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
          <p class="small hint" style="margin-top:10px">Договор и личная заметка не показываются никогда. Изменения применяются сразу.</p></div></div>`
        : `<button type="button" class="pill dark" id="sh-on">${icon('link')} Создать ссылку</button>`;
    };
    try { paint(await store.getShare(id)); } catch { body.innerHTML = '<div class="form-err">Не удалось загрузить</div>'; return; }
    m.addEventListener('change', async (e) => {
      const k = e.target.dataset?.opt; if (!k) return;
      const opts = Object.fromEntries([...m.querySelectorAll('[data-opt]')].map((c) => [c.dataset.opt, c.checked]));
      try { await store.setShareOpts(id, opts); } catch { e.target.checked = !e.target.checked; toast('Не удалось сохранить'); }
    });
    m.addEventListener('click', async (e) => {
      try {
        if (e.target.closest('#sh-on')) paint(await store.createShare(id));
        else if (e.target.closest('#sh-off')) { if (await confirmDialog({ title: 'Отключить ссылку?', text: 'Те, у кого она есть, потеряют доступ', ok: 'Отключить' })) { await store.revokeShare(id); paint(null); toast('Ссылка отключена'); } }
        else if (e.target.closest('#sh-copy')) {
          const inp = m.querySelector('#sh-url');
          try { await navigator.clipboard.writeText(inp.value); } catch { inp.select(); document.execCommand('copy'); }
          toast('Ссылка скопирована');
        }
      } catch { toast('Не удалось выполнить действие'); }
    });
  });
};
