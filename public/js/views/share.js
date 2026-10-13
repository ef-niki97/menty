import { api } from '../api.js';
import { icon, logo } from '../ui.js';
import { studentPage, defaultBase } from './student.js';

// Публичная страница профиля по ссылке: только просмотр, без входа, кнопок и личной заметки ментора.
export function shareView({ token }) {
  const msg = (ic, t, sub) => `<div class="empty">${icon(ic, 'ol')}<h2 class="d-s" style="justify-content:center">${t}</h2><p>${sub}</p></div>`;
  return {
    shell: 'bare',
    html: `<div class="share view"><header class="share-top">${logo(26)}<span class="chip">${icon('visibility')} Только просмотр</span></header>
      <main class="page" id="sh-main" style="padding-top:28px"><div class="empty">Загрузка…</div></main></div>`,
    async mount(root) {
      const main = root.querySelector('#sh-main');
      try {
        const s = await api('GET', `/share/${encodeURIComponent(token)}`);
        main.innerHTML = studentPage(s, defaultBase(s), true);
      } catch (e) {
        main.innerHTML = e.status === 404 ? msg('link_off', 'Ссылка недействительна', 'Возможно, доступ был отключён. Попросите ментора прислать новую ссылку.') : msg('cloud_off', 'Не удалось загрузить', 'Проверьте соединение и обновите страницу.');
      }
    },
  };
}
