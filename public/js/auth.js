import { api } from './api.js';

// Вход проверяет сервер (POST /api/login), сессия хранится в HttpOnly-куке.
let user = null;
export async function initAuth() { try { user = await api('GET', '/me'); } catch { user = null; } }
export const isAuthed = () => !!user;
export async function login(email, password) {
  try { user = await api('POST', '/login', { email, password }); return true; } catch { user = null; return false; }
}
export async function logout() { try { await api('POST', '/logout', {}); } catch { /* всё равно выходим */ } user = null; }
export const forgetUser = () => { user = null; };
export const currentUser = () => ({ email: user?.email || '', name: 'Админ' });
