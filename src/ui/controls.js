/**
 * Schema → Web Awesome form controls.
 *
 * Supported types: text, textarea, slider, switch, checkboxes, radio, select.
 * Every control writes into `values[key]` and calls `onChange(values)`.
 */

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  node.append(...children);
  return node;
};

/**
 * @param {HTMLElement} container
 * @param {object[]} schema
 * @param {object} values  mutated in place
 * @param {(values: object) => void} onChange
 */
export function renderControls(container, schema, values, onChange) {
  container.replaceChildren();
  const emit = () => onChange(values);

  for (const c of schema) {
    let node;
    switch (c.type) {
      case 'text': {
        node = el('wa-input', { label: c.label, hint: c.hint, placeholder: c.placeholder });
        node.value = values[c.key] ?? '';
        node.addEventListener('input', () => {
          values[c.key] = node.value;
          emit();
        });
        break;
      }
      case 'textarea': {
        node = el('wa-textarea', { label: c.label, hint: c.hint, rows: c.rows ?? 3, resize: 'auto' });
        node.value = values[c.key] ?? '';
        node.addEventListener('input', () => {
          values[c.key] = node.value;
          emit();
        });
        break;
      }
      case 'slider': {
        node = el('wa-slider', {
          label: c.label,
          hint: c.hint,
          min: c.min ?? 0,
          max: c.max ?? 100,
          step: c.step ?? 1,
          'with-tooltip': true,
        });
        node.value = Number(values[c.key] ?? c.min ?? 0);
        node.addEventListener('input', () => {
          values[c.key] = node.value;
          emit();
        });
        break;
      }
      case 'switch': {
        node = el('wa-switch', { hint: c.hint }, [c.label]);
        node.checked = Boolean(values[c.key]);
        node.addEventListener('change', () => {
          values[c.key] = node.checked;
          emit();
        });
        break;
      }
      case 'checkboxes': {
        node = el('wa-checkbox-group', { label: c.label, hint: c.hint });
        const selected = new Set(values[c.key] ?? []);
        for (const opt of c.options) {
          const box = el('wa-checkbox', { hint: opt.hint }, [opt.label]);
          box.checked = selected.has(opt.value);
          box.addEventListener('change', () => {
            if (box.checked) selected.add(opt.value);
            else selected.delete(opt.value);
            values[c.key] = c.options.map((o) => o.value).filter((v) => selected.has(v));
            emit();
          });
          node.append(box);
        }
        break;
      }
      case 'radio': {
        node = el('wa-radio-group', { label: c.label, hint: c.hint, orientation: 'horizontal' });
        for (const opt of c.options) {
          node.append(el('wa-radio', { value: opt.value, appearance: 'button' }, [opt.label]));
        }
        node.value = String(values[c.key]);
        node.addEventListener('change', () => {
          values[c.key] = node.value;
          emit();
        });
        break;
      }
      case 'select': {
        node = el('wa-select', { label: c.label, hint: c.hint });
        for (const opt of c.options) node.append(el('wa-option', { value: opt.value }, [opt.label]));
        node.value = String(values[c.key]);
        node.addEventListener('change', () => {
          values[c.key] = node.value;
          emit();
        });
        break;
      }
      default:
        console.warn('[rouleau] unknown control type', c);
        continue;
    }
    container.append(node);
  }
}
