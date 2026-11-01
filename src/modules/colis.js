/**
 * Parcel label (Vinted): paste a listing URL, check and complete the fields, print. The label only knows
 * `LabelData` (src/vinted/normalize.js); a source adapter fills it. Printing never depends on the import:
 * when it fails the form stays usable, with the ID, reference and QR already derived from the URL.
 */
import { text as textBlock } from '../engine/blocks.js';
import { TYPE } from '../fonts.js';
import { ADAPTERS, ImportError } from '../vinted/adapter.js';
import { ETAT_LABELS, emptyLabel, today } from '../vinted/normalize.js';
import { parseUrl } from '../vinted/parse-url.js';
import { FONTS, labelBlock } from './colis-draw.js';

const ATTR_KEYS = ['attr1', 'attr2', 'attr3', 'attr4'];
const CHECK_KEYS = ['photos', 'pese', 'emballe', 'expedie'];

/** Flat form values ← LabelData (import). Keeps the parcel size, which Vinted does not publish. */
function applyLabel(values, label) {
  Object.assign(values, {
    id: label.id,
    titre: label.titre,
    etat: label.etat ?? '',
    complement: label.complement ?? '',
    poids: label.poids ?? '',
    dimensions: label.dimensions ?? '',
    date: '', // empty = the day it is printed
    ...Object.fromEntries(ATTR_KEYS.map((k, i) => [k, label.attributs[i] ?? ''])),
    ...Object.fromEntries(CHECK_KEYS.map((k) => [k, false])),
  });
}

/** LabelData ← flat form values (render). The reference and the QR URL come from the ID. */
export function toLabel(v) {
  const parsed = parseUrl(`/items/${String(v.id ?? '').replace(/\D/g, '')}`);
  return {
    ...emptyLabel(parsed),
    titre: v.titre ?? '',
    etat: v.etat || null,
    attributs: ATTR_KEYS.map((k) => String(v[k] ?? '').trim()).filter(Boolean),
    complement: v.complement ?? '',
    poids: v.poids ?? '',
    colis: v.colis || null,
    dimensions: v.dimensions ?? '',
    checklist: Object.fromEntries(CHECK_KEYS.map((k) => [k, Boolean(v[k])])),
    date: /^\d{4}-\d{2}-\d{2}$/.test(v.date ?? '') ? v.date.replace(/^\d{2}(\d{2})-(\d{2})-(\d{2})$/, '$3.$2.$1') : today(),
  };
}

/* ---------- Import widget ---------- */

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, val] of Object.entries(attrs)) if (val !== undefined && val !== false) node.setAttribute(k, val === true ? '' : String(val));
  node.append(...children);
  return node;
};

/** Where the last import ended up, shown under the field (not persisted). */
let importStatus = null;

function importWidget(host, values, emit, refresh) {
  const input = el('wa-input', { label: 'Lien de l’annonce', placeholder: 'https://www.vinted.fr/items/123456789-…', hint: 'Tout domaine Vinted. Seul l’identifiant compte.' });
  input.value = values.url ?? '';
  const go = el('wa-button', { variant: 'brand', size: 's' }, ['Importer']);
  const status = el('div');
  const paint = () => {
    status.replaceChildren();
    if (importStatus) status.append(el('wa-callout', { variant: importStatus.variant, size: 's' }, [importStatus.text]));
  };
  paint();

  const finish = (variant, message) => {
    importStatus = { variant, text: message };
    emit();
    refresh(); // rebuild the form with the imported values
  };

  const run = async () => {
    values.url = input.value;
    const parsed = parseUrl(input.value);
    if (!parsed) {
      importStatus = { variant: 'danger', text: 'Ce lien ne ressemble pas à une annonce Vinted (…/items/123456).' };
      paint();
      return;
    }
    // Whatever happens next, the ID (hence the reference and the QR) is already set.
    values.id = parsed.id;
    go.setAttribute('loading', '');
    try {
      applyLabel(values, await ADAPTERS.vinted.fromUrl(input.value));
      finish('success', 'Annonce importée. Vérifie les champs, puis complète poids et taille du colis.');
    } catch (err) {
      const msg = err instanceof ImportError || err?.message ? err.message : 'Import impossible.';
      finish('warning', `${msg} L’étiquette reste imprimable : remplis les champs à la main (référence et QR sont déjà prêts).`);
    } finally {
      go.removeAttribute('loading');
    }
  };
  go.addEventListener('click', run);
  input.addEventListener('input', () => (values.url = input.value));
  input.addEventListener('keydown', (e) => e.key === 'Enter' && run());

  // Raw import: HTML or JSON already extracted (pasted page source, or sent by a future browser extension).
  const raw = el('wa-textarea', { label: 'HTML ou JSON de l’annonce', rows: 4, resize: 'auto', hint: 'Affichage › source de la page, ou JSON d’une extension. Contourne l’anti-bot.' });
  const rawGo = el('wa-button', { size: 's', appearance: 'outlined' }, ['Analyser']);
  rawGo.addEventListener('click', () => {
    try {
      applyLabel(values, ADAPTERS.vinted.fromRaw(raw.value, input.value));
      finish('success', 'Données analysées. Vérifie les champs ci-dessous.');
    } catch (err) {
      importStatus = { variant: 'danger', text: err.message };
      paint();
    }
  });
  const details = el('wa-details', { summary: 'Coller le HTML / JSON à la main' }, [el('div', { class: 'wa-stack wa-gap-s' }, [raw, rawGo])]);

  host.append(el('div', { class: 'wa-stack wa-gap-s' }, [input, go]), status, details);
}

