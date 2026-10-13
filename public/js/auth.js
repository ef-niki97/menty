import { api } from './api.js';

// Вход проверяет сервер (POST /api/login), сессия хранится в HttpOnly-куке.
let user = null;
export async function initAuth() { try { user = await api('GET', '/me'); } catch { user = null; } }
export const isAuthed = () => !!user;
// Возвращает 'ok' | 'bad' (неверные данные) | 'error' (сервер недоступен или не настроен)
export async function login(email, password) {
  try { user = await api('POST', '/login', { email, password }); return 'ok'; }
  catch (e) { user = null; return e.status === 401 ? 'bad' : 'error'; }
}
export async function logout() { try { await api('POST', '/logout', {}); } catch { /* всё равно выходим */ } user = null; }
export const forgetUser = () => { user = null; };
export const currentUser = () => ({ email: user?.email || '', name: 'Админ' });
