import { SKILLS } from './config.js';

// Среднее считаем только по оценённым навыкам (0 = «ещё не оценено»).
// Оценка навыка в пятибалльной шкале: 7 из 10 → 3,5; навыки AI уже из 5.
export const nv = (s, v) => (v ? (v * 5) / s.max : 0);
const avg = (xs) => { const r = xs.filter((x) => x > 0); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0; };
export const groupAvg = (scores, g) => avg(SKILLS.filter((s) => s.g === g).map((s) => nv(s, scores?.[s.id] || 0)));
export const total = (scores) => avg(SKILLS.map((s) => nv(s, scores?.[s.id] || 0)));
export const latest = (st) => st.assessments[st.assessments.length - 1];
export const selfLatest = (st) => st.selfAssessments?.[st.selfAssessments.length - 1] || null;
// Среднее двух оценок по каждому навыку; если навык оценил только один — берём его оценку.
export const blend = (a, b) => Object.fromEntries(SKILLS.map((s) => { const x = a?.[s.id] || 0, y = b?.[s.id] || 0; return [s.id, x && y ? (x + y) / 2 : x || y]; }));
export const firstA = (st) => st.assessments[0];
export const growth = (st) => st.assessments.length > 1 ? total(latest(st).scores) - total(firstA(st).scores) : null;
export const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt1(Math.abs(n))}`;
