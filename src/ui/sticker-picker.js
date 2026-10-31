/** Dialog with a grid of sticker icons. `pickSticker()` resolves with an icon name, or null if dismissed. */
import { STICKERS } from '../engine/icons.js';

let dialog;
let done = null;

function build() {
  dialog = document.createElement('wa-dialog');
  dialog.setAttribute('label', 'Choisir un sticker');
  const grid = document.createElement('div');
  grid.className = 'sticker-grid';
  for (const name of STICKERS) {
    const btn = document.createElement('wa-button');
    btn.setAttribute('appearance', 'plain');
    btn.setAttribute('aria-label', name);
    btn.dataset.icon = name;
    const icon = document.createElement('wa-icon');
    icon.setAttribute('name', name);
    icon.style.fontSize = 'var(--wa-font-size-2xl)';
    btn.append(icon);
    grid.append(btn);
  }
  dialog.append(grid);
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('wa-button');
    if (!btn) return;
    finish(btn.dataset.icon);
    dialog.open = false;
  });
  dialog.addEventListener('wa-after-hide', (e) => {
    if (e.target === dialog) finish(null);
  });
  document.body.append(dialog);
}

function finish(value) {
  const resolve = done;
  done = null;
  resolve?.(value);
}

export function pickSticker() {
  if (!dialog) build();
  finish(null);
  return new Promise((resolve) => {
    done = resolve;
    dialog.open = true;
  });
}
