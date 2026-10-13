import { SKILLS } from './config.js';

// Среднее считаем только по оценённым навыкам (0 = «ещё не оценено»).
const avg = (xs) => { const r = xs.filter((x) => x > 0); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0; };
export const groupAvg = (scores, g) => avg(SKILLS.filter((s) => s.g === g).map((s) => scores?.[s.id] || 0));
export const total = (scores) => avg(SKILLS.map((s) => scores?.[s.id] || 0));
export const latest = (st) => st.assessments[st.assessments.length - 1];
export const firstA = (st) => st.assessments[0];
export const growth = (st) => st.assessments.length > 1 ? total(latest(st).scores) - total(firstA(st).scores) : null;
export const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt1(Math.abs(n))}`;
