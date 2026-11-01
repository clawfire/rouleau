/**
 * Raw item (see extract.js) → LabelData, the single contract the label renderer knows.
 * Pure, no DOM. The label has no per-category schema: it reuses the attribute list Vinted already shows.
 */
import { parseUrl } from './parse-url.js';

/** @typedef {'neuf_etiquette'|'neuf'|'tres_bon'|'bon'|'satisfaisant'|null} Etat */

export const ETAT_LABELS = {
  neuf_etiquette: 'Neuf avec étiquette',
  neuf: 'Neuf sans étiquette',
  tres_bon: 'Très bon état',
  bon: 'Bon état',
  satisfaisant: 'Satisfaisant',
};

/** Vinted's condition wording, per language (en, fr, de, nl, es, it, pl). Order matters: "very good" before "good". */
const ETAT_PATTERNS = [
  ['neuf_etiquette', /new with tags|neuf avec [ée]tiquette|neu mit etikett|nieuw met (?:kaartje|label)|nuevo con etiqueta|nuovo con cartellino|nowy z metk/],
  ['neuf', /new without tags|neuf sans [ée]tiquette|neu ohne etikett|nieuw zonder (?:kaartje|label)|nuevo sin etiqueta|nuovo senza cartellino|nowy bez metk/],
  ['tres_bon', /very good|tr[eè]s bon|sehr gut|zeer goed|muy bueno|ottimo|bardzo dobry/],
  ['satisfaisant', /satisf|zufriedenstellend|voldoende|soddisfacente|zadowalaj/],
  ['bon', /^good\b|\bbon [ée]tat|^bon\b|^gut\b|^goed\b|^bueno\b|^buono\b|^dobry\b/],
];

/** @returns {Etat} */
export function mapEtat(text) {
  const t = String(text ?? '').toLowerCase().trim();
  if (!t) return null;
  return ETAT_PATTERNS.find(([, re]) => re.test(t))?.[0] ?? null;
}

/** Attribute codes that already have a fixed place on the label or mean nothing on a parcel. */
const EXCLUDED_CODES = /^(status|upload_date|price|item_price|shipping|location|payment|views|interested|category|buyer_protection|isbn.*|book_title)$/;
const EXCLUDED_TITLES = /^(état|etat|condition|prix|price|frais|emplacement|location|paiement|payment|vues|views|intéressés|interested|ajouté|uploaded|catégorie|category|postage|shipping|isbn)\b/i;

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const inText = (haystack, needle) => norm(haystack).includes(norm(needle));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ETAT_IN_TITLE = /\b(?:neuf(?:ve)?s?|nouveau|new)\s+(?:avec|sans|with|without)\s+[ée]?tiquettes?\b|\bneuve?s?\s+(?:avec|sans)\s+[ée]tiquettes?\b|\b(?:very )?(?:good|bon|tr[eè]s bon)\s+[ée]tat\b|\bjamais (?:port[ée]e?s?|utilis[ée]e?s?)\b/gi;

/** Title without the state (printed elsewhere), commercial punctuation, emojis and the "+ extras" tail. */
export function cleanTitle(title) {
  let t = String(title ?? '').normalize('NFC');
  t = t.replace(/\p{Extended_Pictographic}|️|‍/gu, ' ');
  t = t.replace(ETAT_IN_TITLE, ' ');
  const extras = t.match(/\s\+\s*(.+)$/)?.[1]?.trim();
  t = t.replace(/\s\+\s.*$/, ' ');
  t = t.replace(/[!?]{2,}|!+(?=\s|$)/g, ' ').replace(/\s{2,}/g, ' ');
  t = t.replace(/^[\s\-–—,;:·|/]+|[\s\-–—,;:·|/]+$/g, '');
  return { title: t, extras };
}

