export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = (n, cls = '') => `<span class="i ${cls}">${n}</span>`;
export const ACT = {}; // обработчики для [data-act]

export const fmtDate = (iso) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtMoney = (n, cur) => n ? `${Number(n).toLocaleString('ru-RU')} ${cur}` : '—';
export const fmtSize = (b) => b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`;
export const today = () => new Date().toISOString().slice(0, 10);
export const fullName = (s) => `${s.firstName} ${s.lastName}`.trim();

// Принимает только http(s)-ссылки, чтобы нельзя было подсунуть javascript:
export function safeUrl(u) {
  try { const x = new URL(/^https?:\/\//i.test(u.trim()) ? u.trim() : 'https://' + u.trim()); return /^https?:$/.test(x.protocol) && x.hostname.includes('.') ? x.href : null; } catch { return null; }
}
export const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export const logoMark = (size = 28) => `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="10" fill="currentColor"/><path d="M8 23v-4M14 23v-8M20 23V11" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><circle cx="25.5" cy="8" r="2.4" fill="#fff"/></svg>`;
export const logo = (size) => `<span class="logo">${logoMark(size)}<span class="logo-t">Menty</span></span>`;

export const avatar = (s, size = '') => `<span class="av ${size}" aria-hidden="true">${esc((s.firstName[0] || '') + (s.lastName[0] || ''))}</span>`;

export function toast(msg) {
  const box = $('#toasts'); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; box.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2600);
}

export function openModal(html, mount) {
  const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  bg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey); document.body.appendChild(bg);
  mount?.(bg.firstElementChild, close); bg.querySelector('input,textarea,select')?.focus();
  return close;
}

export const downloadBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
