/**
 * QR utilities: Wi-Fi, contact, link, SMS, call, e-mail, WhatsApp, GPS, free text.
 * The code is drawn module by module at an integer size, thresholded (never dithered:
 * a grey module would not scan), with the useful details printed under it.
 */
import { draw, space, text } from '../engine/blocks.js';
import { PRINT_WIDTH, dotsToMm, mmToDots } from '../engine/constants.js';
import { TYPE } from '../fonts.js';
import { EC_LEVELS, QrError, TYPES, buildPayload, qrMatrix } from '../services/qr-payload.js';

const QUIET = 2; // modules of white around the code; the paper margin adds the rest
const MIN_MODULE = 3; // dots: below this a 203 dpi thermal head smears modules together

const typeOf = (id) => TYPES.find((t) => t.value === id) ?? TYPES[0];

/* ---------- Form, per type ---------- */

const FIELDS = {
  url: () => [{ type: 'text', key: 'url', label: 'Adresse', placeholder: 'exemple.com/page' }],
  text: () => [{ type: 'textarea', key: 'text', label: 'Texte', rows: 3 }],
  wifi: (v) => [
    { type: 'text', key: 'wifiSsid', label: 'Nom du réseau (SSID)' },
    {
      type: 'radio',
      key: 'wifiSecurity',
      label: 'Sécurité',
      refresh: true,
      options: [
        { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
        { value: 'WEP', label: 'WEP' },
        { value: 'nopass', label: 'Ouvert' },
      ],
    },
    ...(v.wifiSecurity === 'nopass'
      ? []
      : [
          { type: 'text', key: 'wifiPassword', label: 'Mot de passe', password: true },
          { type: 'switch', key: 'showPassword', label: 'Imprimer le mot de passe en clair' },
        ]),
    { type: 'switch', key: 'wifiHidden', label: 'Réseau masqué' },
  ],
  vcard: () => [
    { type: 'text', key: 'firstName', label: 'Prénom' },
    { type: 'text', key: 'lastName', label: 'Nom' },
    { type: 'text', key: 'org', label: 'Société' },
    { type: 'text', key: 'jobTitle', label: 'Fonction' },
    { type: 'text', key: 'mobile', label: 'Mobile', placeholder: '+352 621 123 456' },
    { type: 'text', key: 'phone', label: 'Téléphone fixe' },
    { type: 'text', key: 'email', label: 'E-mail' },
    { type: 'text', key: 'website', label: 'Site web' },
    { type: 'text', key: 'street', label: 'Rue' },
    { type: 'text', key: 'zip', label: 'Code postal' },
    { type: 'text', key: 'city', label: 'Ville' },
    { type: 'text', key: 'country', label: 'Pays' },
    { type: 'text', key: 'note', label: 'Note' },
  ],
  sms: () => [
    { type: 'text', key: 'smsNumber', label: 'Numéro', placeholder: '+352 621 123 456' },
    { type: 'textarea', key: 'smsBody', label: 'Message pré-rempli', rows: 2 },
  ],
  tel: () => [{ type: 'text', key: 'telNumber', label: 'Numéro à appeler', placeholder: '+352 621 123 456' }],
  email: () => [
    { type: 'text', key: 'mailTo', label: 'Destinataire' },
    { type: 'text', key: 'mailSubject', label: 'Objet' },
    { type: 'textarea', key: 'mailBody', label: 'Message', rows: 2 },
  ],
  whatsapp: () => [
    { type: 'text', key: 'waNumber', label: 'Numéro (format international)', placeholder: '+352 621 123 456' },
    { type: 'textarea', key: 'waBody', label: 'Message pré-rempli', rows: 2 },
  ],
  geo: () => [
    { type: 'text', key: 'geoLat', label: 'Latitude', placeholder: '49.6116' },
    { type: 'text', key: 'geoLon', label: 'Longitude', placeholder: '6.1319' },
  ],
};

/* ---------- Module ---------- */

export default {
  id: 'qr',
  label: 'QR utilitaires',
  icon: 'qrcode',
  description: 'Wi-Fi, contact, lien, SMS, appel, e-mail, GPS ou texte : un QR code net, avec les détails écrits dessous.',

  defaults: {
    qrType: 'wifi',
    title: '',
    details: true,
    url: '',
    text: '',
    wifiSsid: '',
    wifiSecurity: 'WPA',
    wifiPassword: '',
    showPassword: true,
    wifiHidden: false,
    firstName: '',
    lastName: '',
    org: '',
    jobTitle: '',
    mobile: '',
    phone: '',
    email: '',
    website: '',
    street: '',
    zip: '',
    city: '',
    country: '',
    note: '',
    smsNumber: '',
    smsBody: '',
    telNumber: '',
    mailTo: '',
    mailSubject: '',
    mailBody: '',
    waNumber: '',
    waBody: '',
    geoLat: '',
    geoLon: '',
    ec: 'M',
    sizeMm: 40,
  },

  controls(v) {
    return [
      {
        type: 'select',
        key: 'qrType',
        label: 'Type de QR',
        refresh: true,
        options: TYPES.map(({ value, label }) => ({ value, label })),
      },
      ...(FIELDS[v.qrType] ?? FIELDS.url)(v),
      { type: 'text', key: 'title', label: 'Titre (optionnel)', placeholder: 'ex. Wi-Fi invités' },
      { type: 'switch', key: 'details', label: 'Écrire les détails sous le code' },
      {
        type: 'slider',
        key: 'sizeMm',
        label: 'Taille du code (mm)',
        hint: 'Un code dense sera plus grand que demandé : un module fait au moins 3 points.',
        min: 20,
        max: 46,
        step: 1,
      },
      {
        type: 'select',
        key: 'ec',
        label: 'Correction d’erreur',
        hint: 'Plus de correction lit mieux un papier abîmé, mais le code est plus dense. M convient au papier thermique.',
        options: EC_LEVELS,
      },
    ];
  },

  build(v) {
    const type = typeOf(v.qrType);
    const blocks = [text(type.label, TYPE.section), space(10)];
    if (v.title.trim()) blocks.push(text(v.title.trim(), { ...TYPE.title, size: 32, align: 'center' }), space(10));

    let payload;
    try {
      payload = buildPayload(v);
    } catch (err) {
      return [...blocks, text(err instanceof QrError ? err.message : String(err), TYPE.caption)];
    }
    if (!payload.data) return [...blocks, text('Remplis le formulaire pour générer le code.', { ...TYPE.caption, align: 'center' })];

    let matrix;
    try {
      matrix = qrMatrix(payload.data, v.ec);
    } catch (err) {
      return [...blocks, text(err instanceof QrError ? err.message : String(err), TYPE.caption)];
    }

    // Largest integer module that matches the requested size, never under 3 dots, never wider than the paper.
    const cells = matrix.size + QUIET * 2;
    const wanted = Math.floor(mmToDots(Number(v.sizeMm) || 40) / cells);
    const module = Math.max(1, Math.min(Math.max(wanted, MIN_MODULE), Math.floor(PRINT_WIDTH / cells)));
    const side = cells * module;

    blocks.push(
      draw(
        side,
        (ctx, width) => {
          const x0 = Math.round((width - side) / 2) + QUIET * module;
          const y0 = QUIET * module;
          ctx.fillStyle = '#000';
          for (let r = 0; r < matrix.size; r++) {
            for (let c = 0; c < matrix.size; c++) {
              if (matrix.isDark(r, c)) ctx.fillRect(x0 + c * module, y0 + r * module, module, module);
            }
          }
        },
        { mode: 'threshold' },
      ),
    );

    if (module < MIN_MODULE) {
      blocks.push(text(`Code très dense : modules de ${module} point${module > 1 ? 's' : ''}, il risque de ne pas se scanner. Raccourcis le contenu.`, TYPE.caption));
    } else if (v.details && payload.lines.length) {
      blocks.push(space(6));
      payload.lines.forEach((line, i) => blocks.push(text(line, { ...(i === 0 && v.qrType === 'vcard' ? TYPE.strong : TYPE.caption), align: 'center' })));
    }
    blocks.push(space(6), text(`${dotsToMm(side).toFixed(0)} mm · correction ${v.ec}`, { ...TYPE.caption, align: 'center' }));
    return blocks;
  },
};
