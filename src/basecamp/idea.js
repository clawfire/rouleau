/**
 * A Basecamp card → an improvement idea. Pure (no DOM), so it runs in the tests.
 *
 * The board's cards follow a light template, one "Label: value" per line:
 *   Title / Area / Problem it solves / Rough effort / Expected impact / Anything I'd flag
 * Labels may be bold or not, in English or French, with or without the colon inside the <strong>.
 * Lines that match no label are kept as `notes`, so a free-form card still prints.
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', mdash: '—', ndash: '–' };

/** Basecamp rich text → plain lines. */
export function htmlToLines(html) {
  return String(html ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(div|p|li|h\d|blockquote|pre)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .split('\n')
    .map((l) => l.replace(/[\s ]+/g, ' ').trim())
    .filter(Boolean);
}

/** Field → the labels people write for it (lowercase, without the colon). */
const LABELS = {
  title: ['title', 'titre'],
  area: ['area', 'domaine', 'zone', 'scope'],
  problem: ['problem it solves', 'problem', 'problème', 'probleme', 'problème résolu'],
  effort: ['rough effort', 'effort', 'estimated effort'],
  impact: ['expected impact', 'impact', 'impact attendu'],
  flag: ["anything i'd flag", 'anything i’d flag', 'anything to flag', 'flag', 'flags', 'risks', 'risques', 'à surveiller'],
};

const LABEL_OF = new Map(Object.entries(LABELS).flatMap(([field, names]) => names.map((n) => [n, field])));

/** "Problem it solves: x" → ['problem', 'x']; anything else → null. */
function splitLabel(line) {
  const m = line.match(/^([^:]{2,40}?)\s*:\s*(.*)$/);
  if (!m) return null;
  const field = LABEL_OF.get(m[1].toLowerCase().replace(/\s+/g, ' ').trim());
  return field ? [field, m[2].trim()] : null;
}

/** Fields from the card body. A line without a label continues the previous field. */
export function parseFields(html) {
  const out = { notes: [] };
  let current = null;
  for (const line of htmlToLines(html)) {
    const hit = splitLabel(line);
    if (hit) {
      [current] = hit;
      out[current] = out[current] ? `${out[current]} ${hit[1]}`.trim() : hit[1];
    } else if (current) {
      out[current] = `${out[current]} ${line}`.trim();
    } else {
      out.notes.push(line);
    }
  }
  return out;
}

/**
 * "Small", "Medium", "M", "High", "2 days"… → 1 (small) to 3 (large), or 0 when unknown.
 * Only the first word decides: "Medium to high" stays medium.
 */
export function effortLevel(raw) {
  const s = String(raw ?? '').toLowerCase().trim();
  if (!s) return 0;
  // A word ends where letters stop (\b does not see accented letters).
  if (/^(xs|s|low|small|tiny|quick|easy|faible|petit|léger|leger|minor|1)(?![a-zà-ÿ])/.test(s)) return 1;
  if (/^(m|medium|mid|moderate|moyen|moyenne|average|2)(?![a-zà-ÿ])/.test(s)) return 2;
  if (/^(l|xl|high|large|big|huge|heavy|hard|élevé|eleve|élevée|gros|grand|major|3)(?![a-zà-ÿ])/.test(s)) return 3;
  return 0;
}

export const EFFORT_LABELS = ['?', 'Petit', 'Moyen', 'Gros'];

/** "Tech / Process" → ['Tech', 'Process']. */
export const areaTags = (area) =>
  String(area ?? '')
    .split(/\s*[/,|&+·]\s*|\s+and\s+|\s+et\s+/i)
    .map((t) => t.trim())
    .filter(Boolean);

/**
 * @param {object} card  a Basecamp card (GET …/cards.json item)
 * @returns {{ id, title, area, tags, problem, impact, effort, effortLevel, flag, notes, author, created, column, url, comments, boosts, completed, due }}
 */
export function toIdea(card) {
  const f = parseFields(card.content ?? card.description ?? '');
  return {
    id: card.id,
    title: String(card.title ?? f.title ?? '').trim() || 'Idée sans titre',
    longTitle: f.title && f.title !== card.title ? f.title : '',
    area: f.area ?? '',
    tags: areaTags(f.area),
    problem: f.problem ?? '',
    impact: f.impact ?? '',
    effort: f.effort ?? '',
    effortLevel: effortLevel(f.effort),
    flag: f.flag ?? '',
    notes: f.notes.join(' '),
    author: card.creator?.name ?? '',
    created: card.created_at ?? '',
    column: card.parent?.title ?? '',
    url: card.app_url ?? '',
    comments: Number(card.comments_count) || 0,
    boosts: Number(card.boosts_count) || 0,
    completed: Boolean(card.completed),
    due: card.due_on ?? '',
  };
}

/** "Bartosz Suchorski" → "Bartosz S." (a desk ticket, not a directory). */
export const shortName = (name) => {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0]}.` : parts[0] ?? '';
};

/** Cut at a word boundary, with an ellipsis. */
export function clip(s, max) {
  const t = String(s ?? '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:–—-]+$/, '')}…`;
}

/** Any Basecamp link to a card table (web or API) → its ids. */
export function parseBoardUrl(raw) {
  const m = String(raw ?? '').match(/(?:basecamp\.com|basecampapi\.com)\/(\d+)\/buckets\/(\d+)\/card_tables\/(\d+)/);
  return m ? { account: m[1], bucket: m[2], table: m[3] } : null;
}
