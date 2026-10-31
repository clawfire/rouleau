/**
 * L'oracle: a ticket that answers. Magic 8-ball, tarot (major arcana), dice, fortune cookie.
 * The draw is seeded: the preview and the print show the same answer until you press "Tirer".
 */
import { row, rule, space, text } from '../engine/blocks.js';
import { prng, shuffle } from '../engine/rng.js';
import { TYPE } from '../fonts.js';
import { FONTS as DRAW_FONTS, ball, card, cookie, dice } from './oracle-draw.js';

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const int = (rand, min, max) => min + Math.floor(rand() * (max - min + 1));

/* ---------- Content ---------- */

const BALL = [
  ['yes', "C'est certain."], ['yes', 'Sans aucun doute.'], ['yes', 'Oui, absolument.'], ['yes', 'Tu peux compter dessus.'],
  ['yes', 'Très probablement.'], ['yes', 'Les signes disent oui.'], ['yes', 'Oui.'], ['yes', 'Plutôt bon signe.'],
  ['maybe', 'Redemande plus tard.'], ['maybe', 'Mieux vaut ne pas te le dire maintenant.'], ['maybe', 'Concentre-toi et redemande.'], ['maybe', 'Impossible à prédire maintenant.'],
  ['no', 'Ne compte pas dessus.'], ['no', 'Ma réponse est non.'], ['no', 'Mes sources disent non.'], ['no', 'Très douteux.'], ['no', 'Les signes disent non.'],
];

/** [numeral, name, upright, reversed] */
const ARCANA = [
  ['0', 'Le Mat', 'élan, liberté, saut dans le vide', 'imprudence, dispersion'],
  ['I', 'Le Bateleur', 'initiative, talent, début', 'manipulation, doute'],
  ['II', 'La Papesse', 'intuition, secret, patience', 'silence pesant, repli'],
  ['III', "L'Impératrice", 'création, douceur, abondance', 'excès, dépendance'],
  ['IV', "L'Empereur", 'structure, autorité, stabilité', 'rigidité, tyrannie'],
  ['V', 'Le Pape', 'tradition, conseil, transmission', 'dogme, conformisme'],
  ['VI', "L'Amoureux", 'choix, attirance, alliance', 'hésitation, désaccord'],
  ['VII', 'Le Chariot', 'victoire, maîtrise, mouvement', 'perte de contrôle, conflit'],
  ['VIII', 'La Justice', 'équilibre, vérité, décision', 'injustice, déséquilibre'],
  ['IX', "L'Ermite", 'sagesse, recul, quête', 'isolement, fuite'],
  ['X', 'La Roue de Fortune', 'cycle, chance, tournant', 'malchance, résistance au changement'],
  ['XI', 'La Force', 'courage, douceur, maîtrise de soi', 'doute de soi, colère'],
  ['XII', 'Le Pendu', 'lâcher-prise, nouveau regard, pause', 'sacrifice vain, blocage'],
  ['XIII', 'La Mort', 'fin, transformation, renouveau', 'peur du changement, stagnation'],
  ['XIV', 'Tempérance', 'harmonie, mesure, patience', 'excès, déséquilibre'],
  ['XV', 'Le Diable', 'attachement, tentation, matière', 'libération, prise de conscience'],
  ['XVI', 'La Maison Dieu', 'bouleversement, révélation, chute', 'catastrophe évitée, déni'],
  ['XVII', "L'Étoile", 'espoir, inspiration, sérénité', 'découragement, perte de foi'],
  ['XVIII', 'La Lune', 'illusion, rêve, inconscient', 'confusion qui se dissipe, peur'],
  ['XIX', 'Le Soleil', 'joie, réussite, clarté', 'bonheur retardé, vanité'],
  ['XX', 'Le Jugement', 'appel, réveil, bilan', 'remise en question, remords'],
  ['XXI', 'Le Monde', 'accomplissement, harmonie, voyage', 'inachevé, retard'],
];

const POSITIONS = ['Passé', 'Présent', 'Avenir'];

const FORTUNES = [
  'Le meilleur moment pour commencer était hier. Le deuxième est maintenant.',
  'Quelqu’un pense à toi en ce moment. Probablement ton imprimante.',
  'Aujourd’hui, un ticket changera ta vie. Ou ta liste de courses.',
  'Tu vas bientôt recevoir une bonne nouvelle. Garde ce papier comme preuve.',
  'La patience est une vertu. L’impression thermique aussi : 25 secondes.',
  'Ne cherche pas la réponse. Imprime la question.',
  'Un petit pas pour toi, un grand rouleau pour l’imprimante.',
  'Fais confiance à ton intuition, sauf pour les mots de passe.',
  'Ce soir, une surprise t’attend. Sûrement dans le frigo.',
  'Ce que tu cherches est dans la dernière poche que tu vérifieras.',
  'La chance sourit à ceux qui sauvegardent.',
  'Demain sera meilleur. Ou en tout cas, il sera demain.',
];

const MODES = [
  { value: 'ball', label: 'Boule magique' },
  { value: 'tarot', label: 'Tarot' },
  { value: 'dice', label: 'Dés' },
  { value: 'fortune', label: 'Biscuit' },
];

