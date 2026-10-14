-- Базовая схема Menty. Совпадает с тем, что уже лежит в рабочей базе, поэтому все команды с IF NOT EXISTS:
-- на существующей базе миграция ничего не меняет и просто фиксируется как применённая, на новой создаёт всё с нуля.
-- Следующие изменения структуры — новыми файлами 0002_..., 0003_... (не правьте уже применённые).

CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);

-- Пользователи (менторы) и способы их входа
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, avatar TEXT, role TEXT NOT NULL DEFAULT 'mentor', created_at TEXT NOT NULL, last_login TEXT);
CREATE TABLE IF NOT EXISTS identities (provider TEXT NOT NULL, provider_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (provider, provider_id));
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, created_by TEXT NOT NULL, created_at TEXT NOT NULL, used_by TEXT, used_at TEXT);

-- Данные менторов: у каждой строки есть владелец (owner_id)
CREATE TABLE IF NOT EXISTS students (owner_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (owner_id, id));
CREATE TABLE IF NOT EXISTS workspaces (owner_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (owner_id, id));
CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, owner_id TEXT NOT NULL, student_id TEXT NOT NULL, opts TEXT, created_at TEXT NOT NULL, UNIQUE (owner_id, student_id));
CREATE TABLE IF NOT EXISTS review_links (token TEXT PRIMARY KEY, owner_id TEXT NOT NULL, student_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (owner_id, student_id));

-- Файлы: описание в D1, содержимое в R2 (r2 = 1) или, у старых файлов, кусками в file_chunks (r2 = 0)
CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, owner_id TEXT, type TEXT NOT NULL, size INTEGER NOT NULL, r2 INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS file_chunks (id TEXT NOT NULL, n INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (id, n));
