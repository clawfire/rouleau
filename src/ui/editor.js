/**
 * Direct manipulation on the ticket preview.
 *
 * An overlay sits on top of the preview canvas (same size). It never draws the ticket: it only holds the
 * selection box and catches the pointer. What it changes is data (`values.layers`, a photo's crop); the
 * ticket is re-rendered from that data, so what you see is what is burnt.
 *
 *   - layer (text / sticker): click selects, drag moves, corner resizes, top knob rotates, ✕ deletes,
 *     Delete / arrows / Escape on the keyboard, two fingers resize + rotate;
 *   - photo (a module's `targets`): drag pans the crop, wheel or two fingers zoom it.
 *
 * A module opts in with `editable: true`, `layers(values)` and `targets(values)` (see photo.js).
 */
import { layerBox, loadLayerIcons } from '../engine/layers.js';
import { notifyStudio, onStudio, select, studio } from './studio.js';

const MIN_SIZE = { text: 18, sticker: 24 };
const MAX_SIZE = { text: 160, sticker: 400 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {{ canvas: HTMLCanvasElement, overlay: HTMLElement,
 *           module: () => object, values: () => object,
 *           onChange: () => void, onCommit: () => void }} o
 *   onChange: after any edit (re-render now); onCommit: when a gesture ends (refresh the panel sliders)
 */
export function createEditor({ canvas, overlay, module: getModule, values: getValues, onChange, onCommit }) {
  const box = document.createElement('div');
  box.className = 'sel';
  box.innerHTML = '<span class="sel-del" data-role="del">✕</span><span class="sel-stem"></span><span class="sel-knob" data-role="rot"></span><span class="sel-size" data-role="size"></span>';
  overlay.append(box);

  let icons = {};
  let placeId = 0;
  const pointers = new Map();
  let drag = null;

  const layers = () => {
    const mod = getModule();
    return (mod?.editable && mod.layers?.(getValues())) || [];
  };
  const targets = () => {
    const mod = getModule();
    return (mod?.editable && mod.targets?.(getValues())) || [];
  };
  const selected = () => layers().find((l) => l.id === studio.selectedId);
  const scale = () => canvas.clientWidth / (canvas.width || 1);

  const boxOf = (l) => layerBox(l, icons[l.icon]);

  /** Pointer → ticket dots. */
  const toDots = (e) => {
    const r = canvas.getBoundingClientRect();
    const k = r.width / canvas.width;
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };

  const hit = (l, p) => {
    const { w, h } = boxOf(l);
    const a = (-(l.rot ?? 0) * Math.PI) / 180;
    const dx = p.x - l.x;
    const dy = p.y - l.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    const slop = 6;
    return Math.abs(lx) <= w / 2 + slop && Math.abs(ly) <= h / 2 + slop;
  };

  /* ---------- Selection box ---------- */

  async function place() {
    const id = ++placeId;
    const mod = getModule();
    overlay.hidden = !mod?.editable;
    if (!mod?.editable) return;
    studio.ticketW = canvas.width;
    studio.ticketH = canvas.height;
    const all = layers();
    const loaded = await loadLayerIcons(all);
    if (id !== placeId) return;
    icons = loaded;
    const l = selected();
    box.hidden = !l;
    if (!l) return;
    const k = scale();
    const { w, h } = boxOf(l);
    box.style.cssText = `left:${(l.x - w / 2) * k}px;top:${(l.y - h / 2) * k}px;width:${w * k}px;height:${h * k}px;transform:rotate(${l.rot ?? 0}deg)`;
  }

  /* ---------- Edits ---------- */

  const edited = () => {
    onChange();
    notifyStudio('layers', 'editor');
    place();
  };

  function remove(l) {
    const all = layers();
    all.splice(all.indexOf(l), 1);
    select(null);
    edited();
    onCommit();
  }

  const snap = (deg) => {
    const near = Math.round(deg / 15) * 15;
    return Math.abs(deg - near) < 4 ? near : deg;
  };

  function resizeBy(l, factor) {
    l.size = clamp(Math.round(l.size * factor), MIN_SIZE[l.type], MAX_SIZE[l.type]);
  }

  /* ---------- Pointer ---------- */

  overlay.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    overlay.setPointerCapture(e.pointerId);
    const p = toDots(e);
    pointers.set(e.pointerId, p);

    if (pointers.size === 2 && drag) {
      // Second finger: pinch on whatever the first one holds.
      const [a, b] = [...pointers.values()];
      drag.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
      return;
    }

    const role = e.target.dataset?.role;
    const sel = selected();
    if (sel && role === 'del') return remove(sel);
    if (sel && (role === 'size' || role === 'rot')) {
      drag = { kind: role, layer: sel, start: { size: sel.size, dist: Math.hypot(p.x - sel.x, p.y - sel.y) || 1 } };
      return;
    }

    const all = layers();
    for (let i = all.length - 1; i >= 0; i--) {
      if (!hit(all[i], p)) continue;
      select(all[i].id);
      drag = { kind: 'move', layer: all[i], last: p };
      place();
      return;
    }

    const target = targets().find((t) => p.x >= t.rect.x && p.x <= t.rect.x + t.rect.w && p.y >= t.rect.y && p.y <= t.rect.y + t.rect.h);
    select(null);
    place();
    if (target) drag = { kind: 'pan', target, last: p };
  });

  overlay.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = toDots(e);
    pointers.set(e.pointerId, p);
    if (!drag) return;

    if (drag.pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const factor = dist / (drag.pinch.dist || 1);
      if (drag.kind === 'pan') drag.target.zoomBy(factor);
      else if (drag.layer) {
        resizeBy(drag.layer, factor);
        drag.layer.rot = Math.round((drag.layer.rot ?? 0) + ((angle - drag.pinch.angle) * 180) / Math.PI);
      }
      drag.pinch = { dist, angle };
      return edited();
    }
    if (pointers.size > 1) return;

    if (drag.kind === 'move') {
      const l = drag.layer;
      l.x = Math.round(clamp(l.x + p.x - drag.last.x, 0, canvas.width));
      l.y = Math.round(clamp(l.y + p.y - drag.last.y, 0, canvas.height));
      drag.last = p;
    } else if (drag.kind === 'size') {
      const l = drag.layer;
      const dist = Math.hypot(p.x - l.x, p.y - l.y);
      l.size = clamp(Math.round((drag.start.size * dist) / drag.start.dist), MIN_SIZE[l.type], MAX_SIZE[l.type]);
    } else if (drag.kind === 'rot') {
      const l = drag.layer;
      const deg = (Math.atan2(p.y - l.y, p.x - l.x) * 180) / Math.PI + 90;
      l.rot = Math.round(snap(((deg + 540) % 360) - 180));
    } else if (drag.kind === 'pan') {
      drag.target.pan(p.x - drag.last.x, p.y - drag.last.y);
      drag.last = p;
    }
    edited();
  });

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 1 && drag?.pinch) {
      drag.pinch = null;
      drag.last = [...pointers.values()][0];
    }
    if (pointers.size === 0 && drag) {
      drag = null;
      onCommit();
    }
  };
  overlay.addEventListener('pointerup', end);
  overlay.addEventListener('pointercancel', end);

  overlay.addEventListener(
    'wheel',
    (e) => {
      const p = toDots(e);
      const factor = Math.exp(-e.deltaY * 0.002);
      const all = layers();
      const l = selected() && hit(selected(), p) ? selected() : all.findLast((x) => hit(x, p));
      if (l) {
        e.preventDefault();
        resizeBy(l, factor);
        return edited();
      }
      const target = targets().find((t) => p.x >= t.rect.x && p.x <= t.rect.x + t.rect.w && p.y >= t.rect.y && p.y <= t.rect.y + t.rect.h);
      if (!target) return;
      e.preventDefault();
      target.zoomBy(factor);
      edited();
      clearTimeout(end.t);
      end.t = setTimeout(onCommit, 250);
    },
    { passive: false },
  );

  /* ---------- Keyboard ---------- */

  document.addEventListener('keydown', (e) => {
    const l = selected();
    if (!l || !getModule()?.editable) return;
    if (e.composedPath().some((n) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName) || n.isContentEditable)) return;
    const step = e.shiftKey ? 10 : 1;
    const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(l);
    } else if (e.key === 'Escape') {
      select(null);
    } else if (arrows[e.key]) {
      e.preventDefault();
      l.x = clamp(l.x + arrows[e.key][0], 0, canvas.width);
      l.y = clamp(l.y + arrows[e.key][1], 0, canvas.height);
      edited();
    }
  });

  new ResizeObserver(() => place()).observe(canvas);
  onStudio(({ kind, from }) => {
    if (kind === 'select' || from === 'panel') place();
  });

  return { sync: place };
}