const FACES = [4, 6, 8, 10, 12, 20, 100];

/* ---------- Ticket ---------- */

const stamp = () => new Date().toLocaleDateString('fr-LU', { weekday: 'long', day: 'numeric', month: 'long' });
const clean = (s) => String(s ?? '').trim().replace(/[  ]/g, ' ');

const header = (v, title) => {
  const blocks = [text(title, TYPE.section), space(8), text(stamp(), { ...TYPE.caption, align: 'center' })];
  const q = clean(v.question);
  if (q) blocks.push(space(8), text(`« ${q} »`, { ...TYPE.strong, align: 'center' }));
  blocks.push(rule({ style: 'zigzag', thickness: 2 }));
  return blocks;
};

const footer = () => [space(8), rule({ style: 'zigzag', thickness: 2 }), text('Imprimé avec Rouleau', { ...TYPE.caption, align: 'center' })];

const BUILD = {
  ball(v, rand) {
    const [kind, answer] = pick(rand, BALL);
    const mood = { yes: 'Oui', maybe: 'Peut-être', no: 'Non' }[kind];
    return [
      ...header(v, 'Boule magique'),
      space(6),
      ball(mood, answer),
      ...footer(),
    ];
  },

  tarot(v, rand) {
    const three = v.cards === '3';
    const drawn = shuffle(rand, ARCANA.map((_, i) => i)).slice(0, three ? 3 : 1);
    const blocks = header(v, three ? 'Tirage en 3 cartes' : 'Une carte');
    drawn.forEach((index, i) => {
      const [numeral, name, up, down] = ARCANA[index];
      const reversed = rand() < 0.5;
      blocks.push(space(10));
      if (three) blocks.push(text(POSITIONS[i], { ...TYPE.caption, align: 'center' }), space(4));
      blocks.push(
        card({ numeral, name, index }, reversed, three ? { w: 200, h: 300 } : { w: 250, h: 400 }),
        space(4),
        text(reversed ? 'renversée' : 'à l’endroit', { ...TYPE.caption, align: 'center' }),
        text(reversed ? down : up, { ...TYPE.body, align: 'center' }),
      );
      if (i < drawn.length - 1) blocks.push(space(6), rule({ style: 'dashed', thickness: 2, margin: 4 }));
    });
    return [...blocks, ...footer()];
  },

  dice(v, rand) {
    const faces = Number(v.faces) || 6;
    const count = Math.max(1, Math.min(8, Number(v.diceCount) || 2));
    const rolls = Array.from({ length: count }, () => int(rand, 1, faces));
    const total = rolls.reduce((a, b) => a + b, 0);
    const blocks = [
      ...header(v, `${count} × d${faces}`),
      space(6),
      dice(rolls, faces),
    ];
    if (count > 1) blocks.push(space(10), row('Total', String(total), { ...TYPE.strong, size: 28 }));
    return [...blocks, ...footer()];
  },

  fortune(v, rand) {
    const numbers = [];
    while (numbers.length < 6) {
      const n = int(rand, 1, 49);
      if (!numbers.includes(n)) numbers.push(n);
    }
    numbers.sort((a, b) => a - b);
    return [
      ...header(v, 'Biscuit'),
      space(6),
      cookie(pick(rand, FORTUNES), numbers),
      ...footer(),
    ];
  },
};

export default {
  id: 'oracle',
  label: "L'oracle",
  icon: 'hat-wizard',
  description: 'Pose une question : boule magique, tarot, dés ou biscuit. Le tirage ne bouge pas tant que tu ne rappuies pas sur « Tirer ».',

  defaults: {
    mode: 'ball',
    question: '',
    cards: '1',
    faces: '6',
    diceCount: 2,
    seed: Math.floor(Math.random() * 2 ** 31),
  },

  controls(v) {
    const schema = [
      { type: 'radio', key: 'mode', label: 'Oracle', refresh: true, options: MODES },
      { type: 'text', key: 'question', label: 'Ta question (optionnel)', placeholder: 'Est-ce que je prends un autre café ?' },
    ];
    if (v.mode === 'tarot') {
      schema.push({
        type: 'radio',
        key: 'cards',
        label: 'Tirage',
        options: [
          { value: '1', label: 'Une carte' },
          { value: '3', label: 'Passé · Présent · Avenir' },
        ],
      });
    }
    if (v.mode === 'dice') {
      schema.push(
        { type: 'slider', key: 'diceCount', label: 'Nombre de dés', min: 1, max: 8, step: 1 },
        { type: 'select', key: 'faces', label: 'Faces', options: FACES.map((f) => ({ value: String(f), label: `d${f}` })) },
      );
    }
    schema.push({
      type: 'button',
      label: 'Tirer à nouveau',
      variant: 'brand',
      refresh: false,
      onClick: (values) => (values.seed = Math.floor(Math.random() * 2 ** 31)),
    });
    return schema;
  },

  async build(v) {
    await Promise.all(DRAW_FONTS.map((f) => document.fonts.load(f, 'AaÉé09').catch(() => null)));
    const rand = prng(v.seed);
    return (BUILD[v.mode] ?? BUILD.ball)(v, rand);
  },
};
