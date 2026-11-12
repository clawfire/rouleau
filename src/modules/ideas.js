/**
 * Improvement ideas: the cards of a Basecamp card table, printed as small desk tickets to keep them
 * in sight. One card, the idea of the day (seeded by the date, also handy in the morning ticket), or
 * a whole column with a cut line between tickets.
 *
 * Basecamp is reached through the relay (services/basecamp.js → netlify/functions/basecamp.mjs).
 * Without a connection the preview uses demo ideas.
 */
import { draw, lines, rule, space, text } from '../engine/blocks.js';
import { prng } from '../engine/rng.js';
import { TYPE } from '../fonts.js';
import { EFFORT_LABELS, areaTags, clip, effortLevel, shortName } from '../basecamp/idea.js';
import { BasecampError, clearBasecampCache, connect, disconnect, loadBoard, loadIdeas, status } from '../services/basecamp.js';
import { qrMatrix } from '../services/qr-payload.js';
import { chips, columnLabel, cutLine, effortGauge, header } from './ideas-draw.js';

const DEFAULT_BOARD = 'https://3.basecamp.com/3192265/buckets/33642311/card_tables/6374240601';
const SHORT = 170; // characters per paragraph on a short ticket

/* ---------- Demo (no connection) ---------- */

const demo = (title, area, effort, problem, impact, flag = '') => ({
  id: `demo-${title}`,
  title,
  longTitle: '',
  area,
  tags: areaTags(area),
  problem,
  impact,
  effort,
  effortLevel: effortLevel(effort),
  flag,
  notes: '',
  author: 'Camille Démo',
  created: new Date(Date.now() - 12 * 864e5).toISOString(),
  column: 'In Progress',
  url: 'https://basecamp.com',
  comments: 2,
  boosts: 3,
});

const DEMO = [
  demo(
    'Une page de statut publique (démo)',
    'Tech / Support',
    'Small',
    'Quand un service tombe, le support répond dix fois à la même question au lieu de pointer vers une page.',
    'Moins de tickets pendant les incidents, et une équipe qui communique avant qu’on lui demande.',
    'Décider qui a le droit de publier un incident.',
  ),
  demo(
    'Un starter kit pour les nouveaux projets (démo)',
    'Tech / UX',
    'Medium',
    'Chaque projet repart de zéro : thème, composants, accessibilité, CI. On perd une semaine et tout diverge.',
    'Des projets qui démarrent en un jour et qui se ressemblent.',
  ),
];

/* ---------- Picking ---------- */

/** Day number since the epoch, in local time: same idea all day, another one tomorrow. */
const dayNumber = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5);

export function pickIdeas(ideas, pick) {
  if (!ideas.length) return [];
  if (pick === 'all') return ideas;
  if (pick === 'day') {
    const rand = prng(dayNumber() * 7919);
    rand();
    return [ideas[Math.floor(rand() * ideas.length)]];
  }
  return [ideas.find((i) => String(i.id) === String(pick)) ?? ideas[0]];
}

/** The column to print when none is chosen yet: work in progress first. */
function defaultColumn(columns) {
  const by = (re) => columns.find((c) => re.test(c.title) && c.count);
  return (by(/in progress|en cours|doing/i) ?? by(/accepted|accept|approved/i) ?? columns.find((c) => c.count) ?? columns[0])?.id ?? '';
}

/* ---------- Ticket ---------- */

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-LU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

/** A small QR code to open the card (4-dot modules, about 20 mm). */
function qrBlock(url) {
  let matrix;
  try {
    matrix = qrMatrix(url, 'M');
  } catch {
    return [];
  }
  const module = 4;
  const side = (matrix.size + 4) * module;
  return [
    draw(side, (ctx, W) => {
      const x0 = Math.round((W - side) / 2) + 2 * module;
      for (let r = 0; r < matrix.size; r++) for (let c = 0; c < matrix.size; c++) if (matrix.isDark(r, c)) ctx.fillRect(x0 + c * module, 2 * module + r * module, module, module);
    }),
    text('Scanner pour ouvrir la carte', { ...TYPE.caption, align: 'center' }),
  ];
}

/** A label in mono, then the paragraph. */
const para = (label, body, full) => (body ? [space(6), text(label, TYPE.caption), text(full ? body : clip(body, SHORT), TYPE.body)] : []);

