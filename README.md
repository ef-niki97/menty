# Menty — панель ментора

Сайт для ведения учеников: профиль, цели, оценка компетенций с радар-диаграммой, история портфолио и CV.
Фронтенд — чистый HTML/CSS/JS (папка `public/`), бэкенд — один Cloudflare Worker (`src/worker.js`)
с базой D1 (карточки) и хранилищем R2 (файлы CV). Вход по почте и паролю, сессия в HttpOnly-куке.

## Деплой на Cloudflare (через GitHub, без установки Node)

1. **База.** Cloudflare → Storage & Databases → D1 → *Create database*, имя `menty`.
   Скопируйте её **Database ID** и вставьте в `wrangler.toml` вместо `ВСТАВЬТЕ_ID_БАЗЫ`. Таблицы создаются сами при первом запросе.
2. **Файлы.** R2 → *Create bucket*, имя `menty-files` (для включения R2 Cloudflare может попросить карту; бесплатного лимита хватает).
3. **Проект.** Workers & Pages → *Create* → *Import a repository* → выберите `menty`.
   Build command оставьте пустым, Deploy command: `npx wrangler deploy`.
4. **Секреты.** Worker `menty` → Settings → Variables and Secrets → добавьте как **Secret**:
   - `ADMIN_PASSWORD` — ваш пароль для входа;
   - `SESSION_SECRET` — любая длинная случайная строка (32+ символов).
5. Откройте выданный адрес `menty.<ваш-аккаунт>.workers.dev` и войдите: почта `efimtsev.spb@gmail.com` и ваш пароль.

Дальше каждый `git push` в `main` обновляет сайт автоматически.

## Структура

```
wrangler.toml       настройки Worker: статика, D1, R2, почта администратора
src/worker.js       API: /api/login, /api/students, /api/files …
public/index.html
public/css/         tokens.css (брендовый цвет — чёрный, --ink), app.css
public/js/config.js грейды, статусы, список компетенций  ← правится здесь
public/js/api.js    обёртка над fetch
public/js/store.js  данные ↔ сервер (единственное место работы с данными)
public/js/auth.js   вход/выход
public/js/views/*   экраны: login, students, wizard, student
public/js/demo.js   демо-ученики (кнопка на пустом экране)
```

## Экраны

`#/login` · `#/students` (список) · `#/students/new` (добавление) · `#/student/:id` (карточка) · `#/student/:id/assess` (новая оценка)

## Безопасность

- Пароль и ключ сессии лежат только в секретах Cloudflare, в репозитории их нет.
- Все `/api/*` кроме входа требуют сессию; кука `HttpOnly; Secure; SameSite=Strict`, срок 30 дней.
- Неверный пароль отвечает с задержкой. Файлы отдаются как вложения и не исполняются в браузере.
- Резервная копия (меню профиля) содержит карточки, но **не файлы CV**.

## Локальный просмотр интерфейса

Полноценно (с API) локально запускается командой `npx wrangler dev` (нужен Node.js) — понадобятся
`ADMIN_PASSWORD` и `SESSION_SECRET` в файле `.dev.vars`.
