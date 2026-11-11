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
import '@awesome.me/webawesome-pro/dist/components/date-input/date-input.js';
import '@awesome.me/webawesome-pro/dist/components/switch/switch.js';
import '@awesome.me/webawesome-pro/dist/components/checkbox/checkbox.js';
import '@awesome.me/webawesome-pro/dist/components/checkbox-group/checkbox-group.js';
import '@awesome.me/webawesome-pro/dist/components/radio-group/radio-group.js';
import '@awesome.me/webawesome-pro/dist/components/radio/radio.js';
import '@awesome.me/webawesome-pro/dist/components/select/select.js';
import '@awesome.me/webawesome-pro/dist/components/file-input/file-input.js';
import '@awesome.me/webawesome-pro/dist/components/details/details.js';
import '@awesome.me/webawesome-pro/dist/components/dialog/dialog.js';
import '@awesome.me/webawesome-pro/dist/components/option/option.js';
import './fonts.js';
import './styles.css';

import { MAX_PAGE_MM, PAPERS, PRINT_WIDTH, dotsToMm, estimatePrintSeconds, mmToDots } from './engine/constants.js';
import { paginate } from './engine/paginate.js';
import { renderTicket } from './engine/render.js';
import { MODULES, PAGES, buildTicket, moduleById } from './modules/index.js';
import { T02Bluetooth, isBluetoothAvailable } from './print/bluetooth.js';
import { downloadPNG, systemPrint } from './print/system.js';
import { renderAbout } from './ui/about.js';
import { offerCoffee } from './ui/coffee-dialog.js';
import { applyLayers } from './engine/layers.js';
import { renderControls } from './ui/controls.js';
import { createEditor } from './ui/editor.js';
import { select as selectLayer } from './ui/studio.js';
import { store } from './store.js';

/* ---------- Small helpers ---------- */

const $ = (sel) => document.querySelector(sel);

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
  print: store.get('print', { paper: 'ticket', feedMm: 0 }),
  bitmap: null,
  renderId: 0,
};

const printer = new T02Bluetooth();

/* ---------- Navigation ---------- */

function navItem(m) {
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
    if ((state.page ?? state.module?.id) === m.id) item.setAttribute('aria-current', 'page');
  }
  return item;
}

/** Collapsed sections of the menu, for modules flagged with a `group`. */
const NAV_GROUPS = {
  tasks: { label: 'Tickets de tâches', icon: 'list-check' },
  bricks: { label: 'Briques du ticket du matin', icon: 'cubes' },
  dev: { label: 'Développeurs', icon: 'code' },
};
const navOpen = new Set();

function navGroup(id, modules) {
  if (modules.some((m) => m.id === state.module?.id)) navOpen.add(id);
  const group = document.createElement('wa-details');
  group.className = 'nav-group';
  group.setAttribute('appearance', 'plain');
  group.setAttribute('icon-placement', 'end');
  group.toggleAttribute('open', navOpen.has(id));
  const summary = document.createElement('span');
  summary.slot = 'summary';
  summary.className = 'nav-group-title';
  const icon = document.createElement('wa-icon');
  icon.setAttribute('name', NAV_GROUPS[id].icon);
  summary.append(icon, NAV_GROUPS[id].label);
  const list = document.createElement('div');
  list.className = 'wa-stack wa-gap-3xs';
  list.append(...modules.map(navItem));
  group.append(summary, list);
  group.addEventListener('wa-show', () => navOpen.add(id));
  group.addEventListener('wa-hide', () => navOpen.delete(id));
  return group;
}

function renderNav() {
  const nav = $('#module-nav');
  const inGroup = (id) => MODULES.filter((m) => m.group === id);
  const sep = Object.assign(document.createElement('hr'), { className: 'nav-sep' });
  nav.replaceChildren(
    ...MODULES.filter((m) => !m.group).map(navItem),
    navGroup('tasks', inGroup('tasks')),
    navGroup('bricks', inGroup('bricks')),
    sep,
    ...PAGES.map(navItem),
    navGroup('dev', inGroup('dev')),
  );
}

