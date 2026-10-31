/**
 * "Calques" widget for the photo lab: add text and stickers, pick one, edit it.
 * Used as a `custom` control; the on-ticket editor (`editor.js`) manipulates the same layers.
 */
import { layerBox, MIN_TEXT_SIZE } from '../engine/layers.js';
import { FONTS } from '../fonts.js';
import { renderControls } from './controls.js';
import { pickSticker } from './sticker-picker.js';
import { newLayerId, notifyStudio, onStudio, select, studio } from './studio.js';

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : String(v));
  node.append(...children);
  return node;
};

const labelOf = (l) => (l.type === 'sticker' ? 'Sticker' : String(l.text ?? '').split('\n')[0].slice(0, 18) || 'Texte');

export const layersControl = {
  type: 'custom',
  render(container, values, emit) {
    const layers = (values.layers ??= []);
    const center = () => ({ x: Math.round(studio.ticketW / 2), y: Math.round((studio.ticketH || 400) / 2) });
    const changed = () => {
      emit();
      notifyStudio('layers', 'panel');
    };

    function add(layer) {
      layers.push({ id: newLayerId(), rot: 0, halo: true, ...center(), ...layer });
      select(layers[layers.length - 1].id);
      changed();
      draw();
    }

    function fieldsFor(layer) {
      const move = (delta) => {
        const i = layers.indexOf(layer);
        const j = Math.max(0, Math.min(layers.length - 1, i + delta));
        layers.splice(i, 1);
        layers.splice(j, 0, layer);
        changed();
        draw();
      };
      const common = [
        { type: 'slider', key: 'rot', label: 'Rotation (°)', min: -180, max: 180, step: 5 },
        {
          type: 'buttons',
          buttons: [
            { label: 'Dupliquer', onClick: () => add({ ...layer, id: undefined, x: layer.x + 16, y: layer.y + 16 }) },
            { label: 'Devant', onClick: () => move(1) },
            { label: 'Derrière', onClick: () => move(-1) },
            {
              label: 'Supprimer',
              variant: 'danger',
              onClick: () => {
                layers.splice(layers.indexOf(layer), 1);
                select(null);
                changed();
                draw();
              },
            },
          ],
        },
      ];
      if (layer.type === 'sticker') {
        return [
          {
            type: 'button',
            label: 'Changer d’icône',
            onClick: () =>
              pickSticker().then((name) => {
                if (!name) return;
                layer.icon = name;
                changed();
                draw();
              }),
          },
          { type: 'slider', key: 'size', label: 'Taille', min: 24, max: 320, step: 4 },
          { type: 'switch', key: 'invert', label: 'Inverser (blanc cerné de noir)' },
          { type: 'switch', key: 'halo', label: 'Contour blanc' },
          ...common,
        ];
      }
      return [
        { type: 'textarea', key: 'text', label: 'Texte', rows: 2 },
        { type: 'select', key: 'font', label: 'Police', options: FONTS.map((f) => ({ value: f.id, label: f.label })) },
        { type: 'slider', key: 'size', label: 'Taille', min: MIN_TEXT_SIZE, max: 120, step: 2 },
        {
          type: 'radio',
          key: 'bg',
          label: 'Fond',
          refresh: true,
          options: [
            { value: 'none', label: 'Aucun' },
            { value: 'black', label: 'Noir' },
            { value: 'white', label: 'Blanc' },
            { value: 'frame', label: 'Cadre' },
          ],
        },
        ...(layer.bg === 'none' || !layer.bg ? [{ type: 'switch', key: 'halo', label: 'Contour blanc' }] : []),
        { type: 'switch', key: 'bold', label: 'Gras (Atkinson)' },
        {
          type: 'radio',
          key: 'align',
          label: 'Alignement',
          options: [
            { value: 'left', label: 'Gauche' },
            { value: 'center', label: 'Centre' },
            { value: 'right', label: 'Droite' },
          ],
        },
        ...common,
      ];
    }

    function draw() {
      container.replaceChildren();
      const bar = el('div', { class: 'wa-cluster wa-gap-xs' });
      const addText = el('wa-button', { size: 's', appearance: 'outlined' }, [el('wa-icon', { slot: 'start', name: 'font' }), 'Texte']);
      const addSticker = el('wa-button', { size: 's', appearance: 'outlined' }, [el('wa-icon', { slot: 'start', name: 'face-smile' }), 'Sticker']);
      addText.addEventListener('click', () => add({ type: 'text', text: 'Texte', font: 'atkinson', bold: true, size: 36, bg: 'none', align: 'center' }));
      addSticker.addEventListener('click', () => pickSticker().then((icon) => icon && add({ type: 'sticker', icon, size: 96 })));
      bar.append(addText, addSticker);
      container.append(bar);

      if (!layers.length) {
        container.append(el('p', { class: 'wa-body-s wa-color-text-quiet' }, ['Ajoute du texte ou un sticker, puis déplace-le sur le ticket.']));
        return;
      }
      const list = el('div', { class: 'wa-cluster wa-gap-xs' });
      for (const l of layers) {
        const pick = el('wa-button', { size: 's', appearance: l.id === studio.selectedId ? 'accent' : 'outlined' });
        if (l.type === 'sticker') pick.append(el('wa-icon', { slot: 'start', name: l.icon }));
        pick.append(labelOf(l));
        pick.addEventListener('click', () => select(l.id));
        list.append(pick);
      }
      container.append(list);

      const layer = layers.find((l) => l.id === studio.selectedId);
      if (!layer) return;
      const host = el('div', { class: 'wa-stack wa-gap-m layer-fields' });
      container.append(host);
      renderControls(host, fieldsFor(layer), layer, () => changed(), () => draw());
    }

    draw();
    const off = onStudio(({ kind, from }) => {
      if (!container.isConnected) return off();
      if (kind === 'select' || (kind === 'layers' && from === 'editor')) draw();
    });
  },
};

export { layerBox };
