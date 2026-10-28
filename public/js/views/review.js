import { api } from '../api.js';
import { icon, logo, esc, avatar, toast } from '../ui.js';

const msg = (ic, t, sub) => `<div class="empty">${icon(ic, 'ol')}<h2 class="d-s" style="justify-content:center">${t}</h2><p>${sub}</p></div>`;

// Публичная страница отзыва: менти ставит оценку звёздами и пишет комментарий, ответ появляется в карточке у ментора.
export function reviewView({ token }) {
  return {
    shell: 'bare',
    html: `<div class="share view"><header class="share-top">${logo(26)}<span class="chip">${icon('star')} Отзыв</span></header>
      <main class="page" id="rv-main" style="padding-top:28px"><div class="empty">Загрузка…</div></main></div>`,
    async mount(root) {
      const main = root.querySelector('#rv-main');
      let d;
      try { d = await api('GET', `/review/${encodeURIComponent(token)}`); }
      catch (e) { main.innerHTML = e.status === 429 ? msg('hourglass_empty', 'Слишком много запросов', 'Подождите минуту и обновите страницу') : e.status === 404 ? msg('link_off', 'Ссылка недействительна', 'Попросите ментора прислать новую ссылку') : msg('cloud_off', 'Не удалось загрузить', 'Проверьте соединение и обновите страницу'); return; }
      let rating = d.review?.rating || 0, comment = d.review?.comment || '', sent = !!d.review;
      const showForm = () => {
        main.innerHTML = `<div class="rv-form"><div class="row" style="gap:14px;margin-bottom:18px">${avatar(d, 'lg')}<div><div class="eyebrow">Отзыв о менторстве</div><h1 class="d-m">Как всё прошло?</h1></div></div>
          <p class="lede" style="margin:0 0 24px">${esc(d.firstName)}, поздравляем с новой работой! Поставьте оценку и расскажите, что было полезно и что можно улучшить.${sent ? ' Вы уже оставляли отзыв, его можно изменить.' : ''}</p>
          <div class="card"><label class="lbl">Оценка</label><div class="star-pick" id="rv-stars" role="radiogroup" aria-label="Оценка">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" role="radio" aria-label="${n} из 5">${icon('star')}</button>`).join('')}</div>
            <label class="lbl" style="margin-top:18px">Комментарий</label><textarea class="field" id="rv-text" maxlength="2000" rows="6" placeholder="Что дало менторство, что понравилось, что стоит улучшить">${esc(comment)}</textarea>
            <div class="row" style="justify-content:flex-end;margin-top:20px"><button type="button" class="pill dark lg" id="rv-send">${sent ? 'Сохранить отзыв' : 'Отправить отзыв'}</button></div></div></div>`;
        const paint = () => main.querySelectorAll('#rv-stars button').forEach((b) => { b.classList.toggle('on', +b.dataset.n <= rating); b.setAttribute('aria-checked', String(+b.dataset.n === rating)); });
        paint();
        main.querySelector('#rv-stars').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { rating = +b.dataset.n; paint(); } });
        main.querySelector('#rv-send').addEventListener('click', async (e) => {
          if (!rating) { toast('Поставьте оценку звёздами'); return; }
          const btn = e.currentTarget; comment = main.querySelector('#rv-text').value; btn.disabled = true;
          try { await api('POST', `/review/${encodeURIComponent(token)}`, { rating, comment }); sent = true; showThanks(); }
          catch (err) { btn.disabled = false; toast(err.status === 429 ? 'Слишком много попыток, подождите минуту' : 'Не удалось отправить, попробуйте ещё раз'); }
        });
      };
      const showThanks = () => {
        main.innerHTML = `<div class="ty"><span class="ty-heart" id="ty-heart" aria-hidden="true">${icon('favorite')}</span>
          <h1 class="d-m">Спасибо за отзыв!</h1><p class="lede">Он уже у вашего ментора</p>
          <button type="button" class="pill dark lg" id="ty-edit">Изменить отзыв</button></div>`;
        main.querySelector('#ty-edit').addEventListener('click', showForm);
        fireworks(main.querySelector('#ty-heart'));
      };
      showForm();
    },
  };
}

// Небольшой фейерверк над сердцем: три залпа цветами групп навыков. Отключается при «уменьшении движения».
function fireworks(anchor) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas'), dpr = window.devicePixelRatio || 1;
  cv.className = 'fx'; cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; document.body.appendChild(cv);
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const colors = ['#111113', '#3558f5', '#f2813b', '#b94de0', '#13803a'], parts = [];
  const r = anchor.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const burst = (x, y, n) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5.5; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: 0.012 + Math.random() * 0.01, size: 2 + Math.random() * 2.5, c: colors[(Math.random() * colors.length) | 0] }); } };
  const shots = [[0, cx, cy], [350, cx - 130, cy - 70], [650, cx + 130, cy - 50]];
  const t0 = performance.now(), fired = new Set();
  const tick = (now) => {
    shots.forEach(([t, x, y], i) => { if (!fired.has(i) && now - t0 >= t) { fired.add(i); burst(x, y, 46); } });
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.07; p.life -= p.decay;
      if (p.life > 0) { ctx.globalAlpha = Math.max(p.life, 0); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * Math.max(p.life, 0.3), 0, 6.283); ctx.fill(); }
    }
    if (fired.size < shots.length || parts.some((p) => p.life > 0)) requestAnimationFrame(tick); else cv.remove();
  };
  requestAnimationFrame(tick);
}
