import { uidNew } from './store.js';

const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const A = (n, scores, comment) => ({ id: uidNew(), date: day(n), scores, comment });

// Демо-ученики, чтобы было что смотреть. Загружаются кнопкой на пустом экране.
export function demoStudents() {
  const mk = (o) => ({ id: uidNew(), createdAt: day(o.age), updatedAt: day(o.upd), status: 'active', result: 'progress', cvs: [], sessions: [], tasks: [], privateNote: '', ...o });
  return [
    mk({ firstName: 'Анна', lastName: 'Соколова', grade: 'Junior+', company: 'Студия Pixel', role: 'Junior-дизайнер', age: 120, upd: 3,
      goal: { position: 'Middle Product Designer', company: 'Продуктовая компания / финтех', salary: 180000, currency: '₽', horizon: '9' },
      portfolios: [{ id: uidNew(), url: 'https://behance.net/anna-sokolova', title: 'Behance, первая версия', note: '4 кейса, в основном учебные', addedAt: day(120) }, { id: uidNew(), url: 'https://anna-design.framer.website', title: 'Сайт-портфолио', note: 'Переделала с нуля, добавила 2 реальных кейса', addedAt: day(14) }],
      sessions: [{ id: uidNew(), date: day(3).slice(0, 10), text: 'Разобрали кейс про онбординг. Нужно добавить метрики и вывод по результатам.' }],
      tasks: [{ id: uidNew(), text: 'Дописать кейс по онбордингу с метриками', done: false, createdAt: day(3) }, { id: uidNew(), text: 'Собрать 3 референса дизайн-систем', done: true, createdAt: day(10) }],
      privateNote: 'Сильная визуально, но боится защищать решения. Работать над презентацией.',
      assessments: [
        A(120, { visual: 3, typo: 2, ux: 2, proto: 3, ds: 1, product: 1, comm: 3, pitch: 2, feedback: 4, time: 3, team: 3, prompt: 2, ai_research: 1, ai_visual: 2, ai_proto: 1, ai_flow: 1 }, 'Первичная оценка'),
        A(60, { visual: 4, typo: 3, ux: 3, proto: 4, ds: 2, product: 2, comm: 3, pitch: 2, feedback: 4, time: 3, team: 4, prompt: 3, ai_research: 2, ai_visual: 3, ai_proto: 1, ai_flow: 1 }, 'После двух месяцев, прогресс в UX и прототипах'),
        A(3, { visual: 4, typo: 3, ux: 4, proto: 4, ds: 3, product: 3, comm: 4, pitch: 3, feedback: 5, time: 4, team: 4, prompt: 4, ai_research: 3, ai_visual: 4, ai_proto: 2, ai_flow: 2 }, 'Заметный рост в коммуникации и AI'),
      ] }),
    mk({ firstName: 'Максим', lastName: 'Орлов', grade: 'Junior', company: 'Фриланс', role: 'Веб-дизайнер', age: 45, upd: 12,
      goal: { position: 'Junior UX/UI Designer', company: 'IT-компания', salary: 100000, currency: '₽', horizon: '6' },
      portfolios: [{ id: uidNew(), url: 'https://dribbble.com/maxorlov', title: 'Dribbble', note: '', addedAt: day(45) }],
      tasks: [{ id: uidNew(), text: 'Пройти курс по юзабилити-тестам', done: false, createdAt: day(12) }],
      privateNote: 'Мотивирован, но распыляется. Ограничить количество задач.',
      assessments: [
        A(45, { visual: 3, typo: 2, ux: 1, proto: 2, ds: 1, product: 1, comm: 2, pitch: 2, feedback: 3, time: 2, team: 2, prompt: 1, ai_research: 1, ai_visual: 2, ai_proto: 1, ai_flow: 1 }, 'Первичная оценка'),
        A(12, { visual: 3, typo: 3, ux: 2, proto: 3, ds: 1, product: 1, comm: 3, pitch: 2, feedback: 3, time: 2, team: 3, prompt: 2, ai_research: 1, ai_visual: 3, ai_proto: 1, ai_flow: 1 }, ''),
      ] }),
    mk({ firstName: 'Елена', lastName: 'Волкова', grade: 'Middle', company: 'Яндекс', role: 'Дизайнер интерфейсов', age: 200, upd: 1, status: 'done', result: 'hired',
      goal: { position: 'Senior Product Designer', company: 'Международный продукт', salary: 4500, currency: '$', horizon: '12' },
      portfolios: [{ id: uidNew(), url: 'https://elena-volkova.design', title: 'Основное портфолио', note: '', addedAt: day(200) }],
      assessments: [A(200, { visual: 4, typo: 4, ux: 3, proto: 4, ds: 4, product: 3, comm: 4, pitch: 4, feedback: 4, time: 4, team: 4, prompt: 2, ai_research: 2, ai_visual: 2, ai_proto: 1, ai_flow: 1 }, 'Первичная оценка')] }),
  ];
}
