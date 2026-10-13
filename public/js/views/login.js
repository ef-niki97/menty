import { login } from '../auth.js';
import { initStore } from '../store.js';
import { logo, icon } from '../ui.js';
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
        <form class="card login-card" id="login-form" novalidate>
          <h2 class="d-s">Вход</h2>
          <p class="small" style="margin:6px 0 24px">Панель ментора</p>
          <label class="lbl" for="l-email">Почта</label>
          <input class="field" id="l-email" name="email" type="email" autocomplete="username" placeholder="you@example.com" required>
          <label class="lbl" for="l-pass" style="margin-top:16px">Пароль</label>
          <input class="field" id="l-pass" name="password" type="password" autocomplete="current-password" placeholder="••••" required>
          <div class="form-err hide" id="l-err" role="alert">${icon('error')} Неверная почта или пароль</div>
          <button class="pill dark lg" type="submit" style="margin-top:24px">Войти</button>
        </form>
      </div>
    </div>`,
    mount(root) {
      const form = root.querySelector('#login-form'), err = root.querySelector('#l-err');
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); const f = new FormData(form);
        const ok = await login(f.get('email') || '', f.get('password') || '');
        if (ok) { try { await initStore(); } catch { /* список подгрузится позже */ } location.hash = '#/students'; } else { err.classList.remove('hide'); form.querySelector('#l-pass').select(); }
      });
      root.querySelector('#l-email').focus();
    },
  };
}