export function ideaBlocks(idea, v, { index = 0, total = 1 } = {}) {
  const full = v.detail === 'full';
  const column = v.stamp ? columnLabel(idea.column) : '';
  const blocks = [header(column, total > 1 ? `n° ${index + 1} / ${total}` : ''), space(4), text(idea.title, { ...TYPE.title, size: 30, align: 'center', lineHeight: 1.05 })];

  if (full && idea.longTitle) blocks.push(space(4), text(idea.longTitle, { ...TYPE.body, align: 'center' }));
  if (idea.tags.length) blocks.push(space(8), chips(idea.tags.map((t) => t.toUpperCase())));
  blocks.push(rule({ style: 'zigzag', thickness: 2 }));

  blocks.push(...para('LE PROBLÈME', idea.problem, full), ...para('L’IMPACT ATTENDU', idea.impact, full));
  if (!idea.problem && !idea.impact && idea.notes) blocks.push(space(6), text(full ? idea.notes : clip(idea.notes, SHORT * 2), TYPE.body));
  else if (full && idea.notes) blocks.push(...para('NOTES', idea.notes, true));

  if (idea.effort || idea.effortLevel) {
    const label = idea.effortLevel ? EFFORT_LABELS[idea.effortLevel] : clip(idea.effort, 14);
    blocks.push(space(10), effortGauge(idea.effortLevel, label));
  }

  if (idea.flag && (full || v.flag)) blocks.push(space(10), text(`À surveiller · ${full ? idea.flag : clip(idea.flag, SHORT)}`, { ...TYPE.body, frame: 3, padY: 8 }));

  if (v.nextStep) blocks.push(space(10), text('MON PROCHAIN PAS', TYPE.caption), lines(Number(v.nextLines) || 2, { gap: 38 }));

  if (v.meta) {
    const who = shortName(idea.author);
    const when = shortDate(idea.created);
    const buzz = [idea.boosts && plural(idea.boosts, 'boost', 'boosts'), idea.comments && plural(idea.comments, 'commentaire', 'commentaires')].filter(Boolean).join(' · ');
    blocks.push(rule({ style: 'dashed', thickness: 2, margin: 8 }));
    if (who) blocks.push(text(`Proposée par ${who}`, { ...TYPE.caption, align: 'center' }));
    if (when) blocks.push(text(`le ${when}`, { ...TYPE.caption, align: 'center' }));
    if (buzz) blocks.push(text(buzz, { ...TYPE.caption, align: 'center' }));
  }
  if (v.qr && idea.url) blocks.push(space(10), ...qrBlock(idea.url));
  return blocks;
}

/* ---------- Data ---------- */

/** Board, column and ideas, or the demo when not connected. */
async function source(v) {
  const s = await status();
  if (!s.connected) return { demo: true, ideas: DEMO };
  const board = await loadBoard(v.boardUrl || DEFAULT_BOARD);
  const columnId = board.columns.some((c) => c.id === v.columnId) ? v.columnId : defaultColumn(board.columns);
  const column = board.columns.find((c) => c.id === columnId);
  const ideas = column ? await loadIdeas(board.ref, column.id) : [];
  return { board, column, ideas };
}

/** ?basecamp=refused|failed after the OAuth round trip: read once, then removed from the address. */
function oauthFlag() {
  const flag = new URLSearchParams(location.search).get('basecamp');
  if (flag) history.replaceState(null, '', `${location.pathname}${location.hash}`);
  return flag;
}

/* ---------- Module ---------- */