/** Show a page of the menu that is not a module: no controls, no preview, no print buttons. */
function showPage(page) {
  state.page = page.id;
  $('#page-main').hidden = false;
  $('.workspace').hidden = true;
  $('#print-actions').hidden = true;
  renderAbout($('#page-main'));
  $('#current-module-mobile').textContent = page.label;
  document.title = `${page.label} · Rouleau`;
  renderNav();
}

/** Values a module flags `transient` (a photo…) live for the session only: never written to localStorage. */
const sessionStash = {};
function persist(mod, values) {
  const rest = { ...values };
  for (const key of mod.transient ?? []) {
    (sessionStash[mod.id] ??= {})[key] = rest[key];
    delete rest[key];
  }
  store.set(`module:${mod.id}`, rest);
}

function selectModule(id) {
  const page = PAGES.find((p) => p.id === id);
  if (page) return showPage(page);
  state.page = null;
  $('#page-main').hidden = true;
  $('.workspace').hidden = false;
  $('#print-actions').hidden = false;
  const mod = moduleById(id);
  state.module = mod;
  state.values = { ...store.get(`module:${mod.id}`, mod.defaults), ...sessionStash[mod.id] };
  selectLayer(null);
  $('#module-title').textContent = mod.label;
  $('#module-description').textContent = mod.description ?? '';
  $('#current-module-mobile').textContent = mod.label;
  document.title = `${mod.label} · Rouleau`;
  renderNav();
  renderModuleControls();
  scheduleRender();
}

/**
 * Module controls can be a static schema or an async function of the values
 * (e.g. a routine picker that needs an API key first).
 */
async function renderModuleControls() {
  const mod = state.module;
  const container = $('#module-controls');
  if (mod.panel) {
    mod.panel(container, {
      values: state.values,
      onChange: (values) => {
        persist(mod, values);
        scheduleRender();
      },
    });
    return;
  }
  // Modules can add first-level cards before "Réglages": `source` (the photo) and `layersCard` (text, stickers).
  const rerender = () => {
    renderModuleControls();
    scheduleRender();
  };
  for (const [key, id] of [['source', 'source'], ['layersCard', 'layers']]) {
    const def = mod[key];
    $(`#module-${id}-card`).hidden = !def;
    if (!def) continue;
    $(`#module-${id}-title`).textContent = def.title;
    $(`#module-${id}-icon`).setAttribute('name', def.icon ?? 'image');
    renderControls($(`#module-${id}`), def.controls(state.values), state.values, (values) => {
      persist(mod, values);
      scheduleRender();
    }, rerender);
  }
  let schema = mod.controls ?? [];
  if (typeof schema === 'function') {
    container.replaceChildren(Object.assign(document.createElement('wa-spinner'), {}));
    try {
      schema = await schema(state.values);
    } catch (err) {
      schema = [{ type: 'callout', variant: 'danger', text: err.message ?? String(err) }];
    }
    if (state.module !== mod) return; // user switched module meanwhile
  }
  renderControls(
    container,
    schema,
    state.values,
    (values) => {
      persist(mod, values);
      scheduleRender();
    },
    () => {
      renderModuleControls();
      scheduleRender();
    },
  );
}

/* ---------- Rendering ---------- */

async function render() {
  const id = ++state.renderId;
  const spinner = $('#rendering');
  spinner.hidden = false;
  try {
    const blocks = await buildTicket(state.module, state.values);
    const bitmap = await renderTicket(blocks);
    // Free layers (text, stickers) are burnt into the bitmap itself, so print, PNG and ⌘P include them.
    if (state.module.layers) await applyLayers(bitmap, state.module.layers(state.values));
    if (id !== state.renderId) return; // a newer render started meanwhile
    state.bitmap = bitmap;
    showPreview(bitmap, state.module.turn?.(state.values));
    editor.sync();
    updateMeta(bitmap);
  } catch (err) {
    console.error(err);
    setStatus(`Rendu impossible : ${err.message}`, 'danger');
  } finally {
    if (id === state.renderId) spinner.hidden = true;
  }
}

/**
 * Draw the ticket in the preview. A module that prints sideways (badges) can ask for `turn`:
 * the bitmap printed turned 90° clockwise ('cw') or counter-clockwise ('ccw') is shown upright and flat.
 * The bitmap itself, used for printing and the PNG, is never touched.
 */
