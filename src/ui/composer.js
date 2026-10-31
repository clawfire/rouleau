/**
 * Panel of the composable morning ticket: the greeting, then one card per section that can be dragged
 * (or moved with the arrow buttons, which also serve keyboards and touch screens), removed, and unfolded
 * to show that module's own settings. Every change is written to `values.sections` and saved by `onChange`.
 */
import { addSection, moveSection, removeSection, sectionsOf } from '../modules/morning-model.js';
import { store } from '../store.js';
import { renderControls } from './controls.js';

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : String(v));
  node.append(...children);
  return node;
};

const iconButton = (icon, label, onClick) => {
  const btn = el('wa-button', { size: 's', appearance: 'plain', variant: 'neutral' }, [el('wa-icon', { name: icon, label })]);
  btn.addEventListener('click', onClick);
  return btn;
};

/**
 * @param {HTMLElement} container
 * @param {{ values: object, onChange: (values: object) => void, parts: object[], defaultsOf: (id: string) => object|null }} o
 */
export function mountComposer(container, { values, onChange, parts, defaultsOf }) {
  // First visit with the composer: the old flat settings are turned into sections, once and for all.
  let sections = sectionsOf(values, defaultsOf);
  const open = new Set(); // uids of the cards whose settings are unfolded
  const byId = (id) => parts.find((m) => m.id === id);

  const commit = () => {
    values.sections = sections;
    onChange(values);
  };
  commit();

  const head = el('div', { class: 'wa-stack wa-gap-l' });
  renderControls(head, [{ type: 'text', key: 'name', label: 'Prénom', hint: 'Optionnel : « Bonjour Prénom ».' }], values, () => onChange(values));

  const list = el('div', { class: 'composer-list' });
  const picker = el('wa-select', { label: 'Ajouter une section', placeholder: 'Choisir un module…', size: 's' });
  for (const m of parts) picker.append(el('wa-option', { value: m.id }, [m.label]));
  picker.addEventListener('change', () => {
    const mod = byId(picker.value);
    if (!mod) return;
    // A new section starts from what you already set in that module's own page (API keys, addresses…).
    sections = addSection(sections, mod.id, store.get(`module:${mod.id}`, mod.defaults));
    const uid = sections.at(-1).uid;
    open.add(uid);
    picker.value = '';
    commit();
    paint();
  });

  container.replaceChildren(head, list, picker);

  /* ---------- Settings of one section ---------- */

  function mountSettings(box, mod, inst) {
    const token = {};
    box._token = token;
    const draw = async () => {
      let schema = mod.controls ?? [];
      if (typeof schema === 'function') {
        const result = schema(inst.values);
        if (result instanceof Promise) {
          box.replaceChildren(el('wa-spinner'));
          try {
            schema = await result;
          } catch (err) {
            schema = [{ type: 'callout', variant: 'danger', text: err.message ?? String(err) }];
          }
          if (box._token !== token) return; // the card was repainted meanwhile
        } else schema = result;
      }
      renderControls(box, schema, inst.values, commit, draw);
    };
    draw();
  }

  /* ---------- Cards ---------- */

  function card(inst, index) {
    const mod = byId(inst.module);
    const settings = el('div', { class: 'wa-stack wa-gap-l' });
    const details = el('wa-details', { summary: 'Réglages', appearance: 'plain', size: 's' }, [settings]);
    details.toggleAttribute('open', open.has(inst.uid));
    details.addEventListener('wa-show', () => open.add(inst.uid));
    details.addEventListener('wa-hide', () => open.delete(inst.uid));
    mountSettings(settings, mod, inst);

    const grip = el('span', { class: 'composer-grip', title: 'Glisser pour déplacer' }, [el('wa-icon', { name: 'grip-vertical', label: 'Déplacer' })]);
    const bar = el('div', { class: 'composer-bar' }, [
      grip,
      el('span', { class: 'composer-name' }, [el('wa-icon', { name: mod.icon }), mod.label]),
      iconButton('arrow-up', 'Monter', () => move(inst.uid, index - 1)),
      iconButton('arrow-down', 'Descendre', () => move(inst.uid, index + 1)),
      iconButton('trash', 'Retirer', () => {
        sections = removeSection(sections, inst.uid);
        commit();
        paint();
      }),
    ]);
    const node = el('div', { class: 'composer-card', 'data-uid': inst.uid }, [bar, details]);

    // Only the grip starts a drag, so text fields inside the card keep their normal selection.
    grip.addEventListener('pointerdown', () => (node.draggable = true));
    node.addEventListener('dragend', () => {
      node.draggable = false;
      node.classList.remove('dragging');
      clearMarks();
    });
    node.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', inst.uid);
      e.dataTransfer.effectAllowed = 'move';
      node.classList.add('dragging');
    });
    return node;
  }

  function move(uid, to) {
    sections = moveSection(sections, uid, to);
    commit();
    paint();
  }

  /* ---------- Drag and drop ---------- */

  const cardsOtherThan = (uid) => [...list.querySelectorAll('.composer-card')].filter((c) => c.dataset.uid !== uid);
  const clearMarks = () => list.querySelectorAll('.drop-before, .drop-end').forEach((n) => n.classList.remove('drop-before', 'drop-end'));
  /** Index the dragged card would take if dropped at this height. */
  const indexAt = (uid, y) => cardsOtherThan(uid).filter((c) => y > c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2).length;

  list.addEventListener('dragover', (e) => {
    const uid = list.querySelector('.dragging')?.dataset.uid;
    if (!uid) return;
    e.preventDefault();
    clearMarks();
    const others = cardsOtherThan(uid);
    const at = indexAt(uid, e.clientY);
    (others[at] ?? list).classList.add(others[at] ? 'drop-before' : 'drop-end');
  });
  list.addEventListener('drop', (e) => {
    const uid = e.dataTransfer.getData('text/plain');
    if (!sections.some((s) => s.uid === uid)) return;
    e.preventDefault();
    move(uid, indexAt(uid, e.clientY));
  });

  function paint() {
    list.replaceChildren(...sections.map(card));
    if (!sections.length) list.append(el('p', { class: 'composer-empty' }, ['Aucune section : ajoute-en une ci-dessous.']));
  }
  paint();
}