export default {
  id: 'ideas',
  label: 'Idées d’amélioration',
  icon: 'lightbulb',
  group: 'tasks',
  description: 'Les cartes d’un tableau Basecamp en petits tickets à garder sous les yeux : le problème, l’impact, l’effort, et de quoi noter ton prochain pas.',

  defaults: {
    boardUrl: DEFAULT_BOARD,
    columnId: '',
    pick: 'day',
    detail: 'short',
    stamp: true,
    flag: true,
    nextStep: true,
    nextLines: 2,
    meta: true,
    qr: false,
  },

  async controls(v) {
    const schema = [];
    const flag = oauthFlag();
    if (flag === 'refused') schema.push({ type: 'callout', variant: 'warning', text: 'Connexion Basecamp annulée.' });
    if (flag === 'failed') schema.push({ type: 'callout', variant: 'danger', text: 'Basecamp a refusé l’échange de jetons. Vérifie l’URL de redirection de l’intégration.' });

    const s = await status();
    if (!s.relay) {
      schema.push({ type: 'callout', variant: 'warning', text: 'Pas de relais Basecamp ici : lance `npm run dev` (netlify dev) ou utilise le site Netlify. Aperçu en démo.' });
    } else if (!s.configured) {
      schema.push({ type: 'callout', variant: 'warning', text: 'Relais présent mais pas configuré : BASECAMP_CLIENT_ID et BASECAMP_CLIENT_SECRET manquent côté Netlify. Aperçu en démo.' });
    } else if (!s.connected) {
      schema.push(
        { type: 'button', label: 'Se connecter à Basecamp', variant: 'brand', onClick: () => connect() },
        { type: 'callout', variant: 'neutral', text: 'Lecture seule. Le jeton reste dans un cookie du relais, jamais dans cette page. Sans connexion, l’aperçu utilise des idées de démo.' },
        {
          type: 'callout',
          variant: 'neutral',
          text: `Basecamp répond « redirect_uri is not approved » ? L’intégration Launchpad doit déclarer exactement : ${s.redirectUri ?? '(inconnue)'}`,
        },
      );
    } else {
      schema.push(
        { type: 'callout', variant: 'success', text: `Connecté à Basecamp${s.name ? ` : ${s.name}` : ''}.` },
        {
          type: 'buttons',
          refresh: true,
          buttons: [
            { label: 'Recharger les cartes', onClick: () => clearBasecampCache() },
            { label: 'Se déconnecter', onClick: () => disconnect() },
          ],
        },
        { type: 'text', key: 'boardUrl', label: 'Tableau Basecamp', hint: 'Le lien d’un tableau de cartes (…/card_tables/…).', refresh: true },
      );
      try {
        const board = await loadBoard(v.boardUrl || DEFAULT_BOARD);
        if (!board.columns.some((c) => c.id === v.columnId)) v.columnId = defaultColumn(board.columns);
        schema.push({
          type: 'select',
          key: 'columnId',
          label: `Colonne de « ${board.title} »`,
          refresh: true,
          options: board.columns.map((c) => ({ value: c.id, label: `${c.title} (${c.count})` })),
        });
        const column = board.columns.find((c) => c.id === v.columnId);
        const ideas = column ? await loadIdeas(board.ref, column.id) : [];
        const valid = ['day', 'all', ...ideas.map((i) => String(i.id))];
        if (!valid.includes(String(v.pick))) v.pick = 'day';
        schema.push({
          type: 'select',
          key: 'pick',
          label: 'Idée',
          options: [
            { value: 'day', label: 'L’idée du jour (change chaque jour)' },
            { value: 'all', label: `Toute la colonne (${ideas.length} tickets)` },
            ...ideas.map((i) => ({ value: String(i.id), label: i.title })),
          ],
        });
      } catch (err) {
        schema.push({ type: 'callout', variant: 'danger', text: err instanceof BasecampError ? err.message : String(err) });
      }
    }

    schema.push(
      {
        type: 'radio',
        key: 'detail',
        label: 'Texte',
        options: [
          { value: 'short', label: 'Court' },
          { value: 'full', label: 'Complet' },
        ],
      },
      { type: 'switch', key: 'stamp', label: 'Tampon avec la colonne' },
      { type: 'switch', key: 'flag', label: 'Encadré « À surveiller »', hint: 'Toujours présent en texte complet.' },
      { type: 'switch', key: 'nextStep', label: 'Lignes « Mon prochain pas »', refresh: true },
    );
    if (v.nextStep) schema.push({ type: 'slider', key: 'nextLines', label: 'Lignes', min: 1, max: 5, step: 1 });
    schema.push(
      { type: 'switch', key: 'meta', label: 'Auteur, date, boosts' },
      { type: 'switch', key: 'qr', label: 'QR code vers la carte' },
    );
    return schema;
  },

  async blocks(v) {
    let data;
    try {
      data = await source(v);
    } catch (err) {
      return [text('Idées d’amélioration', TYPE.section), space(8), text(err instanceof BasecampError ? err.message : String(err), TYPE.body)];
    }
    const picked = pickIdeas(data.ideas, data.demo ? (v.pick === 'all' ? 'all' : 'day') : v.pick);
    if (!picked.length) return [header('', ''), space(8), text('Aucune carte dans cette colonne. Profites-en pour en proposer une.', { ...TYPE.body, align: 'center' })];

    const out = [];
    picked.forEach((idea, i) => {
      if (i) out.push(space(10), cutLine(), space(10));
      out.push(...ideaBlocks(idea, v, { index: data.ideas.indexOf(idea), total: v.pick === 'all' ? data.ideas.length : 1 }));
    });
    return out;
  },
};
