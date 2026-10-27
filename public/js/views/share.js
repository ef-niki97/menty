import { api } from '../api.js';
import { icon, logo, esc, toast, confirmDialog } from '../ui.js';
import * as store from '../store.js';
import { SKILLS } from '../config.js';
import { selfLatest } from '../metrics.js';
import { radar, radarLegend, scoreOrb } from '../radar.js';
import { skillsEditorHtml, bindSkillsEditor } from '../skills-editor.js';
import { studentPage, defaultBase } from './student.js';

// Публичная страница профиля по ссылке: только просмотр, без входа, кнопок и личной заметки ментора.
const msg = (ic, t, sub) => `<div class="empty">${icon(ic, 'ol')}<h2 class="d-s" style="justify-content:center">${t}</h2><p>${sub}</p></div>`;
const bad = (e) => e.status === 429 ? msg('hourglass_empty', 'Слишком много запросов', 'Подождите минуту и обновите страницу') : e.status === 404 ? msg('link_off', 'Ссылка недействительна', 'Возможно, доступ был отключён. Попросите ментора прислать новую ссылку.') : msg('cloud_off', 'Не удалось загрузить', 'Проверьте соединение и обновите страницу');

export function shareView({ token }) {
  return {
    shell: 'bare',
    html: `<div class="share view"><header class="share-top">${logo(26)}<span class="chip">${icon('visibility')} Только просмотр</span></header>
      <main class="page" id="sh-main" style="padding-top:28px"><div class="empty">Загрузка…</div></main><p class="legal-links" style="text-align:center;margin:40px 0 24px"><a href="/terms" target="_blank" rel="noopener">Условия</a> · <a href="/privacy" target="_blank" rel="noopener">Политика конфиденциальности</a></p></div>`,
    async mount(root) {
      const main = root.querySelector('#sh-main');
      try {
        const s = await api('GET', `/share/${encodeURIComponent(token)}`);
        main.innerHTML = studentPage(s, defaultBase(s), token);
      } catch (e) {
        main.innerHTML = bad(e);
      }
    },
  };
}

// Самооценка менти: те же навыки, что у ментора. Результат уходит в карточку и показывается рядом с оценкой ментора.
export function shareAssessView({ token }) {
  const scores = {};
  return {
    shell: 'bare',
    html: `<div class="share view"><header class="share-top">${logo(26)}<span class="chip">${icon('edit_note')} Самооценка</span></header>
      <main class="page" id="sa-main" style="padding-top:28px;padding-bottom:120px"><div class="empty">Загрузка…</div></main></div>`,
    async mount(root) {
      const main = root.querySelector('#sa-main');
      let s; try { s = await api('GET', `/share/${encodeURIComponent(token)}`); } catch (e) { main.innerHTML = bad(e); return; }
      if (s.shareOpts?.competencies === false) { main.innerHTML = msg('block', 'Оценка недоступна', 'Ментор отключил оценку компетенций по этой ссылке'); return; }
      Object.assign(scores, selfLatest(s)?.scores || {});
      main.innerHTML = `<a class="back" href="/s/${esc(token)}">${icon('arrow_back')} К профилю</a>
        <div class="eyebrow" style="margin-top:20px">Самооценка</div><h1 class="d-m">Оцените свои компетенции</h1>
        <p class="lede" style="margin:8px 0 28px">${esc(s.firstName)}, отметьте, как вы сами оцениваете каждый навык: от «начального» до «эксперта». Нажмите на выбранное значение ещё раз, чтобы сбросить. Ментор увидит ваши ответы рядом со своей оценкой.</p>
        <div class="skills-wrap"><div class="skills-col" id="sa-skills">${skillsEditorHtml(scores)}
          </div>
          <aside class="skills-side"><div class="card"><div id="sa-radar"></div><div id="sa-tiles"></div></div></aside></div>`;
      root.insertAdjacentHTML('beforeend', /* вне .view: анимация появления создаёт свой контекст для fixed */ `<div class="stage-foot flat"><div class="in"><a class="pill ghost" href="/s/${esc(token)}">Отмена</a><button class="pill dark lg" id="sa-send">Отправить оценку</button></div></div>`);
      const draw = () => { main.querySelector('#sa-radar').innerHTML = radar([{ scores, kind: 'now' }]) + radarLegend(false, '', 'Ваша оценка'); main.querySelector('#sa-tiles').innerHTML = scoreOrb(scores); };
      draw(); bindSkillsEditor(main.querySelector('#sa-skills'), scores, draw);
      root.querySelector('#sa-send').addEventListener('click', async (e) => {
        const rated = SKILLS.filter((k) => scores[k.id] > 0).length;
        if (!rated) { toast('Оцените хотя бы один навык'); return; }
        const btn = e.currentTarget;
        if (rated < SKILLS.length && !(await confirmDialog({ title: 'Отправить оценку?', text: `Оценено ${rated} из ${SKILLS.length} навыков. Остальные останутся без оценки.`, ok: 'Отправить', danger: false }))) return;
        btn.disabled = true;
        try { await store.submitSelf(token, scores); toast('Спасибо! Оценка отправлена ментору'); window.__go(`/s/${token}`); }
        catch (err) { btn.disabled = false; toast(err.status === 429 ? 'Слишком много попыток, подождите минуту' : 'Не удалось отправить, попробуйте ещё раз'); }
      });
    },
  };
}
