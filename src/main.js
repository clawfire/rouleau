/**
 * Rouleau — app shell.
 * Picks a module, renders its controls, rebuilds the ticket on every change,
 * and sends the result to the T02 (Bluetooth, ⌘P or PNG).
 */
import '@awesome.me/webawesome-pro/dist/styles/webawesome.css';
import '@awesome.me/webawesome-pro/dist/styles/themes/brutalist.css';
import '@awesome.me/webawesome-pro/dist/components/page/page.js';
import '@awesome.me/webawesome-pro/dist/components/button/button.js';
import '@awesome.me/webawesome-pro/dist/components/icon/icon.js';
import '@awesome.me/webawesome-pro/dist/components/tag/tag.js';
import '@awesome.me/webawesome-pro/dist/components/badge/badge.js';
import '@awesome.me/webawesome-pro/dist/components/card/card.js';
import '@awesome.me/webawesome-pro/dist/components/callout/callout.js';
import '@awesome.me/webawesome-pro/dist/components/spinner/spinner.js';
import '@awesome.me/webawesome-pro/dist/components/input/input.js';
import '@awesome.me/webawesome-pro/dist/components/textarea/textarea.js';
import '@awesome.me/webawesome-pro/dist/components/slider/slider.js';
import '@awesome.me/webawesome-pro/dist/components/switch/switch.js';
import '@awesome.me/webawesome-pro/dist/components/checkbox/checkbox.js';
import '@awesome.me/webawesome-pro/dist/components/checkbox-group/checkbox-group.js';
import '@awesome.me/webawesome-pro/dist/components/radio-group/radio-group.js';
import '@awesome.me/webawesome-pro/dist/components/radio/radio.js';
import '@awesome.me/webawesome-pro/dist/components/select/select.js';
import '@awesome.me/webawesome-pro/dist/components/option/option.js';
import './fonts.js';
import './styles.css';

import { MAX_PAGE_MM, dotsToMm, estimatePrintSeconds, mmToDots } from './engine/constants.js';
import { paginate } from './engine/paginate.js';
import { renderTicket } from './engine/render.js';
import { MODULES, moduleById } from './modules/index.js';
import { T02Bluetooth, isBluetoothAvailable } from './print/bluetooth.js';
import { downloadPNG, systemPrint } from './print/system.js';
import { renderControls } from './ui/controls.js';

/* ---------- Small helpers ---------- */

const $ = (sel) => document.querySelector(sel);

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`rouleau:${key}`);
      return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
    } catch {
      return { ...fallback };
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`rouleau:${key}`, JSON.stringify(value));
    } catch {
      // Private mode or storage disabled: settings just won't persist.
    }
  },
};

const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

/* ---------- Colour scheme follows the OS ---------- */

const scheme = window.matchMedia('(prefers-color-scheme: dark)');
const applyScheme = () => {
  document.documentElement.classList.toggle('wa-dark', scheme.matches);
  document.documentElement.classList.toggle('wa-light', !scheme.matches);
};
scheme.addEventListener('change', applyScheme);
applyScheme();

/* ---------- State ---------- */

const state = {
  module: null,
  values: {},
  print: store.get('print', { density: '2', feedMm: 0 }),
  bitmap: null,
  renderId: 0,
};

const printer = new T02Bluetooth();

/* ---------- Navigation ---------- */

function renderNav() {
  const nav = $('#module-nav');
  nav.replaceChildren(
    ...MODULES.map((m) => {
      const item = document.createElement(m.soon ? 'span' : 'a');
      item.className = 'nav-item';
      const icon = document.createElement('wa-icon');
      icon.setAttribute('name', m.icon);
      item.append(icon, m.label);
      if (m.soon) {
        item.setAttribute('aria-disabled', 'true');
        const badge = document.createElement('wa-badge');
        badge.setAttribute('variant', 'neutral');
        badge.setAttribute('appearance', 'outlined');
        badge.textContent = 'bientôt';
        item.append(badge);
      } else {
        item.href = `#${m.id}`;
        item.dataset.drawer = 'close';
        if (state.module?.id === m.id) item.setAttribute('aria-current', 'page');
      }
      return item;
    }),
  );
}

function selectModule(id) {
  const mod = moduleById(id);
  state.module = mod;
  state.values = store.get(`module:${mod.id}`, mod.defaults);
  $('#module-title').textContent = mod.label;
  $('#module-description').textContent = mod.description ?? '';
  $('#current-module-mobile').textContent = mod.label;
  document.title = `${mod.label} · Rouleau`;
  renderControls($('#module-controls'), mod.controls ?? [], state.values, (values) => {
    store.set(`module:${mod.id}`, values);
    scheduleRender();
  });
  renderNav();
  scheduleRender();
}

/* ---------- Rendering ---------- */

