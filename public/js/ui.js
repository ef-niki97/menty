import { ICONS } from './icons.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = (n, cls = '') => {
  const paths = ICONS[n] || ICONS.error;
  return `<span class="i ${esc(cls)}" data-icon="${esc(n)}" aria-hidden="true"><svg viewBox="0 -960 960 960" focusable="false">${paths[cls.split(/\s+/).includes('ol') ? 'outline' : 'filled']}</svg></span>`;
};
export const ACT = {}; // обработчики для [data-act]

export const fmtDate = (iso) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T00:00:00' : iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtMoney = (n, cur) => n ? `${Number(n).toLocaleString('ru-RU')} ${cur}` : 'Не указано';
export const fmtSize = (b) => b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`;
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const workLine = (s) => [s.role, s.jobless ? 'В поисках работы' : s.company].filter(Boolean).join(' · ') || 'Место работы не указано';
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
// «Чигвинцев» → «chigvintsev»: для читаемых адресов вида /student/chigvintsev
export const slugify = (t) => String(t || '').toLowerCase().replace(/[а-яё]/g, (c) => TR[c] ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
export const fullName = (s) => `${s.firstName} ${s.lastName}`.trim();

// Принимает только http(s)-ссылки, чтобы нельзя было подсунуть javascript:
export function safeUrl(u) {
  try { const x = new URL(/^https?:\/\//i.test(u.trim()) ? u.trim() : 'https://' + u.trim()); return /^https?:$/.test(x.protocol) && x.hostname.includes('.') ? x.href : null; } catch { return null; }
}
export const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export function linkedInUrl(value) {
  const url = safeUrl(value || '');
  if (!url) return null;
  const u = new URL(url);
  return !u.username && !u.password && (u.hostname === 'linkedin.com' || u.hostname.endsWith('.linkedin.com')) ? url : null;
}
export function linkedInLink(value) {
  const url = linkedInUrl(value);
  return url ? `<a class="linkedin-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Профиль в LinkedIn" title="Профиль в LinkedIn"><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M20.45 2H3.55C2.69 2 2 2.68 2 3.52v16.96c0 .84.69 1.52 1.55 1.52h16.9c.86 0 1.55-.68 1.55-1.52V3.52c0-.84-.69-1.52-1.55-1.52zM7.93 18.75H4.98V9.2h2.95v9.55zM6.45 7.9a1.71 1.71 0 1 1 0-3.42 1.71 1.71 0 0 1 0 3.42zm12.3 10.85H15.8V14.1c0-1.11-.02-2.54-1.55-2.54-1.55 0-1.79 1.21-1.79 2.46v4.73H9.51V9.2h2.83v1.31h.04c.39-.74 1.36-1.53 2.79-1.53 2.98 0 3.58 1.96 3.58 4.51v5.26z"/></svg></a>` : '';
}

export const logoMark = (size = 28) => `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 2048 2003" aria-hidden="true"><rect width="2048" height="2003" rx="440" fill="currentColor"/><path fill="#fff" d="M 587.01 411.549 C 614.526 410.347 642.094 411.544 669.403 415.128 C 729.559 422.891 781.384 439.927 831.899 474.115 C 953.304 556.281 970.149 699.874 998.689 833.088 L 1063.38 1132.36 C 1067.14 1149.88 1085.04 1239.57 1091.32 1247.7 C 1096.52 1249.21 1099.4 1239.09 1100.3 1235.12 C 1108.12 1200.76 1114.94 1166.17 1122.44 1131.73 C 1138.76 1058.22 1154.69 984.623 1170.24 910.945 C 1205.62 750.976 1240.05 590.796 1273.53 430.415 C 1291.08 431.522 1318.44 430.729 1336.53 430.73 L 1454.43 430.741 L 1851.23 430.909 L 1851.19 1581.53 L 1523.01 1581.29 L 1523 734.182 L 1498.72 733.94 C 1495.01 750.435 1487.11 775.604 1482.44 792.23 L 1349.01 1297.03 C 1323.36 1391.7 1298.22 1486.51 1273.59 1581.45 L 881.688 1581.77 C 871.116 1533.29 854.588 1476.35 842.088 1427.58 L 768.942 1138.21 L 708.724 896.287 C 700.577 863.708 694.159 830.95 684.938 798.537 C 676.242 764.473 654.153 727.277 614.034 727.674 C 514.594 728.66 525.088 877.039 525.023 943.325 L 525.077 1089.4 L 524.897 1581.32 C 475.531 1582.04 424.957 1581.49 375.475 1581.51 L 196.761 1581.57 L 196.829 1095.58 L 196.832 945.344 C 196.845 859.66 196.712 796.942 214.672 712.137 C 254.55 523.848 397.136 418.466 587.01 411.549 z"/></svg>`;
export const logo = (size) => `<span class="logo">${logoMark(size)}<span class="logo-t">Menty</span></span>`;

const isImg = (u) => typeof u === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u);
export const avatar = (s, size = '') => `<span class="av ${size}" aria-hidden="true">${isImg(s.avatar) ? `<img src="${s.avatar}" alt="">` : esc((s.firstName[0] || '') + (s.lastName[0] || ''))}</span>`;

// Фото → квадрат 256×256 (по центру) → маленький JPEG в виде data-URL. Хранится прямо в карточке ученика.
export async function fileToAvatar(file, size = 256) {
  if (!file || !file.type.startsWith('image/')) throw new Error('not an image');
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bmp.width, bmp.height), c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size); bmp.close?.();
  return c.toDataURL('image/jpeg', 0.86);
}

export function toast(msg) {
  const box = $('#toasts'); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; box.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2600);
}

// Своё окно подтверждения вместо системного confirm(): возвращает Promise<boolean>. Escape и клик по фону — «отмена».
export function confirmDialog({ title, text = '', ok = 'Удалить', cancel = 'Отмена', danger = true }) {
  return new Promise((resolve) => {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal confirm" role="alertdialog" aria-modal="true" aria-labelledby="cf-t"><h2 class="d-s" id="cf-t">${esc(title)}</h2>${text ? `<p class="small" style="margin:8px 0 0">${esc(text)}</p>` : ''}
      <div class="row" style="justify-content:flex-end;margin-top:26px;gap:10px"><button type="button" class="pill ghost" data-no>${esc(cancel)}</button><button type="button" class="pill ${danger ? 'danger-ghost' : 'dark'}" data-yes>${esc(ok)}</button></div></div>`;
    const done = (v) => { document.removeEventListener('keydown', onKey, true); bg.remove(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) done(false); });
    bg.addEventListener('click', (e) => { if (e.target.closest('[data-yes]')) done(true); else if (e.target.closest('[data-no]')) done(false); });
    document.addEventListener('keydown', onKey, true); document.body.appendChild(bg);
    bg.querySelector(danger ? '[data-no]' : '[data-yes]').focus(); // для удаления фокус на «Отмена», чтобы случайный Enter ничего не стёр
  });
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
