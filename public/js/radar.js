import { SKILLS, GROUPS, LEVELS } from './config.js';
import { esc } from './ui.js';
import { groupAvg, total, fmt1 } from './metrics.js';

// Радар по всем компетенциям. series: [{ scores, kind: 'prev' | 'now', label }]
// Секторы подкрашены по группам навыков. «Было» — пунктир, «Стало» — заливка.
export function radar(series, { max = 5 } = {}) {
  const W = 640, H = 540, cx = W / 2, cy = H / 2 + 4, R = 160, N = SKILLS.length, step = (Math.PI * 2) / N;
  const pt = (i, v, r = R) => { const a = i * step, k = (r * v) / max; return [cx + k * Math.sin(a), cy - k * Math.cos(a)]; };
  const f = (p) => p.map((n) => n.toFixed(1)).join(',');
  const poly = (scores) => SKILLS.map((s, i) => f(pt(i, scores?.[s.id] || 0))).join(' ');

  const wedges = GROUPS.map((g) => {
    const idx = SKILLS.map((s, i) => (s.g === g.id ? i : -1)).filter((i) => i >= 0);
    const a0 = (idx[0] - 0.5) * step, a1 = (idx[idx.length - 1] + 0.5) * step;
    const p = (a) => [cx + R * Math.sin(a), cy - R * Math.cos(a)];
    return `<path d="M${cx},${cy} L${f(p(a0))} A${R},${R} 0 0 1 ${f(p(a1))} Z" fill="${g.tint}"/>`;
  }).join('');

  const rings = Array.from({ length: max }, (_, k) => k + 1).map((v) =>
    `<polygon points="${SKILLS.map((_, i) => f(pt(i, v))).join(' ')}" fill="none" stroke="rgba(17,17,19,${v === max ? .16 : .08})" stroke-width="1"/>`).join('');
  const ringNums = Array.from({ length: max }, (_, k) => k + 1).map((v) => `<text x="${cx + 5}" y="${cy - (R * v) / max + 3}" font-size="9.5" fill="rgba(17,17,19,.36)">${v}</text>`).join('');
  const axes = SKILLS.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, max)[0].toFixed(1)}" y2="${pt(i, max)[1].toFixed(1)}" stroke="rgba(17,17,19,.07)"/>`).join('');

  // Подписи по бокам могут слипаться, когда навыков много: разводим соседей по вертикали минимум на 15.
  const pos = SKILLS.map((_, i) => pt(i, max, R + 18));
  for (const side of [(d) => d < -8, (d) => d > 8]) {
    const grp = pos.filter((p) => side(p[0] - cx)).sort((a, b) => a[1] - b[1]);
    for (let k = 1; k < grp.length; k++) if (grp[k][1] - grp[k - 1][1] < 15) grp[k][1] = grp[k - 1][1] + 15;
  }
  const labels = SKILLS.map((s, i) => {
    const [x, y] = pos[i]; const dx = x - cx;
    const anchor = dx > 8 ? 'start' : dx < -8 ? 'end' : 'middle';
    const g = GROUPS.find((q) => q.id === s.g);
    const tx = anchor === 'start' ? x + 9 : anchor === 'end' ? x - 9 : x;
    return `<g><circle cx="${x}" cy="${y}" r="3.5" fill="${g.color}"/><text x="${tx}" y="${y + (anchor === 'middle' ? (y < cy ? -9 : 17) : 4.5)}" text-anchor="${anchor}" font-size="${N > 20 ? 12 : 13.5}" font-weight="600" fill="rgba(17,17,19,.78)" letter-spacing="-.01em">${esc(s.short)}</text></g>`;
  }).join('');

  const order = [...series].sort((a) => (a.kind === 'prev' ? -1 : 1));
  const layers = order.map((s) => {
    const isNow = s.kind !== 'prev';
    const dots = isNow ? SKILLS.map((k, i) => { const v = s.scores?.[k.id] || 0; const [x, y] = pt(i, v); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#fff" stroke="var(--ink)" stroke-width="2.2"><title>${esc(k.label)}: ${LEVELS[v]} (${v}/${max})</title></circle>`; }).join('') : '';
    return isNow
      ? `<polygon class="r-now" points="${poly(s.scores)}" fill="rgba(17,17,19,.13)" stroke="var(--ink)" stroke-width="2.6" stroke-linejoin="round"/>${dots}`
      : `<polygon points="${poly(s.scores)}" fill="rgba(17,17,19,.03)" stroke="rgba(17,17,19,.45)" stroke-width="2.2" stroke-dasharray="7 6" stroke-linejoin="round"/>`;
  }).join('');

  return `<svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="Диаграмма компетенций">${wedges}${rings}${axes}${ringNums}${layers}${labels}</svg>`;
}

// Легенда: «было / стало» + группы
export function radarLegend(hasPrev, prevLabel = 'Было', nowLabel = 'Стало') {
  const sw = (cls) => `<i class="lg-sw ${cls}"></i>`;
  const series = hasPrev ? `<span class="lg">${sw('prev')}${esc(prevLabel)}</span><span class="lg">${sw('now')}${esc(nowLabel)}</span>` : `<span class="lg">${sw('now')}${esc(nowLabel)}</span>`;
  const groups = GROUPS.map((g) => `<span class="lg"><i class="lg-dot" style="background:${g.color}"></i>${g.label}</span>`).join('');
  return `<div class="legend">${series}<span class="lg-sep"></span>${groups}</div>`;
}

// Итоговая оценка: цветная «сфера» (цвет и яркость зависят от результатов групп) в кольце из трёх дуг.
// Дуга — значение группы из 5, засечка на дуге — «было». Справа — общий уровень и разбивка по группам.
let orbN = 0;
export function scoreOrb(scores, prevScores, { animate = false } = {}) {
  const n = ++orbN, cx = 200, cy = 160, R = 128, RO = 96, GAP = 8, OFF = -60, SPAN = 120 - GAP;
  const pol = (r, deg) => { const a = (deg * Math.PI) / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
  const f = (p) => p.map((v) => v.toFixed(1)).join(',');
  const arc = (a0, a1) => `M${f(pol(R, a0))} A${R},${R} 0 0 1 ${f(pol(R, a1))}`;
  const rows = GROUPS.map((g, i) => {
    const v = groupAvg(scores, g.id), pv = prevScores ? groupAvg(prevScores, g.id) : null;
    const a0 = OFF + i * 120 + GAP / 2, a1 = a0 + SPAN, mid = (a0 + a1) / 2;
    return { g, v, pv, a0, a1, mid, frac: v / 5 };
  });

  const blobs = rows.map((r) => { const [x, y] = pol(46, r.mid); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="82" fill="${r.g.color}" opacity="${(r.v ? 0.4 + 0.6 * r.frac : 0.08).toFixed(2)}"/>`; }).join('');
  const rings = rows.map((r) => {
    const track = `<path d="${arc(r.a0, r.a1)}" fill="none" stroke="rgba(17,17,19,.07)" stroke-width="7" stroke-linecap="round"/>`;
    const fill = r.v ? `<path class="${animate ? 'orb-arc' : ''}" d="${arc(r.a0, r.a1)}" pathLength="100" fill="none" stroke="${r.g.color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(r.frac * 100).toFixed(2)} 100"/>` : '';
    let tick = '';
    if (r.pv) { const d = r.a0 + (r.pv / 5) * SPAN, [x1, y1] = pol(R - 8, d), [x2, y2] = pol(R + 8, d); tick = `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(17,17,19,.55)" stroke-width="2.4" stroke-linecap="round"/>`; }
    const [lx, ly] = pol(R + 26, r.mid), sn = Math.sin((r.mid * Math.PI) / 180), cs = Math.cos((r.mid * Math.PI) / 180);
    const anchor = Math.abs(sn) < 0.3 ? 'middle' : sn > 0 ? 'start' : 'end', dy = cs > 0.5 ? -14 : cs < -0.5 ? 8 : -2;
    const lab = `<text x="${lx.toFixed(1)}" y="${(ly + dy).toFixed(1)}" text-anchor="${anchor}" font-size="17" font-weight="700" fill="rgba(17,17,19,.9)" letter-spacing="-.02em">${fmt1(r.v)}</text><text x="${lx.toFixed(1)}" y="${(ly + dy + 14).toFixed(1)}" text-anchor="${anchor}" font-size="11.5" font-weight="600" fill="rgba(17,17,19,.5)">${esc(r.g.label.replace('-скиллы', ''))}</text>`;
    return track + fill + tick + lab;
  }).join('');

  const svg = `<svg class="orb-svg" viewBox="-40 -26 480 330" role="img" aria-label="Итоговая оценка по группам навыков">
    <defs>
      <clipPath id="oc${n}"><circle cx="${cx}" cy="${cy}" r="${RO}"/></clipPath>
      <filter id="ob${n}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="19"/></filter>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${RO}" fill="#fff"/>
    <g clip-path="url(#oc${n})"><g filter="url(#ob${n})">${blobs}</g></g>
    ${rings}</svg>`;

  const tot = total(scores), dt = prevScores ? tot - total(prevScores) : null;
  const delta = (d) => d === null || Math.abs(d) < 0.05 ? '' : `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '↑' : '↓'} ${fmt1(Math.abs(d))}</span>`;
  return `<div class="orb-wrap">${svg}<div class="orb-sum"><div class="small">Общий уровень</div><div class="orb-tot">${fmt1(tot)}<small>/5</small>${delta(dt)}</div>
    <div class="orb-rows">${rows.map((r) => `<div class="orb-row"><i style="background:${r.g.color}"></i><span>${esc(r.g.label)}</span><b>${fmt1(r.v)}</b>${r.pv === null ? '' : delta(r.v - r.pv)}</div>`).join('')}</div></div></div>`;
}
