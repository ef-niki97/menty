import { SKILLS, GROUPS, LEVELS } from './config.js';
import { esc, icon } from './ui.js';
import { groupAvg, fmt1 } from './metrics.js';

// Редактор оценок: 3 группы, у каждого навыка 5 точек. Повторный клик по выбранному значению сбрасывает оценку.
// prev — оценки прошлой переоценки: рядом с навыком показываем «было».
export function skillsEditorHtml(scores, prev) {
  return GROUPS.map((g) => `<section class="grp" data-g="${g.id}">
    <div class="grp-h"><span style="color:${g.color}">${icon(g.icon)}</span><h3>${g.label}</h3><span class="grp-avg" data-avg="${g.id}">${fmt1(groupAvg(scores, g.id))}</span></div>
    ${SKILLS.filter((s) => s.g === g.id).map((s) => row(s, scores?.[s.id] || 0, prev?.[s.id])).join('')}
  </section>`).join('');
}
const row = (s, v, p) => `<div class="sk" data-skill="${s.id}">
  <div class="sk-t"><b>${esc(s.label)}</b><small>${esc(s.hint)}</small></div>
  <div class="dots" role="group" aria-label="${esc(s.label)}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="dot ${n <= v ? 'on' : ''} ${p === n ? 'was' : ''}" data-v="${n}" aria-label="${n}: ${LEVELS[n]}" title="${LEVELS[n]}"></button>`).join('')}</div>
  <span class="sk-l" data-lvl>${LEVELS[v]}${p ? `<em>было: ${LEVELS[p]}</em>` : ''}</span></div>`;

export function bindSkillsEditor(root, scores, onChange) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.dot'); if (!b || !root.contains(b)) return;
    const rowEl = b.closest('.sk'); const id = rowEl.dataset.skill; const n = +b.dataset.v;
    const v = scores[id] === n ? 0 : n; scores[id] = v;
    rowEl.querySelectorAll('.dot').forEach((d) => d.classList.toggle('on', +d.dataset.v <= v));
    const lvl = rowEl.querySelector('[data-lvl]'); const em = lvl.querySelector('em'); lvl.firstChild.textContent = LEVELS[v]; if (em) lvl.appendChild(em);
    GROUPS.forEach((g) => { const el = root.querySelector(`[data-avg="${g.id}"]`); if (el) el.textContent = fmt1(groupAvg(scores, g.id)); });
    onChange?.();
  });
}
