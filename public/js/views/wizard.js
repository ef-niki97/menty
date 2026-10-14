import { addStudent } from '../store.js';
import { GRADES, CURRENCIES, HORIZONS } from '../config.js';
import { esc, icon, avatar, workLine, safeUrl, fmtSize, toast, ACT, fileToAvatar } from '../ui.js';
import { radar, radarLegend, scoreOrb } from '../radar.js';
import { skillsEditorHtml, bindSkillsEditor } from '../skills-editor.js';
import { total, fmt1 } from '../metrics.js';

const STEPS = ['Ученик', 'Цели', 'Компетенции', 'Итог'];
const MAX_FILE = 10 * 1024 * 1024;
const blank = () => ({ avatar: '', firstName: '', lastName: '', grade: 'Junior', status: 'active', jobless: false, company: '', role: '', portfolio: '', cv: null, targetRole: '', targetCompany: '', salary: '', currency: '₽', horizon: '', scores: {}, privateNote: '' });

let draft = blank(), step = 1, saving = false;
const nameOk = () => draft.firstName.trim() && draft.lastName.trim();

const input = (label, f, { ph = '', type = 'text', hint = '', off = false } = {}) => `<div><label class="lbl">${label}</label><input class="field" ${off ? 'disabled' : ''} data-f="${f}" type="${type}" placeholder="${esc(ph)}" value="${esc(draft[f])}" autocomplete="off">${hint ? `<div class="small hint">${hint}</div>` : ''}</div>`;

