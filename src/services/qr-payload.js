/**
 * QR payloads and module matrix. Pure functions (no DOM), so they can be checked in Node.
 *
 * Each payload builder returns the string a phone camera understands
 * (WIFI:…, a vCard, SMSTO:…, tel:…, mailto:…, geo:…), plus the lines
 * printed under the code so the paper is useful without scanning it.
 */
import qrcode from 'qrcode-generator';

// Accents, emoji, anything: encode as UTF-8 bytes (the library's default keeps only the low byte of each character).
qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));

export class QrError extends Error {}

/** Error-correction levels, from the sparsest to the most robust code. */
export const EC_LEVELS = [
  { value: 'L', label: 'L · 7 %' },
  { value: 'M', label: 'M · 15 %' },
  { value: 'Q', label: 'Q · 25 %' },
  { value: 'H', label: 'H · 30 %' },
];

const trim = (s) => String(s ?? '').trim();
const digits = (s) => trim(s).replace(/[\s().-]/g, '');

/** Backslash-escape the characters a given syntax reserves. */
const escapeWith = (chars) => (s) => String(s).replace(new RegExp(`[${chars}]`, 'g'), (c) => `\\${c}`);
const escapeWifi = escapeWith('\\\\;,:"');
const escapeVcard = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);

/** "example.com" → "https://example.com" */
export function normalizeUrl(raw) {
  const url = trim(raw);
  if (!url) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}

/** The QR types, in the order of the picker. */
export const TYPES = [
  { value: 'url', label: 'Lien (URL)', icon: 'link' },
  { value: 'wifi', label: 'Wi-Fi', icon: 'wifi' },
  { value: 'vcard', label: 'Contact (vCard)', icon: 'address-card' },
  { value: 'text', label: 'Texte libre', icon: 'font' },
  { value: 'sms', label: 'SMS', icon: 'message' },
  { value: 'tel', label: 'Appel', icon: 'phone' },
  { value: 'email', label: 'E-mail', icon: 'envelope' },
  { value: 'whatsapp', label: 'WhatsApp', icon: 'comment' },
  { value: 'geo', label: 'Position (GPS)', icon: 'location-dot' },
];

const BUILDERS = {
  url(v) {
    const data = normalizeUrl(v.url);
    return { data, lines: data ? [data.replace(/^https?:\/\//, '')] : [] };
  },

  text(v) {
    const data = String(v.text ?? '');
    return { data: trim(data) ? data : '', lines: [] };
  },

  wifi(v) {
    const ssid = String(v.wifiSsid ?? '');
    if (!trim(ssid)) return { data: '', lines: [] };
    const open = v.wifiSecurity === 'nopass';
    const parts = [`T:${v.wifiSecurity || 'WPA'}`, `S:${escapeWifi(ssid)}`];
    if (!open) parts.push(`P:${escapeWifi(v.wifiPassword ?? '')}`);
    if (v.wifiHidden) parts.push('H:true');
    const lines = [`Réseau : ${ssid}`];
    if (!open && v.showPassword && v.wifiPassword) lines.push(`Mot de passe : ${v.wifiPassword}`);
    return { data: `WIFI:${parts.join(';')};;`, lines };
  },

  vcard(v) {
    const first = trim(v.firstName);
    const last = trim(v.lastName);
    if (!first && !last && !trim(v.org)) return { data: '', lines: [] };
    const e = escapeVcard;
    const rows = ['BEGIN:VCARD', 'VERSION:3.0', `N:${e(last)};${e(first)};;;`, `FN:${e([first, last].filter(Boolean).join(' ') || trim(v.org))}`];
    if (trim(v.org)) rows.push(`ORG:${e(trim(v.org))}`);
    if (trim(v.jobTitle)) rows.push(`TITLE:${e(trim(v.jobTitle))}`);
    if (trim(v.phone)) rows.push(`TEL;TYPE=WORK,VOICE:${digits(v.phone)}`);
    if (trim(v.mobile)) rows.push(`TEL;TYPE=CELL,VOICE:${digits(v.mobile)}`);
    if (trim(v.email)) rows.push(`EMAIL;TYPE=INTERNET:${trim(v.email)}`);
    if (trim(v.website)) rows.push(`URL:${normalizeUrl(v.website)}`);
    if (trim(v.street) || trim(v.city) || trim(v.zip) || trim(v.country)) {
      rows.push(`ADR;TYPE=WORK:;;${e(trim(v.street))};${e(trim(v.city))};;${e(trim(v.zip))};${e(trim(v.country))}`);
    }
    if (trim(v.note)) rows.push(`NOTE:${e(trim(v.note))}`);
    rows.push('END:VCARD');
    const name = [first, last].filter(Boolean).join(' ');
    const lines = [name, [trim(v.jobTitle), trim(v.org)].filter(Boolean).join(' · '), trim(v.mobile) || trim(v.phone), trim(v.email)].filter(Boolean);
    return { data: rows.join('\n'), lines };
  },

  sms(v) {
    const number = digits(v.smsNumber);
    if (!number) return { data: '', lines: [] };
    const body = trim(v.smsBody);
    return { data: `SMSTO:${number}:${body}`, lines: [number, body].filter(Boolean) };
  },

  tel(v) {
    const number = digits(v.telNumber);
    return { data: number ? `tel:${number}` : '', lines: number ? [trim(v.telNumber)] : [] };
  },

  email(v) {
    const to = trim(v.mailTo);
    if (!to) return { data: '', lines: [] };
    const query = [['subject', trim(v.mailSubject)], ['body', trim(v.mailBody)]]
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    return { data: `mailto:${to}${query ? `?${query}` : ''}`, lines: [to, trim(v.mailSubject)].filter(Boolean) };
  },

  whatsapp(v) {
    const number = digits(v.waNumber).replace(/^\+/, '').replace(/^00/, '');
    if (!number) return { data: '', lines: [] };
    const body = trim(v.waBody);
    return { data: `https://wa.me/${number}${body ? `?text=${encodeURIComponent(body)}` : ''}`, lines: [`+${number}`, body].filter(Boolean) };
  },

  geo(v) {
    const lat = Number(String(v.geoLat).replace(',', '.'));
    const lon = Number(String(v.geoLon).replace(',', '.'));
    if (!trim(v.geoLat) || !trim(v.geoLon)) return { data: '', lines: [] };
    if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) throw new QrError('Latitude entre -90 et 90, longitude entre -180 et 180.');
    return { data: `geo:${lat},${lon}`, lines: [`${lat}, ${lon}`] };
  },
};

/**
 * @param {object} v  module values
 * @returns {{ data: string, lines: string[] }}  `data` is empty while the form is incomplete
 */
export function buildPayload(v) {
  const build = BUILDERS[v.qrType] ?? BUILDERS.url;
  return build(v);
}

/**
 * Module matrix of a QR code.
 * @returns {{ size: number, isDark: (row: number, col: number) => boolean }}
 */
export function qrMatrix(data, ec = 'M') {
  const qr = qrcode(0, ec);
  qr.addData(data);
  try {
    qr.make();
  } catch {
    throw new QrError('Trop de données pour un QR code à ce niveau de correction : raccourcis le contenu ou baisse la correction.');
  }
  return { size: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
}