async function render() {
  const id = ++state.renderId;
  const spinner = $('#rendering');
  spinner.hidden = false;
  try {
    const blocks = await state.module.build(state.values);
    const bitmap = await renderTicket(blocks);
    if (id !== state.renderId) return; // a newer render started meanwhile
    state.bitmap = bitmap;
    bitmap.toCanvas($('#ticket'));
    updateMeta(bitmap);
  } catch (err) {
    console.error(err);
    setStatus(`Rendu impossible : ${err.message}`, 'danger');
  } finally {
    if (id === state.renderId) spinner.hidden = true;
  }
}

const scheduleRender = debounce(render, 120);

function updateMeta(bitmap) {
  const mm = dotsToMm(bitmap.height);
  const tags = [
    `${bitmap.height} px`,
    mm >= 100 ? `${(mm / 10).toFixed(1)} cm` : `${Math.round(mm)} mm`,
    `~${Math.max(1, Math.round(estimatePrintSeconds(bitmap.height)))} s`,
  ];
  const pages = mm > MAX_PAGE_MM ? paginate(bitmap, mmToDots(MAX_PAGE_MM)).length : 1;
  if (pages > 1) tags.push(`⌘P : ${pages} pages`);
  $('#ticket-meta').replaceChildren(
    ...tags.map((t) => {
      const tag = document.createElement('wa-tag');
      tag.setAttribute('size', 's');
      tag.setAttribute('appearance', 'outlined');
      tag.setAttribute('variant', 'neutral');
      tag.textContent = t;
      return tag;
    }),
  );
}

/* ---------- Print settings ---------- */

const PRINT_CONTROLS = [
  {
    type: 'radio',
    key: 'density',
    label: 'Densité',
    hint: 'Plus foncé = plus de chauffe, plus lent.',
    options: [
      { value: '1', label: 'Léger' },
      { value: '2', label: 'Normal' },
      { value: '3', label: 'Foncé' },
      { value: '4', label: 'Max' },
    ],
  },
  {
    type: 'slider',
    key: 'feedMm',
    label: 'Avance après impression (mm)',
    hint: 'Pour pouvoir déchirer sans couper le bas du ticket.',
    min: 0,
    max: 30,
    step: 5,
  },
];

function setStatus(message, variant = 'neutral') {
  const callout = $('#ble-callout');
  callout.setAttribute('variant', variant);
  const icon = callout.querySelector('wa-icon');
  icon.setAttribute(
    'name',
    { success: 'circle-check', danger: 'triangle-exclamation', warning: 'triangle-exclamation' }[variant] ?? 'circle-info',
  );
  $('#ble-status').textContent = message;
}

/* ---------- Actions ---------- */

const fileName = () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `rouleau-${state.module.id}-${stamp}.png`;
};

$('#btn-png').addEventListener('click', () => state.bitmap && downloadPNG(state.bitmap, fileName()));

$('#btn-system').addEventListener('click', () => state.bitmap && systemPrint(state.bitmap));

$('#btn-ble').addEventListener('click', async (e) => {
  if (!state.bitmap) return;
  const btn = e.currentTarget;
  btn.loading = true;
  try {
    if (!printer.connected) setStatus('Recherche de la T02…');
    await printer.print(state.bitmap, {
      density: Number(state.print.density),
      extraFeed: mmToDots(Number(state.print.feedMm) || 0),
      onProgress: (r) => setStatus(`Envoi… ${Math.round(r * 100)} %`),
    });
    const battery = printer.battery != null ? ` · batterie ${printer.battery} %` : '';
    setStatus(`Imprimé${battery}`, 'success');
  } catch (err) {
    if (err?.name === 'NotFoundError') setStatus('Aucune T02 sélectionnée.', 'neutral');
    else setStatus(err.message ?? String(err), 'danger');
  } finally {
    btn.loading = false;
  }
});

printer.addEventListener('disconnected', () => setStatus('T02 déconnectée.', 'neutral'));

/* ---------- Zoom ---------- */

const zoom = $('#zoom');
zoom.value = store.get('ui', { zoom: 'fit' }).zoom;
$('#paper').dataset.zoom = zoom.value;
zoom.addEventListener('change', () => {
  $('#paper').dataset.zoom = zoom.value;
  store.set('ui', { zoom: zoom.value });
});

/* ---------- Boot ---------- */

renderControls($('#print-controls'), PRINT_CONTROLS, state.print, (values) => store.set('print', values));

if (!isBluetoothAvailable()) {
  $('#btn-ble').disabled = true;
  setStatus("Ce navigateur n'a pas Web Bluetooth (Chrome ou Edge requis). ⌘P et PNG restent dispo.", 'warning');
}

window.addEventListener('hashchange', () => selectModule(location.hash.slice(1)));
selectModule(location.hash.slice(1));