function stepProfile() {
  const demoAv = avatar({ firstName: draft.firstName || '?', lastName: draft.lastName || '', avatar: draft.avatar }, 'xl');
  return `<div class="eyebrow">Шаг 1 из 4</div><h1 class="d-m">Расскажите об ученике</h1>
    <div class="profile-top">${demoAv}<div class="col" style="gap:8px"><div class="row wrap"><label class="pill ghost sm" for="w-av" style="cursor:pointer">${icon('photo_camera')} ${draft.avatar ? 'Заменить фото' : 'Загрузить фото'}</label>${draft.avatar ? `<button type="button" class="pill ghost sm" data-act="w-av-clear">Убрать</button>` : ''}</div><div class="small">JPG, PNG или WebP. Фото обрежется по центру в квадрат.</div></div><input id="w-av" type="file" accept="image/*" hidden></div>
    <div class="grid g2">${input('Имя *', 'firstName', { ph: 'Анна' })}${input('Фамилия *', 'lastName', { ph: 'Соколова' })}</div>
    <div><label class="lbl">Грейд</label><div class="seg wrap" id="w-grade">${GRADES.map((g) => `<button type="button" class="${draft.grade === g ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div></div>
    <div class="grid g2"><div>${input('Текущее место работы', 'company', { ph: 'Компания или «Фриланс»', off: draft.jobless })}<label class="chk"><input type="checkbox" id="w-jobless" ${draft.jobless ? 'checked' : ''}><span>Сейчас без работы</span></label></div>${input('Должность', 'role', { ph: 'Junior-дизайнер' })}</div>
    ${input('Портфолио', 'portfolio', { ph: 'behance.net/…, сайт или другая ссылка', hint: 'Следующие версии портфолио можно будет добавлять в профиле — история сохранится.' })}
    <div><label class="lbl">CV</label>
      <label class="drop ${draft.cv ? 'has' : ''}" id="w-drop" for="w-cv">${draft.cv ? `${icon('description')}<div class="grow"><b class="ell">${esc(draft.cv.name)}</b><div class="small">${fmtSize(draft.cv.size)}</div></div><button type="button" class="chip" data-act="w-cv-clear">${icon('close')} Убрать</button>` : `${icon('upload_file', 'ol')}<div><b>Загрузить CV</b><div class="small">PDF, DOC или DOCX до 10 МБ — нажмите или перетащите файл</div></div>`}</label>
      <input id="w-cv" type="file" hidden accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.rtf"></div>`;
}
const stepGoals = () => `<div class="eyebrow">Шаг 2 из 4</div><h1 class="d-m">Куда стремимся</h1><p class="lede" style="margin-top:-8px">Целевая роль и условия: от них отсчитываем прогресс. Подходит и для смены работы, и для роста внутри компании.</p>
    ${input('Целевая должность', 'targetRole', { ph: 'Middle Product Designer' })}
    ${input('Целевая компания или направление', 'targetCompany', { ph: 'Конкретная компания, финтех, агентство, рост внутри текущей…' })}
    <div class="grid g2"><div><label class="lbl">Ожидаемая зарплата</label><div class="row"><input class="field" data-f="salary" type="number" min="0" step="1000" placeholder="150000" value="${esc(draft.salary)}"><div class="selw cur">${icon('expand_more', 'trail')}<select class="field" data-f="currency" aria-label="Валюта">${CURRENCIES.map((c) => `<option ${draft.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div></div>
    <div><label class="lbl">Срок достижения</label><div class="selw">${icon('expand_more', 'trail')}<select class="field" data-f="horizon">${HORIZONS.map(([v, l]) => `<option value="${v}" ${draft.horizon === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></div>`;
const stepSkills = () => `<div class="eyebrow">Шаг 3 из 4</div><h1 class="d-m">Оцените компетенции</h1><p class="lede" style="margin-top:-8px">От 1 до 5 по каждому навыку. Диаграмма справа обновляется сразу.</p>
    <div class="skills-wrap"><div class="skills-col" id="w-skills">${skillsEditorHtml(draft.scores)}
      <div class="private"><label class="lbl">${icon('lock')} Личная заметка о дизайнере</label><textarea class="field" data-f="privateNote" placeholder="Видите только вы: сильные стороны, риски, что важно помнить…">${esc(draft.privateNote)}</textarea></div></div>
      <aside class="skills-side"><div class="card"><div id="w-radar">${radar([{ scores: draft.scores, kind: 'now' }])}</div>${radarLegend(false, '', 'Стартовая оценка')}</div></aside></div>`;
function stepSummary() {
  const url = draft.portfolio && safeUrl(draft.portfolio);
  const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v ? esc(v) : '<span class="muted">—</span>'}</b></div>`;
  return `<div class="eyebrow">Шаг 4 из 4</div><h1 class="d-m">Всё готово к созданию</h1><p class="lede" style="margin-top:-8px">Это стартовая точка. При следующих оценках диаграмма покажет «было / стало».</p>
    <div class="sum-grid"><div class="card"><div class="sum-av">${avatar(draft, 'lg')}<div><div class="d-s">${esc(draft.firstName)} ${esc(draft.lastName)}</div><span class="chip on">${esc(draft.grade)}</span></div></div>
      ${kv('Работает', workLine({ role: draft.role, company: draft.company, jobless: draft.jobless }) === 'Место работы не указано' ? '' : workLine(draft))}${kv('Портфолио', url || draft.portfolio)}${kv('CV', draft.cv?.name)}
      <div class="divider"></div>${kv('Цель', draft.targetRole)}${kv('Компания', draft.targetCompany)}${kv('Зарплата', draft.salary ? `${Number(draft.salary).toLocaleString('ru-RU')} ${draft.currency}` : '')}${kv('Срок', HORIZONS.find(([v]) => v === draft.horizon)?.[1] !== 'Не указан' ? HORIZONS.find(([v]) => v === draft.horizon)?.[1] : '')}
      ${draft.privateNote ? `<div class="divider"></div><div class="kv"><span>${icon('lock')} Личная заметка</span><b class="note">${esc(draft.privateNote)}</b></div>` : ''}</div>
      <div class="card">${radar([{ scores: draft.scores, kind: 'now' }])}${radarLegend(false, '', 'Стартовая оценка')}${scoreOrb(draft.scores, null, { animate: true })}</div></div>`;
}

const BODY = [null, stepProfile, stepGoals, stepSkills, stepSummary];

export function wizardView() {
  draft = blank(); step = 1; saving = false;
  return {
    shell: 'bare',
    html: `<div class="stage view"><div class="stage-top"><a class="back" href="/students">${icon('arrow_back')} К ученикам</a><span class="small">Новый ученик</span></div>
      <div class="stage-body"><nav class="side-steps" id="w-steps" aria-label="Шаги"></nav>
      <div class="stage-col"><div class="stage-main" id="w-main"></div></div></div>
      <div class="stage-foot"><div class="in" id="w-foot"></div></div></div>`,
    mount(root) {
      const main = root.querySelector('#w-main'), steps = root.querySelector('#w-steps'), foot = root.querySelector('#w-foot');

      const syncFoot = () => {
        foot.innerHTML = `${step > 1 ? `<button class="pill ghost" data-act="w-back">Назад</button>` : '<span></span>'}
          ${step < 4 ? `<button class="pill dark" data-act="w-next" ${step === 1 && !nameOk() ? 'disabled' : ''}>Далее ${icon('arrow_forward')}</button>` : `<button class="pill dark lg" data-act="w-create" ${saving ? 'disabled' : ''}>${icon('check')} Создать ученика</button>`}`;
        steps.innerHTML = STEPS.map((l, i) => { const n = i + 1, st = n < step ? 'done' : n === step ? 'cur' : ''; return `<button class="ss ${st}" data-act="w-goto" data-n="${n}" ${n === step ? 'aria-current="step"' : ''}><span class="ss-n">${n < step ? icon('check') : n}</span><span class="ss-l">${l}</span></button>`; }).join('');
      };
      const paint = () => {
        main.className = `stage-main ${step === 3 || step === 4 ? 'wide' : ''}`;
        main.innerHTML = `<div class="wz-body col">${BODY[step]()}</div>`;
        if (step === 3) bindSkillsEditor(main.querySelector('#w-skills'), draft.scores, () => { main.querySelector('#w-radar').innerHTML = radar([{ scores: draft.scores, kind: 'now' }]); });
        syncFoot(); window.scrollTo(0, 0);
      };
      const go = (n) => { if (n > 1 && !nameOk()) { step = 1; paint(); toast('Укажите имя и фамилию ученика'); return; } step = Math.max(1, Math.min(4, n)); paint(); };

      main.addEventListener('input', (e) => { const f = e.target.dataset.f; if (!f) return; draft[f] = e.target.value; if (f === 'firstName' || f === 'lastName') syncFoot(); });
      main.addEventListener('change', async (e) => {
        if (e.target.id === 'w-jobless') { draft.jobless = e.target.checked; if (draft.jobless) draft.company = ''; const c = main.querySelector('[data-f=company]'); c.disabled = draft.jobless; c.value = draft.company; }
        if (e.target.id === 'w-cv') setCv(e.target.files[0]);
        if (e.target.id === 'w-av') { const f = e.target.files[0]; if (!f) return; try { draft.avatar = await fileToAvatar(f); paint(); } catch { toast('Не удалось прочитать изображение'); } }
      });
      main.addEventListener('click', (e) => { const g = e.target.closest('#w-grade button'); if (g) { draft.grade = g.dataset.g; main.querySelectorAll('#w-grade button').forEach((b) => b.classList.toggle('on', b === g)); } });
      main.addEventListener('dragover', (e) => { if (e.target.closest('#w-drop')) { e.preventDefault(); e.target.closest('#w-drop').classList.add('over'); } });
      main.addEventListener('dragleave', (e) => e.target.closest('#w-drop')?.classList.remove('over'));
      main.addEventListener('drop', (e) => { if (e.target.closest('#w-drop')) { e.preventDefault(); setCv(e.dataTransfer.files[0]); } });
      const setCv = (file) => { if (!file) return; if (file.size > MAX_FILE) { toast('Файл больше 10 МБ'); return; } draft.cv = file; paint(); };

      ACT['w-next'] = () => go(step + 1);
      ACT['w-back'] = () => go(step - 1);
      ACT['w-goto'] = (el) => go(+el.dataset.n);
      ACT['w-av-clear'] = () => { draft.avatar = ''; paint(); };
      ACT['w-cv-clear'] = (_, e) => { e.preventDefault(); draft.cv = null; paint(); };
      ACT['w-create'] = async () => {
        if (!nameOk() || saving) return;
        if (draft.portfolio && !safeUrl(draft.portfolio)) { step = 1; paint(); toast('Проверьте ссылку на портфолио'); return; }
        saving = true; syncFoot();
        try { const s = await addStudent({ ...draft, portfolio: draft.portfolio ? safeUrl(draft.portfolio) : '' }); toast('Ученик создан'); window.__go(`/student/${s.id}`); }
        catch (err) { saving = false; syncFoot(); toast('Не удалось создать ученика'); console.error(err); }
      };
      paint();
    },
  };
}
