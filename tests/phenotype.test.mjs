import assert from 'node:assert/strict';
import { appearanceFor, coatSvg, PHENOTYPE_VERSION } from '../assets/phenotype.js';

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS phenotype: ${name}`); };

const horse = (id, lineage = 'L3') => ({ id, lineage, genotype: {} });

test('same public horse always gets the same appearance', () => {
  const a = appearanceFor(horse('h1001'));
  const b = appearanceFor(horse('h1001'));
  assert.deepEqual(a, b);
  assert.equal(a.version, PHENOTYPE_VERSION);
  assert.ok(Number.isInteger(a.seed));
});
test('appearance ignores hidden genotype and unrelated fields', () => {
  const a = appearanceFor({ ...horse('h1001'), genotype: { speed0: [0, 0] }, wins: 9 });
  const b = appearanceFor({ ...horse('h1001'), genotype: { speed0: [3, 3] }, wins: 0 });
  assert.deepEqual(a, b);
});
test('different horses get distinct visual seeds and therefore individual looks', () => {
  const seeds = new Set(Array.from({ length: 200 }, (_, i) => appearanceFor(horse(`h${i}`)).seed));
  assert.equal(seeds.size, 200);
});
test('all coats, face marks and zero-to-four socks are reachable', () => {
  const all = Array.from({ length: 2000 }, (_, i) => appearanceFor(horse(`h${i}`)));
  assert.equal(new Set(all.map((a) => a.coat)).size, 8);
  assert.deepEqual([...new Set(all.map((a) => a.blaze))].sort(), ['blaze', 'plain', 'star', 'stripe']);
  assert.deepEqual([...new Set(all.map((a) => a.sockCount))].sort(), [0, 1, 2, 3, 4]);
});
test('sock mask, leg list and human label agree', () => {
  for (let i = 0; i < 500; i += 1) {
    const a = appearanceFor(horse(`h${i}`));
    assert.equal(a.sockLegs.length, a.sockCount);
    assert.equal(new Set(a.sockLegs).size, a.sockCount);
    assert.ok(a.label.includes(a.coatName));
  }
});
test('colors are safe hex and markup is escaped/serializable', () => {
  const a = appearanceFor(horse('"><script>alert(1)</script>'));
  assert.match(a.bodyColor, /^#[0-9a-f]{6}$/);
  assert.match(a.maneColor, /^#[0-9a-f]{6}$/);
  const svg = coatSvg(a);
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(!svg.includes('<script'));
  assert.ok(!svg.includes('alert(1)')); // the id never enters rendered markup
  assert.match(svg, /aria-label="[^"<>&]+"/);
});
test('the badge reflects coat and socks without leaking genotype', () => {
  const a = appearanceFor(horse('h77'));
  const svg = coatSvg(a);
  assert.ok(svg.includes(a.bodyColor));
  assert.equal((svg.match(/<rect x="\d+" y="67"/g) ?? []).length, a.sockCount);
});
console.log(`${passed} phenotype cases passed.`);
