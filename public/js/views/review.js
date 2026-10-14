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
      catch (e) { main.innerHTML = e.status === 404 ? msg('link_off', 'Ссылка недействительна', 'Попросите ментора прислать новую ссылку.') : msg('cloud_off', 'Не удалось загрузить', 'Проверьте соединение и обновите страницу.'); return; }
      let rating = d.review?.rating || 0;
      main.innerHTML = `<div class="rv-form"><div class="row" style="gap:14px;margin-bottom:18px">${avatar(d, 'lg')}<div><div class="eyebrow">Отзыв о менторстве</div><h1 class="d-m">Как всё прошло?</h1></div></div>
        <p class="lede" style="margin:0 0 24px">${esc(d.firstName)}, поздравляем с новой работой! Поставьте оценку и расскажите, что было полезно и что можно улучшить.${d.review ? ' Вы уже оставляли отзыв, его можно изменить.' : ''}</p>
        <div class="card"><label class="lbl">Оценка</label><div class="star-pick" id="rv-stars" role="radiogroup" aria-label="Оценка">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" role="radio" aria-label="${n} из 5">${icon('star')}</button>`).join('')}</div>
          <label class="lbl" style="margin-top:18px">Комментарий</label><textarea class="field" id="rv-text" maxlength="2000" rows="6" placeholder="Что дало менторство, что понравилось, что стоит улучшить">${esc(d.review?.comment || '')}</textarea>
          <div class="row" style="justify-content:flex-end;margin-top:20px"><button type="button" class="pill dark lg" id="rv-send">${d.review ? 'Сохранить отзыв' : 'Отправить отзыв'}</button></div></div></div>`;
      const paint = () => main.querySelectorAll('#rv-stars button').forEach((b) => { const on = +b.dataset.n <= rating; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(+b.dataset.n === rating)); });
      paint();
      main.querySelector('#rv-stars').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { rating = +b.dataset.n; paint(); } });
      main.querySelector('#rv-send').addEventListener('click', async (e) => {
        if (!rating) { toast('Поставьте оценку звёздами'); return; }
        e.currentTarget.disabled = true;
        try {
          await api('POST', `/review/${encodeURIComponent(token)}`, { rating, comment: main.querySelector('#rv-text').value });
          main.innerHTML = msg('favorite', 'Спасибо за отзыв!', 'Он уже у вашего ментора.');
        } catch { e.currentTarget.disabled = false; toast('Не удалось отправить, попробуйте ещё раз'); }
      });
    },
  };
}
