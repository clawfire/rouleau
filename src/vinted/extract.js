/**
 * Raw Vinted data → a neutral "raw item". Pure (no DOM, no network): it takes HTML or JSON as text, so it
 * works the same on a page fetched by the server, on a page pasted by hand, or on what a future browser
 * extension reads straight from the tab (which sidesteps the anti-bot).
 *
 * Raw item: { id?, title, description, brand?, conditionText?, itemCondition?, attributes: [{ code, title, value }] }
 */

const decodeEntities = (s) =>
  String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** The JSON text of the array that starts at `text[start] === '['`, respecting strings. */
function sliceArray(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** schema.org Product from the page's JSON-LD, if any. */
function jsonLdProduct(html) {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const list = Array.isArray(data) ? data : data['@graph'] ?? [data];
      const product = list.find((d) => d?.['@type'] === 'Product');
      if (product) return product;
    } catch {
      // Not valid JSON: try the next block.
    }
  }
  return null;
}

/** The attribute list the front end shows (Brand, Size, Condition, Colour, Author…), from the Next.js payload. */
function nextAttributes(html) {
  const chunks = [];
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      chunks.push(JSON.parse(m[1]));
    } catch {
      // Skip a chunk that does not decode.
    }
  }
  const blob = chunks.join('');
  const at = blob.search(/"attributes":\[\{"code":/);
  if (at < 0) return [];
  const json = sliceArray(blob, blob.indexOf('[', at));
  if (!json) return [];
  try {
    return JSON.parse(json)
      .map((a) => ({ code: a.code, title: a.data?.title ?? '', value: String(a.data?.value ?? '').trim() }))
      .filter((a) => a.value);
  } catch {
    return [];
  }
}

function fromHtml(html) {
  const ld = jsonLdProduct(html);
  const attributes = nextAttributes(html);
  const meta = (name) => html.match(new RegExp(`<meta[^>]+(?:property|name)="${name}"[^>]+content="([^"]*)"`, 'i'))?.[1];
  const title = ld?.name ?? decodeEntities(meta('og:title') ?? html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').replace(/\s*\|\s*Vinted\s*$/i, '');
  const url = ld?.offers?.url ?? meta('og:url') ?? '';
  const brand = ld?.brand?.name;
  const hasBrand = attributes.some((a) => a.code === 'brand');
  return {
    id: url.match(/\/items\/(\d+)/)?.[1],
    title: String(title ?? '').trim(),
    description: String(ld?.description ?? decodeEntities(meta('og:description') ?? '')).trim(),
    itemCondition: String(ld?.offers?.itemCondition ?? '').replace(/^.*\//, ''),
    attributes: !hasBrand && brand ? [{ code: 'brand', title: 'Brand', value: brand }, ...attributes] : attributes,
  };
}

/** Vinted's internal API (`/api/v2/items/{id}`), or a JSON blob of the same shape. */
function fromJson(data) {
  const item = data.item ?? data;
  const attributes = [];
  const add = (code, title, value) => value && attributes.push({ code, title, value: String(value).trim() });
  add('brand', 'Brand', item.brand_title ?? item.brand?.title);
  add('size', 'Size', item.size_title ?? item.size);
  add('color', 'Color', [item.color1, item.color2].filter(Boolean).join(', '));
  add('material', 'Material', item.material);
  add('author', 'Author', item.author);
  add('isbn', 'ISBN', item.isbn);
  for (const a of item.item_attributes ?? []) add(a.code, a.title ?? a.code, a.value ?? a.values?.join(', '));
  return {
    id: item.id ? String(item.id) : undefined,
    title: String(item.title ?? '').trim(),
    description: String(item.description ?? '').trim(),
    conditionText: typeof item.status === 'string' ? item.status : item.status?.title ?? item.condition,
    attributes,
  };
}

/**
 * HTML or JSON text → raw item. Throws a plain Error when nothing recognisable is found.
 * This is also the entry point for the "paste raw HTML / JSON" box.
 */
export function extractRaw(input) {
  const text = String(input ?? '').trim();
  if (!text) throw new Error('Rien à analyser.');
  let raw;
  if (/^[[{]/.test(text)) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('JSON illisible.');
    }
    raw = fromJson(Array.isArray(data) ? data[0] ?? {} : data);
  } else {
    raw = fromHtml(text);
  }
  if (!raw.title && !raw.attributes.length) throw new Error('Aucune annonce Vinted reconnue dans ces données.');
  return raw;
}