/* ---------- Module ---------- */

export default {
  id: 'colis',
  composable: false,
  footer: false, // the label ends with its grid and QR: no signature
  label: 'Fiche colis Vinted',
  icon: 'box',
  description: 'Colle le lien d’une annonce Vinted : la fiche décrit l’article du colis, avec référence, QR, poids et taille à compléter. Tout reste modifiable avant l’impression.',

  defaults: {
    url: '',
    id: '',
    titre: '',
    etat: '',
    attr1: '',
    attr2: '',
    attr3: '',
    attr4: '',
    complement: '',
    poids: '',
    colis: '',
    dimensions: '',
    photos: false,
    pese: false,
    emballe: false,
    expedie: false,
    date: '',
    level: 128,
  },

  controls() {
    return [
      { type: 'section', title: 'Annonce' },
      { type: 'custom', render: importWidget },
      { type: 'section', title: 'Article' },
      { type: 'text', key: 'id', label: 'Identifiant de l’annonce', hint: 'Les 4 derniers chiffres font la référence #…, le QR pointe vers l’annonce.', placeholder: '10528895986' },
      { type: 'text', key: 'titre', label: 'Titre' },
      {
        type: 'select',
        key: 'etat',
        label: 'État',
        options: [{ value: '', label: '—' }, ...Object.entries(ETAT_LABELS).map(([value, label]) => ({ value, label }))],
      },
      { type: 'text', key: 'attr1', label: 'Attribut 1', placeholder: 'Marque' },
      { type: 'text', key: 'attr2', label: 'Attribut 2' },
      { type: 'text', key: 'attr3', label: 'Attribut 3' },
      { type: 'text', key: 'attr4', label: 'Attribut 4' },
      { type: 'text', key: 'complement', label: 'Complément', hint: 'Ex. « + housse, câble » ou « ISBN … ». Vide : la ligne disparaît.' },
      { type: 'section', title: 'Colis' },
      { type: 'text', key: 'poids', label: 'Poids', placeholder: '3,9 kg', hint: 'Vide : un espace à remplir au stylo.' },
      {
        type: 'select',
        key: 'colis',
        label: 'Taille du colis',
        options: [
          { value: '', label: '—' },
          { value: 'Petit', label: 'Petit' },
          { value: 'Moyen', label: 'Moyen' },
          { value: 'Grand', label: 'Grand' },
        ],
      },
      { type: 'text', key: 'dimensions', label: 'Dimensions', placeholder: '64 × 46 × 24 cm' },
      { type: 'date', key: 'date', label: 'Date d’emballage', hint: 'Vide : la date du jour.' },
      { type: 'switch', key: 'photos', label: 'Photos' },
      { type: 'switch', key: 'pese', label: 'Pesé' },
      { type: 'switch', key: 'emballe', label: 'Emballé' },
      { type: 'switch', key: 'expedie', label: 'Expédié' },
      { type: 'section', title: 'Impression' },
      { type: 'slider', key: 'level', label: 'Seuil noir / blanc', hint: 'Plus haut = plus noir. Le texte est seuillé, jamais tramé.', min: 60, max: 200, step: 5 },
    ];
  },

  async blocks(v) {
    // Fonts must be loaded before the label is measured.
    await Promise.all(FONTS.map((f) => document.fonts?.load(f, 'AaÉé09#').catch(() => null)));
    if (!String(v.id ?? '').replace(/\D/g, '') && !v.titre?.trim()) {
      return [textBlock('Colle le lien d’une annonce Vinted, ou remplis les champs.', { ...TYPE.caption, align: 'center' })];
    }
    return [labelBlock(toLabel(v), { level: Number(v.level) || 128 })];
  },
};
