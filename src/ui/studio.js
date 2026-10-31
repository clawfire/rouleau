/**
 * Shared state of the photo editor: the selected layer and the size of the ticket on screen.
 * The layers panel (left column) and the on-ticket editor both listen to it.
 */
const listeners = new Set();

export const studio = { selectedId: null, ticketW: 384, ticketH: 0 };

/** @param {(change: { kind: 'select'|'layers', from?: string }) => void} fn */
export const onStudio = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const notifyStudio = (kind, from) => listeners.forEach((fn) => fn({ kind, from }));

export function select(id) {
  if (studio.selectedId === id) return;
  studio.selectedId = id;
  notifyStudio('select');
}

export const newLayerId = () => Math.random().toString(36).slice(2, 8);
