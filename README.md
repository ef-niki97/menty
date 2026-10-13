# Menty — панель ментора

Сайт для ведения учеников: профиль, цели, оценка компетенций с радар-диаграммой, история портфолио и CV.
Фронтенд — чистый HTML/CSS/JS без сборки (`public/`), бэкенд — Cloudflare Worker (`src/worker.js`)
с базой D1 и хранилищем файлов R2.

## Как выложить на Cloudflare (один раз)

Нужен аккаунт Cloudflare. Бот и другие проекты не затрагиваются: это отдельный Worker.

1. **База D1.** Cloudflare → *Storage & Databases → D1 SQL database → Create*, имя `menty`.
   Скопируйте *Database ID* и вставьте в `wrangler.toml` вместо `ВСТАВЬТЕ_ID_БАЗЫ`. Таблицы создаются сами.
2. **Хранилище R2.** *R2 Object Storage → Create bucket*, имя `menty-files` (для включения R2 Cloudflare может попросить карту, на бесплатный лимит это не влияет).
3. **Подключить репозиторий.** *Workers & Pages → Create → Import a repository* (GitHub, репозиторий `menty`).
   Команды сборки: *Build command* — пусто, *Deploy command* — `npx wrangler deploy`.
4. **Секреты.** Worker `menty` → *Settings → Variables and Secrets → Add*, тип **Secret**:
   - `ADMIN_PASSWORD` — ваш пароль для входа;
   - `SESSION_SECRET` — любая длинная случайная строка (32+ символов).
   Почта для входа — `ADMIN_EMAIL` в `wrangler.toml`.
5. Нажмите *Deploy* (или сделайте `git push`). Адрес вида `menty.<ваш-аккаунт>.workers.dev`.

Дальше каждый `git push` в `main` обновляет сайт сам.

## Локальная разработка

Нужен Node.js.

```bash
npm install
printf 'ADMIN_PASSWORD=любой-пароль\nSESSION_SECRET=длинная-случайная-строка\n' > .dev.vars
npx wrangler dev        # http://localhost:8787
```

Локально D1 и R2 эмулируются, данные лежат в `.wrangler/`.

## Экраны

| Путь | Что там |
|---|---|
| `#/login` | Вход |
| `#/students` | Список учеников: статистика, поиск, фильтры по грейду и статусу |
| `#/students/new` | Добавление: профиль → цели → компетенции (+ личная заметка) → итог с диаграммой → «Создать» |
| `#/student/:id` | Карточка: радар «было/стало», история оценок, цель, портфолио и CV с историей версий, задачи, встречи, личная заметка |
| `#/student/:id/assess` | Новая оценка — значения подставляются из прошлой, прежняя показывается пунктиром |

## Структура

```
wrangler.toml       конфиг Worker: статика, D1, R2, почта для входа
src/worker.js       API: /api/login, /api/students, /api/files, /api/import
public/index.html
public/css/         tokens.css (брендовый цвет — чёрный, --ink), app.css
public/js/config.js грейды, статусы, список компетенций  ← правится здесь
public/js/api.js    запросы к /api
public/js/store.js  данные: кэш в памяти + запись на сервер
public/js/auth.js   вход
public/js/metrics.js, radar.js, skills-editor.js, ui.js
public/js/views/    экраны
public/js/demo.js   демо-ученики (кнопка на пустом экране)
```

## Данные и безопасность

- Менти хранятся в D1 как JSON-документы, файлы CV — в R2. Доступны с любого устройства после входа.
- Вход проверяет сервер. Сессия — подписанная HttpOnly-кука на 30 дней, пароль и ключ только в секретах Cloudflare.
- Резервная копия: меню профиля → «Скачать резервную копию» (JSON; файлы CV в неё **не входят**).
  «Восстановить из копии» добавляет или обновляет учеников из файла.
- Личные заметки (`privateNote`) лежат в карточке ученика. Когда появится доступ для учеников,
  их нужно отделить от данных, которые ученик видит сам.
