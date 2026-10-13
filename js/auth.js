import { AUTH } from './config.js';

// Заглушка: проверка логина/пароля на клиенте. Интерфейс уже рассчитан на асинхронный вызов,
// так что подмена на запрос к серверу не потребует переписывать экран входа.
const KEY = 'menty:session';
export const isAuthed = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export async function login(email, password) {
  const ok = email.trim().toLowerCase() === AUTH.email && password === AUTH.password;
  if (ok) try { localStorage.setItem(KEY, '1'); } catch { /* приватный режим */ }
  return ok;
}
export const logout = () => { try { localStorage.removeItem(KEY); } catch { /* */ } };
export const currentUser = () => ({ email: AUTH.email, name: 'Админ' });
