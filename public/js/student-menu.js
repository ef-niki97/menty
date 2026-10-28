import * as store from './store.js';
import { ACT, esc, icon, fullName, confirmDialog, toast } from './ui.js';

let dismiss = () => {};
export const closeStudentMenu = () => dismiss();

ACT['student-menu'] = (trigger) => {
  const wasOpen = trigger.getAttribute('aria-expanded') === 'true';
  dismiss();
  if (wasOpen) return;
  const id = trigger.closest('[data-sid]').dataset.sid, student = store.getStudent(id);
  if (!student) return;
  const panel = document.createElement('div'), events = new AbortController();
  panel.className = 'student-menu'; panel.dataset.sid = id;
  panel.setAttribute('role', 'menu'); panel.setAttribute('aria-label', `Действия: ${fullName(student)}`);
  panel.innerHTML = `<button class="um-i" role="menuitem" tabindex="-1" data-menu-edit>${icon('edit', 'ol')} Редактировать</button>
    <a class="um-i" role="menuitem" tabindex="-1" href="/student/${esc(id)}/assess">${icon('edit_note', 'ol')} Обновить компетенции</a>
    <div class="um-sep" role="separator"></div><button class="um-i danger" role="menuitem" tabindex="-1" data-menu-delete>${icon('delete', 'ol')} Удалить</button>`;
  document.body.appendChild(panel); trigger.setAttribute('aria-expanded', 'true');
  const rect = trigger.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
  panel.style.left = `${Math.max(12, Math.min(rect.right - bounds.width, innerWidth - bounds.width - 12))}px`;
  panel.style.top = `${Math.max(12, Math.min(rect.bottom + 8, innerHeight - bounds.height - 12))}px`;
  const observer = new MutationObserver(() => { if (!trigger.isConnected) dismiss(); });
  dismiss = (focus = false) => {
    events.abort(); observer.disconnect(); panel.remove(); trigger.setAttribute('aria-expanded', 'false');
    if (focus && trigger.isConnected) trigger.focus({ preventScroll: true });
    dismiss = () => {};
  };
  observer.observe(document.getElementById('app'), { childList: true, subtree: true });
  const items = [...panel.querySelectorAll('[role=menuitem]')]; items[0].focus({ preventScroll: true });
  document.addEventListener('pointerdown', (e) => { if (!panel.contains(e.target) && !trigger.contains(e.target)) dismiss(); }, { signal: events.signal });
  document.addEventListener('scroll', (e) => { if (!panel.contains(e.target)) dismiss(); }, { capture: true, signal: events.signal });
  window.addEventListener('resize', () => dismiss(), { signal: events.signal });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); dismiss(true); }
    else if (e.key === 'Tab') dismiss(true);
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); const index = items.indexOf(document.activeElement);
      items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  });
  panel.addEventListener('click', async (e) => {
    const item = e.target.closest('[role=menuitem]'); if (!item) return;
    dismiss();
    if (item.hasAttribute('data-menu-edit')) ACT['st-edit'](item);
    if (item.hasAttribute('data-menu-delete')) {
      if (!(await confirmDialog({ title: `Удалить ученика ${fullName(student)}?`, text: 'История оценок, заметки и файлы будут удалены. Это нельзя отменить.' }))) return;
      try { await store.removeStudent(id); toast('Ученик удалён'); window.__rerender(); }
      catch { toast('Не удалось удалить ученика'); }
    }
  });
};
