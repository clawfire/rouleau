/**
 * Schema → Web Awesome form controls.
 *
 * Supported types: text, textarea, slider, date, switch, checkboxes, radio, select, image, button, buttons (a row of buttons), callout, custom (a module-owned widget), section (a titled card grouping the controls after it).
 * Every control writes into `values[key]` and calls `onChange(values)`.
 * Controls flagged `refresh: true` also call `onRefresh(values)` when committed,
 * so a module can rebuild its controls (e.g. load routines once an API key is set).
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

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** File → shrunk JPEG data URL (small enough for localStorage). */
async function readImage(file, maxSize) {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('too large');
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * k));
  canvas.height = Math.max(1, Math.round(bitmap.height * k));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * @param {HTMLElement} container
 * @param {object[]} schema
 * @param {object} values  mutated in place
 * @param {(values: object) => void} onChange
 * @param {(values: object) => void} [onRefresh]
 */
export function renderControls(container, schema, values, onChange, onRefresh) {
  container.replaceChildren();
  const emit = () => onChange(values);
  const refreshOn = (node, c, event) => {
    if (c.refresh && onRefresh) node.addEventListener(event, () => onRefresh(values));
  };

  let group = null; // the card opened by the last `section`: later controls go inside it
  for (const c of schema) {
    let node;
    switch (c.type) {
      case 'section': {
        // A titled card that groups the controls following it, up to the next section.
        group = el('wa-card', { appearance: 'outlined' }, [el('div', { slot: 'header', class: 'wa-heading-s' }, [c.title])]);
        const body = el('div', { class: 'wa-stack wa-gap-m' });
        group.append(body);
        group.body = body;
        container.append(group);
        continue;
      }
      case 'text': {
        node = el('wa-input', {
          label: c.label,
          hint: c.hint,
          placeholder: c.placeholder,
          type: c.password ? 'password' : 'text',
          'password-toggle': c.password,
          autocomplete: c.password ? 'off' : undefined,
        });
        node.value = values[c.key] ?? '';
        node.addEventListener('input', () => {
          values[c.key] = node.value;
          emit();
        });
        refreshOn(node, c, 'change');
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
      case 'date': {
        // Web Awesome date input (segmented field + calendar popup). Stores an ISO `YYYY-MM-DD`, or '' when cleared.
        node = el('wa-date-input', { label: c.label, hint: c.hint, 'with-clear': true });
        node.value = values[c.key] ?? '';
        node.addEventListener('change', () => {
          values[c.key] = node.value || '';
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
        refreshOn(node, c, 'change');
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
        refreshOn(node, c, 'change');
        break;
      }
      case 'select': {
        node = el('wa-select', { label: c.label, hint: c.hint });
        for (const opt of c.options) node.append(el('wa-option', { value: opt.value }, [opt.label]));
        node.value = String(values[c.key] ?? '');
        node.addEventListener('change', () => {
          values[c.key] = node.value;
          emit();
        });
        refreshOn(node, c, 'change');
        break;
      }
      case 'image': {
        // Picks an image, shrinks it and stores it in `values[key]` as a JPEG data URL (empty string = none).
        node = el('wa-file-input', { label: c.label, hint: c.hint, accept: 'image/*' });
        node.addEventListener('change', async () => {
          const file = node.files?.[0];
          try {
            values[c.key] = file ? await readImage(file, c.maxSize ?? 480) : '';
            node.setCustomValidity?.('');
          } catch {
            values[c.key] = '';
            node.setCustomValidity?.('Image illisible ou trop lourde (25 Mo maximum).');
            node.reportValidity?.();
          }
          emit();
          if (c.refresh && onRefresh) onRefresh(values);
        });
        break;
      }
      case 'button': {
        node = el('wa-button', { size: 's', appearance: 'outlined', variant: c.variant ?? 'neutral' }, [c.label]);
        node.addEventListener('click', () => {
          c.onClick?.(values);
          emit();
          if (c.refresh && onRefresh) onRefresh(values);
        });
        break;
      }
      case 'buttons': {
        // Several buttons on one line (they wrap when the panel is narrow): `buttons: [{ label, onClick }]`.
        node = el('div', { class: 'wa-cluster wa-gap-xs' });
        for (const b of c.buttons) {
          const btn = el('wa-button', { size: 's', appearance: 'outlined', variant: b.variant ?? 'neutral' }, [b.label]);
          btn.addEventListener('click', () => {
            b.onClick?.(values);
            emit();
            if (c.refresh && onRefresh) onRefresh(values);
          });
          node.append(btn);
        }
        break;
      }
      case 'custom': {
        // A module-owned widget: `render(container, values, emit, refresh)` fills a host element.
        node = el('div', { class: 'wa-stack wa-gap-m' });
        c.render(node, values, emit, () => onRefresh?.(values));
        break;
      }
      case 'callout': {
        const icon = el('wa-icon', {
          slot: 'icon',
          name: { danger: 'triangle-exclamation', warning: 'triangle-exclamation', success: 'circle-check' }[c.variant] ?? 'circle-info',
        });
        node = el('wa-callout', { variant: c.variant ?? 'neutral', size: 's' }, [icon, c.text]);
        break;
      }
      default:
        console.warn('[rouleau] unknown control type', c);
        continue;
    }
    (group?.body ?? container).append(node);
  }
}
