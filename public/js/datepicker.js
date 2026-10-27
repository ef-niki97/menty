import { icon, esc } from './ui.js';

// Свой календарь вместо системного <input type="date">. Значение хранится в скрытом поле (ГГГГ-ММ-ДД),
// поэтому форму можно читать через FormData как обычно. Обработчики общие, регистрируются один раз.
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };
const label = (v) => v ? new Date(v + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Выберите дату';

export const datePicker = (name, value) => `<div class="dp" data-dp data-view="${esc((value || todayIso()).slice(0, 7))}"><input type="hidden" name="${name}" value="${esc(value)}">
  <button type="button" class="field sm dp-btn" data-dp-toggle aria-haspopup="dialog">${icon('calendar_month', 'ol')}<span data-dp-label>${label(value)}</span>${icon('expand_more', 'dp-chevron')}</button><div class="dp-pop hide" role="dialog"></div></div>`;

function render(dp) {
  const [y, m] = dp.dataset.view.split('-').map(Number), mi = m - 1;
  const sel = dp.querySelector('input').value, today = todayIso();
  const lead = (new Date(y, mi, 1).getDay() + 6) % 7, days = new Date(y, mi + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span></span>');
  for (let d = 1; d <= days; d++) { const v = iso(y, mi, d); cells.push(`<button type="button" class="dp-d ${v === sel ? 'sel' : ''} ${v === today ? 'today' : ''}" data-dp-day="${v}">${d}</button>`); }
  dp.querySelector('.dp-pop').innerHTML = `<div class="dp-h"><b>${MONTHS[mi]} ${y}</b><div class="row" style="gap:4px"><button type="button" class="dp-nav" data-dp-nav="-1" aria-label="Предыдущий месяц">${icon('chevron_left')}</button><button type="button" class="dp-nav" data-dp-nav="1" aria-label="Следующий месяц">${icon('chevron_right')}</button></div></div>
    <div class="dp-g">${WD.map((w) => `<span class="dp-w">${w}</span>`).join('')}${cells.join('')}</div>
    <div class="dp-f"><button type="button" class="chip" data-dp-day="${today}">Сегодня</button></div>`;
}
const closeAll = (except) => document.querySelectorAll('.dp-pop:not(.hide)').forEach((p) => { if (p.parentElement !== except) p.classList.add('hide'); });

document.addEventListener('click', (e) => {
  const dp = e.target.closest('[data-dp]');
  if (!dp) { closeAll(); return; }
  closeAll(dp);
  const pop = dp.querySelector('.dp-pop');
  if (e.target.closest('[data-dp-toggle]')) { render(dp); pop.classList.toggle('hide'); return; }
  const nav = e.target.closest('[data-dp-nav]');
  if (nav) { const [y, m] = dp.dataset.view.split('-').map(Number), d = new Date(y, m - 1 + Number(nav.dataset.dpNav), 1); dp.dataset.view = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; render(dp); return; }
  const day = e.target.closest('[data-dp-day]');
  if (day) { dp.querySelector('input').value = day.dataset.dpDay; dp.querySelector('[data-dp-label]').textContent = label(day.dataset.dpDay); dp.dataset.view = day.dataset.dpDay.slice(0, 7); pop.classList.add('hide'); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
