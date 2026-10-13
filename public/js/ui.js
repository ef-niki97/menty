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

export const logoMark = (size = 28) => `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 2048 2003" aria-hidden="true"><rect width="2048" height="2003" rx="440" fill="currentColor"/><path fill="#fff" d="M 590.054 405.426 C 681.563 398.432 786.812 419.388 860.139 476.7 C 891.998 501.21 918.678 531.796 938.634 566.688 C 980.129 638.86 999.271 754.794 1016.9 837.355 L 1084.65 1150.97 C 1086.97 1161.56 1101.65 1234.71 1106.09 1239.01 C 1108.22 1241.08 1108.86 1240.9 1111.61 1240.72 C 1117.1 1232.97 1135.75 1137.4 1139.41 1120.57 C 1155.36 1049.3 1170.78 977.919 1185.68 906.426 L 1289.72 423.801 C 1312.85 424.554 1338.46 424.031 1361.73 424.032 L 1489.18 424.026 L 1866.81 424.1 C 1867.52 469.741 1866.93 517.088 1866.94 562.839 L 1866.95 822.64 L 1866.88 1574.78 L 1539.01 1574.96 L 1538.96 727.861 L 1514.67 727.507 C 1509.72 743.169 1505.25 759.898 1500.76 775.767 L 1289.22 1574.86 C 1244.82 1575.68 1198.32 1575.02 1153.69 1575.02 L 897.989 1575.11 C 891.521 1552.75 885.232 1525.97 879.312 1503.12 C 865.814 1451.3 852.575 1399.41 839.596 1347.46 L 751.606 997.745 C 740.162 951.659 729.274 905.124 717.559 859.12 C 705.177 810.499 696.846 723.172 631.109 720.966 C 611.724 720.181 592.852 727.308 578.826 740.711 C 536.552 780.443 541.005 873.286 540.954 927.884 L 540.934 1050.11 L 540.928 1389.38 C 540.929 1449.69 542.193 1515.02 540.505 1574.96 L 212.85 1575.07 L 212.835 1090.68 L 212.838 939.941 C 212.848 853.514 212.346 790.169 230.848 704.554 C 270.453 521.294 405.334 417.5 590.054 405.426 z"/></svg>`;
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
