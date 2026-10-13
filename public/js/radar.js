import { SKILLS, GROUPS, LEVELS } from './config.js';
import { esc } from './ui.js';
import { groupAvg, fmt1 } from './metrics.js';

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

  const labels = SKILLS.map((s, i) => {
    const [x, y] = pt(i, max, R + 18); const dx = x - cx;
    const anchor = dx > 8 ? 'start' : dx < -8 ? 'end' : 'middle';
    const g = GROUPS.find((q) => q.id === s.g);
    const tx = anchor === 'start' ? x + 9 : anchor === 'end' ? x - 9 : x;
    return `<g><circle cx="${x}" cy="${y}" r="3.5" fill="${g.color}"/><text x="${tx}" y="${y + (anchor === 'middle' ? (y < cy ? -9 : 17) : 4.5)}" text-anchor="${anchor}" font-size="13.5" font-weight="600" fill="rgba(17,17,19,.78)" letter-spacing="-.01em">${esc(s.short)}</text></g>`;
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

// Три плитки со средним по группам (+ дельта, если есть с чем сравнить)
export function groupTiles(scores, prevScores) {
  return `<div class="gtiles">${GROUPS.map((g) => {
    const v = groupAvg(scores, g.id); const d = prevScores ? v - groupAvg(prevScores, g.id) : null;
    const dh = d === null || Math.abs(d) < 0.05 ? '' : `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '↑' : '↓'} ${fmt1(Math.abs(d))}</span>`;
    return `<div class="gtile"><div class="gt-h"><span class="i" style="color:${g.color}">${g.icon}</span>${g.label}</div><div class="gt-v">${fmt1(v)}<small>/5</small>${dh}</div><div class="bar"><i style="width:${(v / 5) * 100}%;background:${g.color}"></i></div></div>`;
  }).join('')}</div>`;
}