/** First line of the description introducing what comes with the item, or an ISBN. */
export function findComplement(description, isbn) {
  const lines = String(description ?? '').split(/\r?\n/).map((l) => l.trim());
  for (const line of lines) {
    const m = line.match(/^(?:inclus|livr[ée]e? avec|fourni(?:e|s)? avec|avec|included|comes with|incl\.?)\s*:\s*(.+)$/i);
    if (m) return `+ ${m[1].replace(/\.$/, '')}`;
    const p = line.match(/^\+\s*(.{3,})$/);
    if (p) return `+ ${p[1]}`;
  }
  const code = isbn ?? String(description ?? '').match(/\bISBN(?:-1[03])?\s*:?\s*((?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dXx])\b/i)?.[1];
  return code ? `ISBN ${String(code).replace(/[\s-]/g, '')}` : undefined;
}

const num = (s) => String(s).replace('.', ',');

/** "64 x 46 x 24 cm" → "64 × 46 × 24 cm". */
export function findDimensions(text) {
  const m = String(text ?? '').match(/(\d+(?:[.,]\d+)?)\s*(?:cm|mm)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:cm|mm)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm)\b/i);
  return m ? `${num(m[1])} × ${num(m[2])} × ${num(m[3])} ${m[4].toLowerCase()}` : undefined;
}

/** "poids 3,9 kg" or the first "3,9 kg" → "3,9 kg". Grams only when labelled as a weight. */
export function findWeight(text) {
  const s = String(text ?? '');
  const m =
    s.match(/(?:poids|weight|gewicht)[^\d\n]{0,12}(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i) ?? s.match(/(\d+(?:[.,]\d+)?)\s*(kg)\b/i);
  return m ? `${num(m[1])} ${m[2].toLowerCase()}` : undefined;
}

/** `dd.mm.yy`, today unless given. */
export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;
}

export const emptyLabel = (parsed, source = 'vinted') => ({
  source,
  id: parsed?.id ?? '',
  ref: parsed?.ref ?? '',
  url: parsed?.url ?? '',
  titre: '',
  etat: null,
  attributs: [],
  complement: '',
  poids: '',
  colis: null,
  dimensions: '',
  checklist: { photos: false, pese: false, emballe: false, expedie: false },
  date: today(),
});

/**
 * @param {object} raw raw item from extract.js
 * @param {{ id: string, ref: string, url: string }} [parsed] from parseUrl; falls back to raw.id
 */
export function normalize(raw, parsed = parseUrl(`/items/${raw.id ?? ''}`)) {
  const label = emptyLabel(parsed);
  const { title: cleaned, extras } = cleanTitle(raw.title);

  const status = raw.attributes.find((a) => a.code === 'status');
  label.etat = mapEtat(status?.value ?? raw.conditionText);

  // Attributes: the list Vinted shows, minus what has a fixed place; brand wins over the title, others yield to it.
  let title = cleaned;
  const attributs = [];
  for (const a of raw.attributes) {
    if (EXCLUDED_CODES.test(a.code) || EXCLUDED_TITLES.test(a.title)) continue;
    const value = a.value.replace(/\s+/g, ' ');
    if (!value || attributs.some((x) => norm(x) === norm(value))) continue;
    if (inText(title, value)) {
      if (a.code !== 'brand') continue;
      const stripped = title.replace(new RegExp(`\\s*${escapeRe(value)}\\s*`, 'i'), ' ').replace(/\s{2,}/g, ' ').trim();
      if (stripped.split(' ').length >= 2) title = stripped; // the brand is printed with the attributes
    }
    attributs.push(value);
  }
  label.titre = title;
  label.attributs = attributs.slice(0, 4);

  const isbn = raw.attributes.find((a) => /^isbn/.test(a.code))?.value;
  label.complement = findComplement(raw.description, isbn) ?? (extras ? `+ ${extras}` : '');
  label.dimensions = findDimensions(raw.description) ?? '';
  label.poids = findWeight(raw.description) ?? '';
  return label;
}
