# Fiche colis Vinted

Paste a Vinted listing URL, check the fields, print a 384 px label (design C « Ticket d'archive ») on the T02.

```
URL → parseUrl → fetch (server) → extractRaw → normalize → LabelData → colis-draw → 1-bit 384 px → T02
```

- `src/vinted/parse-url.js` — ID from `/items/(\d+)`, any Vinted domain, canonical QR URL, 4-digit reference.
- `src/vinted/fetch-core.js` — server-side fetch, shared by `netlify/functions/vinted.mjs` (`/api/vinted`) and the Vite dev middleware.
- `src/vinted/extract.js` — HTML or JSON text → raw item. Pure, so it also takes pasted HTML/JSON: that is the **raw import entry point** for a future Chrome extension or bookmarklet (it reads the page in the user's browser, which sidesteps the anti-bot).
- `src/vinted/normalize.js` — raw item → `LabelData` (title, état, attributes, complement, weight, dimensions).
- `src/vinted/adapter.js` — adapter per source (`vinted` now, `ebay` later) + local cache by ID (30 listings).
- `src/modules/colis-draw.js` — the renderer. `src/modules/colis.js` — form and import widget.

## Fetch strategy (what actually works)

Checked on 2026-11-01 with the two fixtures, from a plain Node `fetch` with a Safari User-Agent and no cookies:

1. **Page HTML works** (HTTP 200, ~1.5 MB) on `vinted.com` and `vinted.fr`. Two sources inside it:
   - JSON-LD `schema.org/Product`: name, description, brand, offers.
   - the Next.js payload (`self.__next_f.push`): the `"attributes":[{code,data:{title,value}}…]` array the page displays (brand, material, colour, condition, author, ISBN…).
2. **Internal API** `/api/v2/items/{id}` with the home page's cookies: implemented as a fallback, **not exercised** (the page route was enough). Its format may change.
3. **Manual**: when both fail the form opens with the ID, reference and QR already set. Printing never depends on the import.

Language follows the domain (`vinted.com` → English, `.fr` → French): the condition mapping handles en, fr, de, nl, es, it, pl. Constraints: personal use, one request at a time, 5 s timeout, no crawling. The anti-bot may block a given IP (Netlify's included); the error says so and points to the paste box.

## État mapping

| Vinted | `etat` | Printed |
|---|---|---|
| New with tags / Neuf avec étiquette | `neuf_etiquette` | Neuf avec étiquette |
| New without tags / Neuf sans étiquette | `neuf` | Neuf sans étiquette |
| Very good / Très bon état | `tres_bon` | Très bon état |
| Good / Bon état | `bon` | Bon état |
| Satisfactory / Satisfaisant | `satisfaisant` | Satisfaisant |

The page's `status` attribute carries the text (its `id` is the same `50` for every condition, so it is not used).

## Normalisation choices

- Attributes: Vinted's own list, minus condition, upload date, price, shipping, location, ISBN and book title; deduplicated; first 4 kept; values only.
- A value already in the title is dropped, **except the brand**, which is moved out of the title into the attributes (keeps `Horizn Studios` among the attributes, as the spec's test expects).
- Title: état phrases, `!!!`, emojis and a trailing `+ extras` removed. The extras become the complement when the description has no better line.
- Complement: an `Inclus : …` / `Livré avec : …` line, else an ISBN. Weight and dimensions: simple regexes on the description.

## Label notes

- Text sizes follow the label spec (≥ 11 px bold, ≥ 13 px body), an **exception to the 18 px minimum** of AGENTS.md: the design was validated on paper at these sizes.
- Per the spec there is no cut line and no buyer zone (the PNG mock-up shows both); the label ends after the grid and the QR. Empty POIDS / COLIS / DIMENSIONS print `____` to fill in with a pen.
- The attributes and the état flow over up to 3 lines, by whole values. The état comes last in bold and is never cut: attributes are dropped from the end only if 3 lines are not enough.
- Threshold only (never dithered), adjustable with the « Seuil noir / blanc » slider.

## Tests

`npm test` (Node's built-in runner) runs `tests/vinted.test.js` against `fixtures/valise.html` and `fixtures/memento.html`, saved from the real listings.

## Known limits

- Listings of another language than the supported ones get no état (the field stays editable).
- Weight and parcel size are rarely public: they are usually typed by hand.
- eBay is not implemented (the adapter shape is ready for it).
