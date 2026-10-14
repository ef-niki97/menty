import { login, authProviders } from '../auth.js';
import { initStore } from '../store.js';
import { logo, icon, esc } from '../ui.js';
import { radar } from '../radar.js';

const demo = { visual: 4, typo: 3, ux: 3, proto: 4, ds: 2, product: 3, comm: 4, pitch: 3, feedback: 5, time: 3, team: 4, prompt: 4, ai_research: 3, ai_visual: 4, ai_proto: 2, ai_flow: 2 };
const before = { visual: 2, typo: 2, ux: 1, proto: 3, ds: 1, product: 1, comm: 3, pitch: 2, feedback: 4, time: 2, team: 3, prompt: 2, ai_research: 1, ai_visual: 2, ai_proto: 1, ai_flow: 1 };

export function loginView() {
  return {
    shell: 'bare',
    html: `<div class="login view">
      <div class="login-l">
        <div class="login-logo">${logo(32)}</div>
        <h1 class="d-l">Прогресс менти — <span class="muted">как на ладони</span></h1>
        <p class="lede">Ведите учеников, оценивайте компетенции и смотрите, как меняется диаграмма от встречи к встрече.</p>
        <div class="login-art card" aria-hidden="true">${radar([{ scores: before, kind: 'prev' }, { scores: demo, kind: 'now' }])}</div>
      </div>
      <div class="login-r">
        <div class="card login-card">
          <h2 class="d-s">Вход</h2>
          <p class="small" style="margin:6px 0 24px">Панель ментора</p>
          <div class="col" id="l-prov" style="gap:12px"><div class="small">Загрузка…</div></div>
          <div class="form-err hide" id="l-msg" role="alert">${icon('error')} <span></span></div>
          <details class="more hide" id="l-pw" style="margin-top:22px"><summary>Вход по паролю (администратор) ${icon('expand_more')}</summary>
            <form id="login-form" novalidate style="margin-top:14px">
              <label class="lbl" for="l-email">Почта</label>
              <input class="field" id="l-email" name="email" type="email" autocomplete="username" placeholder="you@example.com" required>
              <label class="lbl" for="l-pass" style="margin-top:16px">Пароль</label>
              <input class="field" id="l-pass" name="password" type="password" autocomplete="current-password" placeholder="••••" required>
              <div class="form-err hide" id="l-err" role="alert">${icon('error')} Неверная почта или пароль</div>
              <button class="pill dark lg" type="submit" style="margin-top:20px">Войти</button>
            </form>
          </details>
        </div>
      </div>
    </div>`,
    async mount(root) {
      const form = root.querySelector('#login-form'), err = root.querySelector('#l-err'), box = root.querySelector('#l-prov'), msg = root.querySelector('#l-msg');
      const q = new URLSearchParams(location.search), E = {
        invite_required: 'Регистрация только по приглашению. Введите код приглашения и войдите снова.', invite_invalid: 'Код приглашения недействителен или уже использован.',
        signup_closed: 'Новая регистрация сейчас закрыта.', auth_failed: 'Не удалось войти. Попробуйте ещё раз.', no_email: 'Провайдер не передал подтверждённую почту.', provider_disabled: 'Этот способ входа пока не подключён.',
      };
      if (E[q.get('error')]) { msg.lastElementChild.textContent = E[q.get('error')]; msg.classList.remove('hide'); }
      const G = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
      const Y = '<svg width="20" height="20" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="22" fill="#FC3F1D"/><path fill="#fff" d="M24.8 34.5h3.6V9.5h-5.2c-5.3 0-8 2.7-8 6.7 0 3.2 1.5 5.1 4.2 7l-4.8 11.3h3.9l5.3-12.4-1.8-1.2c-2.2-1.5-3.2-2.7-3.2-5 0-2.2 1.5-3.6 4.1-3.6h1.9v22.2z"/></svg>';
      try {
        const pv = await authProviders(), invite = q.get('invite') || '';
        const btn = (k, label, svg) => `<a class="pill ghost lg prov" href="/api/auth/${k}/start" data-prov>${svg} ${label}</a>`;
        box.innerHTML = `${pv.google ? btn('google', 'Войти через Google', G) : ''}${pv.yandex ? btn('yandex', 'Войти через Яндекс', Y) : ''}
          ${(pv.google || pv.yandex) && pv.signup === 'invite' ? `<div><label class="lbl" for="l-invite" style="margin-top:6px">Код приглашения (для нового аккаунта)</label><input class="field lg" id="l-invite" placeholder="Если вы здесь впервые" autocomplete="off" value="${esc(invite)}"></div>` : ''}
          ${pv.google || pv.yandex ? '' : '<div class="small">Вход пока не подключён.</div>'}`;
        if (pv.password) { const d = root.querySelector('#l-pw'); d.classList.remove('hide'); if (!pv.google && !pv.yandex) d.open = true; }
        const sync = () => { const code = (root.querySelector('#l-invite')?.value || '').trim(); root.querySelectorAll('[data-prov]').forEach((a) => { a.href = a.getAttribute('href').split('?')[0] + (code ? `?invite=${encodeURIComponent(code)}` : ''); }); };
        root.querySelector('#l-invite')?.addEventListener('input', sync); sync();
      } catch { box.innerHTML = '<div class="small">Не удалось загрузить способы входа. Обновите страницу.</div>'; }
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); const f = new FormData(form);
        const res = await login(f.get('email') || '', f.get('password') || '');
        if (res === 'ok') { try { await initStore(); } catch { /* список подгрузится позже */ } window.__go('/students'); } else { err.lastChild.textContent = res === 'bad' ? ' Неверная почта или пароль' : ' Ошибка сервера: проверьте, что заданы ADMIN_EMAIL и секрет ADMIN_PASSWORD'; err.classList.remove('hide'); }
      });
    },
  };
}
