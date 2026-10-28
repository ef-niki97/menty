import { icon } from './ui.js';

// Native selects retain form values and events; only their visible controls are replaced.
const controls = new WeakMap();
let sequence = 0, open = null, search = '', searchAt = 0;
const items = (select) => [...select.options].filter((option) => !option.disabled && !option.hidden);

function sync(select) {
  const button = controls.get(select);
  if (!button) return;
  const label = button.querySelector('[data-dropdown-label]'), selected = select.selectedOptions[0];
  const text = selected?.value === '' ? (select.dataset.emptyLabel || selected.textContent) : selected?.textContent || '';
  if (label.textContent !== text) label.textContent = text;
  if (button.disabled !== select.disabled) button.disabled = select.disabled;
}

function close({ focus = false } = {}) {
  if (!open) return;
  const { button, panel } = open;
  open = null; search = '';
  panel.remove(); button.setAttribute('aria-expanded', 'false');
  button.removeAttribute('aria-activedescendant');
  if (focus && button.isConnected) button.focus({ preventScroll: true });
}

function highlight(index) {
  if (!open || !open.options.length) return;
  open.index = (index + open.options.length) % open.options.length;
  [...open.panel.children].forEach((row, i) => row.classList.toggle('highlighted', i === open.index));
  const row = open.panel.children[open.index];
  open.button.setAttribute('aria-activedescendant', row.id);
  row.scrollIntoView({ block: 'nearest' });
}

function choose(option) {
  if (!open) return;
  const select = open.select, changed = select.value !== option.value;
  select.value = option.value; sync(select); close({ focus: true });
  if (changed) {
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function position() {
  if (!open) return;
  const { button, select, panel } = open, rect = button.getBoundingClientRect(), gap = 8, margin = 12;
  if (!button.isConnected || rect.bottom <= 0 || rect.top >= innerHeight) { close(); return; }
  const compact = select.dataset.f === 'currency' || select.name === 'currency';
  const minWidth = select.id === 'cmp-sel' ? 280 : compact ? 120 : 220;
  const width = Math.min(Math.max(rect.width, minWidth), innerWidth - margin * 2);
  panel.style.width = `${width}px`;
  const below = innerHeight - rect.bottom - gap - margin, above = rect.top - gap - margin;
  const up = below < Math.min(panel.scrollHeight, 200) && above > below;
  panel.style.maxHeight = `${Math.max(48, Math.min(320, up ? above : below))}px`;
  panel.style.left = `${Math.max(margin, Math.min(rect.left, innerWidth - width - margin))}px`;
  panel.style.top = up ? 'auto' : `${rect.bottom + gap}px`;
  panel.style.bottom = up ? `${innerHeight - rect.top + gap}px` : 'auto';
}

function show(select) {
  if (select.disabled) return;
  close();
  document.querySelectorAll('.dp-pop:not(.hide)').forEach((panel) => panel.classList.add('hide'));
  const button = controls.get(select), options = items(select);
  if (!options.length) return;
  const panel = document.createElement('div');
  panel.className = 'dropdown-pop'; panel.id = button.getAttribute('aria-controls');
  if (select.id === 'cmp-sel') panel.classList.add('dropdown-pop-comparison');
  panel.setAttribute('role', 'listbox'); panel.setAttribute('aria-label', button.getAttribute('aria-label'));
  options.forEach((option, i) => {
    const row = document.createElement('div');
    row.className = 'dropdown-option'; row.id = `${panel.id}-${i}`;
    row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(option.selected));
    const label = document.createElement('span'); label.textContent = option.textContent;
    const check = document.createElement('span'); check.className = 'dropdown-check';
    if (option.selected) check.innerHTML = icon('check');
    row.append(label, check);
    row.addEventListener('pointermove', () => highlight(i));
    row.addEventListener('click', () => choose(option));
    panel.appendChild(row);
  });
  // Portal avoids clipping inside scrollable edit dialogs and animated page containers.
  document.body.appendChild(panel);
  open = { select, button, panel, options, index: Math.max(0, options.findIndex((o) => o.selected)) };
  search = ''; button.setAttribute('aria-expanded', 'true'); position(); if (open) highlight(open.index);
}

function enhance(select) {
  if (controls.has(select)) return;
  const button = document.createElement('button'), wrapper = select.parentElement;
  if (!select.id) select.id = `dropdown-${++sequence}`;
  button.type = 'button'; button.className = `${select.className} dropdown-btn`;
  button.setAttribute('role', 'combobox'); button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', `${select.id}-options`);
  const label = select.labels?.[0] || (wrapper.previousElementSibling?.tagName === 'LABEL' ? wrapper.previousElementSibling : null);
  button.setAttribute('aria-label', select.getAttribute('aria-label') || label?.textContent?.trim() || select.selectedOptions[0]?.textContent || 'Выберите значение');
  button.innerHTML = `<span data-dropdown-label></span>${icon('expand_more', 'dropdown-chevron')}`;
  wrapper.classList.add('dropdown'); select.hidden = true;
  select.after(button); controls.set(select, button); sync(select);
  button.addEventListener('click', () => open?.select === select ? close() : show(select));
  select.addEventListener('change', () => sync(select));
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { close(); return; }
    if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); close({ focus: true }); } return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      if (open?.select !== select) { show(select); if (e.key === 'Home') highlight(0); if (e.key === 'End') highlight(open?.options.length - 1); return; }
      if (e.key === 'Enter' || e.key === ' ') choose(open.options[open.index]);
      else highlight(e.key === 'Home' ? 0 : e.key === 'End' ? open.options.length - 1 : open.index + (e.key === 'ArrowUp' ? -1 : 1));
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); if (open?.select !== select) show(select);
      if (!open) return;
      search = Date.now() - searchAt > 700 ? e.key : search + e.key; searchAt = Date.now();
      const index = open.options.findIndex((o) => o.textContent.trim().toLocaleLowerCase().startsWith(search.toLocaleLowerCase()));
      if (index >= 0) highlight(index);
    }
  });
}

const scan = () => {
  if (open && (!open.select.isConnected || open.select.disabled)) close();
  document.querySelectorAll('select.field').forEach((select) => { enhance(select); sync(select); });
};
new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
document.addEventListener('pointerdown', (e) => { if (open && !open.panel.contains(e.target) && !open.button.contains(e.target)) close(); });
document.addEventListener('scroll', (e) => { if (open && !open.panel.contains(e.target)) requestAnimationFrame(position); }, true);
window.addEventListener('resize', () => close());
scan();
