import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractRaw } from '../src/vinted/extract.js';
import { cleanTitle, findComplement, findDimensions, findWeight, mapEtat, normalize } from '../src/vinted/normalize.js';
import { isVintedHost, parseUrl } from '../src/vinted/parse-url.js';

const fixture = (n) => readFileSync(new URL(`../fixtures/${n}.html`, import.meta.url), 'utf8');

test('parseUrl: domains, slug, query, bare path', () => {
  for (const u of [
    'https://www.vinted.com/items/10528895986-valise-horizn',
    'https://www.vinted.fr/items/10528895986',
    'https://www.vinted.lu/items/10528895986-x?referrer=catalog',
    'vinted.be/items/10528895986-x#frag',
    'https://www.vinted.co.uk/items/10528895986',
    '/items/10528895986',
  ]) {
    const p = parseUrl(u);
    assert.equal(p.id, '10528895986', u);
    assert.equal(p.ref, '5986');
    assert.equal(p.url, 'https://vinted.com/items/10528895986');
  }
  assert.equal(parseUrl('/items/10528895986').host, null);
  assert.equal(parseUrl('https://www.vinted.lu/items/1234567').host, 'www.vinted.lu');
  assert.equal(parseUrl('https://example.com/items/123456').host, null);
  assert.equal(parseUrl('https://www.vinted.com/member/42'), null);
  assert.equal(isVintedHost('evil.com'), false);
  assert.equal(isVintedHost('vinted.com.evil.com'), false);
});

test('valise fixture', () => {
  const l = normalize(extractRaw(fixture('valise')), parseUrl('https://www.vinted.com/items/10528895986-x'));
  assert.equal(l.ref, '5986');
  assert.equal(l.etat, 'neuf_etiquette');
  assert.ok(l.attributs.includes('Horizn Studios'));
  assert.ok(l.attributs.some((a) => /blue/i.test(a)), 'colour');
  assert.equal(l.dimensions, '64 × 46 × 24 cm');
  assert.equal(l.poids, '3,9 kg');
  assert.match(l.complement, /^\+ housse/);
  assert.ok(!/neuve|étiquette/i.test(l.titre), l.titre);
});

test('memento fixture', () => {
  const l = normalize(extractRaw(fixture('memento')), parseUrl('https://www.vinted.com/items/9887097882-x'));
  assert.equal(l.ref, '7882');
  assert.equal(l.etat, 'satisfaisant');
  assert.ok(l.attributs.some((a) => /GEYER/.test(a)), 'author');
  assert.equal(l.complement, 'ISBN 9782212124576');
  assert.ok(l.attributs.length <= 4);
});

test('clothing item (Brand / Size / Colour) from API-shaped JSON', () => {
  const raw = extractRaw(
    JSON.stringify({ item: { id: 1234567, title: 'Robe Zara !!! 😍 très bon état', description: 'Poids 450 g', brand_title: 'Zara', size_title: 'M', color1: 'Noir', status: 'Très bon état' } }),
  );
  const l = normalize(raw, parseUrl('/items/1234567'));
  assert.deepEqual(l.attributs, ['Zara', 'M', 'Noir']);
  assert.equal(l.etat, 'tres_bon');
  assert.equal(l.titre, 'Robe Zara'); // the brand is only moved out of the title when 2+ words remain
  assert.equal(l.poids, '450 g');
});

test('état mapping across languages', () => {
  assert.equal(mapEtat('New with tags'), 'neuf_etiquette');
  assert.equal(mapEtat('Neuf sans étiquette'), 'neuf');
  assert.equal(mapEtat('Very good'), 'tres_bon');
  assert.equal(mapEtat('Très bon état'), 'tres_bon');
  assert.equal(mapEtat('Good'), 'bon');
  assert.equal(mapEtat('Bon état'), 'bon');
  assert.equal(mapEtat('Satisfactory'), 'satisfaisant');
  assert.equal(mapEtat('Satisfaisant'), 'satisfaisant');
  assert.equal(mapEtat('???'), null);
});

test('extractors', () => {
  assert.equal(findDimensions('Taille 64 x 46 x 24 cm.'), '64 × 46 × 24 cm');
  assert.equal(findDimensions('61 L'), undefined);
  assert.equal(findWeight('colis de 3,9 kg'), '3,9 kg');
  assert.equal(findWeight('rien'), undefined);
  assert.equal(findComplement('Inclus : housse, câble.'), '+ housse, câble');
  assert.equal(findComplement('ISBN: 978-2-212-12457-6'), 'ISBN 9782212124576');
  assert.equal(findComplement('rien'), undefined);
  assert.equal(cleanTitle('Veste !!! neuve avec étiquettes + sac').title, 'Veste');
});

test('overflow shapes survive normalisation', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ code: `a${i}`, title: `T${i}`, value: `Valeur ${i}` }));
  const l = normalize({ title: 'x '.repeat(120).trim(), description: '', attributes: many }, parseUrl('/items/1234567'));
  assert.equal(l.attributs.length, 4);
  const none = normalize({ title: 'Seul', description: '', attributes: [] }, parseUrl('/items/1234567'));
  assert.deepEqual(none.attributs, []);
});

test('unrecognised input is an error, not a crash', () => {
  assert.throws(() => extractRaw('<html><body>captcha</body></html>'));
  assert.throws(() => extractRaw('{bad json'));
  assert.throws(() => extractRaw(''));
});