function showPreview(bitmap, turn) {
  const canvas = $('#ticket');
  const paper = $('#paper');
  bitmap.toCanvas(canvas);
  if (turn === 'cw' || turn === 'ccw') {
    const printed = document.createElement('canvas');
    printed.width = canvas.width;
    printed.height = canvas.height;
    printed.getContext('2d').drawImage(canvas, 0, 0);
    const { width: w, height: h } = printed;
    canvas.width = h;
    canvas.height = w;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // Inverse of the rotation used to print: cw → (x, y) ↦ (y, w - x); ccw → (x, y) ↦ (h - y, x).
    if (turn === 'cw') ctx.setTransform(0, -1, 1, 0, 0, w);
    else ctx.setTransform(0, 1, -1, 0, h, 0);
    ctx.drawImage(printed, 0, 0);
  }
  paper.dataset.flat = turn ? 'true' : 'false';
  paper.style.setProperty('--flat-ratio', String(canvas.width / PRINT_WIDTH));
}

const scheduleRender = debounce(render, 120);

/** Re-render as fast as renders finish (dragging on the preview): never queue more than one behind. */
let live = { busy: false, again: false };
function liveRender() {
  if (live.busy) {
    live.again = true;
    return;
  }
  live.busy = true;
  render().finally(() => {
    live.busy = false;
    if (live.again) {
      live.again = false;
      liveRender();
    }
  });
}

const editor = createEditor({
  canvas: $('#ticket'),
  overlay: $('#ticket-overlay'),
  module: () => state.module,
  values: () => state.values,
  onChange: () => {
    persist(state.module, state.values);
    liveRender();
  },
  onCommit: () => renderModuleControls(), // sliders follow what was dragged
});

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
    key: 'paper',
    label: 'Papier',
    hint: "Règle la densité de chauffe (Bluetooth). Avec ⌘P, c'est l'option Densité du driver.",
    options: Object.entries(PAPERS).map(([value, p]) => ({ value, label: p.label })),
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

$('#btn-png').addEventListener('click', async () => {
  if (!state.bitmap) return;
  await downloadPNG(state.bitmap, fileName());
  offerCoffee();
});

$('#btn-system').addEventListener('click', async () => {
  if (!state.bitmap) return;
  await systemPrint(state.bitmap);
  offerCoffee();
});

$('#btn-ble').addEventListener('click', async (e) => {
  if (!state.bitmap) return;
  const btn = e.currentTarget;
  btn.loading = true;
  try {
    if (!printer.connected) setStatus('Recherche de la T02…');
    await printer.print(state.bitmap, {
      density: (PAPERS[state.print.paper] ?? PAPERS.ticket).density,
      extraFeed: mmToDots(Number(state.print.feedMm) || 0),
      onProgress: (r) => setStatus(`Envoi… ${Math.round(r * 100)} %`),
    });
    const battery = printer.battery != null ? ` · batterie ${printer.battery} %` : '';
    setStatus(`Imprimé${battery}`, 'success');
    offerCoffee();
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

/* ---------- Collapsible panels ---------- */

const panels = store.get('panels', { closed: [] });
for (const panel of document.querySelectorAll('wa-details.panel')) {
  panel.open = !panels.closed.includes(panel.dataset.panel);
  const remember = () => {
    const closed = new Set(panels.closed);
    if (panel.open) closed.delete(panel.dataset.panel);
    else closed.add(panel.dataset.panel);
    panels.closed = [...closed];
    store.set('panels', panels);
  };
  panel.addEventListener('wa-after-show', (e) => e.target === panel && remember());
  panel.addEventListener('wa-after-hide', (e) => e.target === panel && remember());
}

/* ---------- Boot ---------- */

renderControls($('#print-controls'), PRINT_CONTROLS, state.print, (values) => store.set('print', values));

if (!isBluetoothAvailable()) {
  $('#btn-ble').disabled = true;
  setStatus("Ce navigateur n'a pas Web Bluetooth (Chrome ou Edge requis). ⌘P et PNG restent dispo.", 'warning');
}

window.addEventListener('hashchange', () => selectModule(location.hash.slice(1)));
selectModule(location.hash.slice(1));
