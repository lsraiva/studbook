#!/usr/bin/env node
/** Coat portraits: the pure pixel remap (the canvas part is covered by the browser spec). */
import assert from "node:assert/strict";
import { remapPixels, findAnchors } from "../assets/coat-portrait.js";

let n = 0;
const test = (label, fn) => { fn(); n += 1; console.log(`PASS ${label}`); };
const px = (...rgba) => new Uint8ClampedArray(rgba);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const GREY = ["#a9a9a2", "#e2ded4"], BLACK = ["#332e2a", "#1a1816"], CHESTNUT = ["#8f4b2b", "#a9603a"];

test("transparent pixels stay transparent and alpha is kept", () => {
  const out = remapPixels(px(120, 60, 30, 0, 120, 60, 30, 128), ...GREY);
  assert.equal(out[3], 0);
  assert.equal(out[7], 128);
});
test("a bay midtone becomes the coat's own colour family", () => {
  const mid = px(150, 85, 45, 255); // a typical lit bay pixel
  const grey = remapPixels(mid, ...GREY), black = remapPixels(mid, ...BLACK);
  const g = [grey[0], grey[1], grey[2]], b = [black[0], black[1], black[2]];
  assert.ok(Math.abs(g[0] - g[2]) < 25, `grey stays neutral: ${g}`);
  assert.ok(b[0] + b[1] + b[2] < g[0] + g[1] + g[2], "black is darker than grey");
});
test("dark unsaturated hair takes the mane colour, not the coat", () => {
  const hair = px(30, 26, 24, 255);
  const out = remapPixels(hair, ...GREY);
  assert.ok(dist([out[0], out[1], out[2]], [226, 222, 212]) < dist([out[0], out[1], out[2]], [8, 6, 5]), `light mane on a grey: ${[...out]}`);
});
test("highlights stay bright on every coat", () => {
  for (const coat of [GREY, BLACK, CHESTNUT]) {
    const out = remapPixels(px(250, 245, 240, 255), ...coat);
    assert.ok(out[0] + out[1] + out[2] > 600, `${coat[0]}: ${[...out]}`);
  }
});
test("the output has the same length and never NaN", () => {
  const data = new Uint8ClampedArray(4 * 64).map((_, i) => (i * 37) % 256);
  const out = remapPixels(data, ...CHESTNUT);
  assert.equal(out.length, data.length);
  assert.ok([...out].every(Number.isFinite));
});
test("anchors are read from the mask: nose, ground and four legs", () => {
  // a 100x60 stick horse facing left: head block at top-left, body, four legs to the ground
  const w = 100, h = 60, a = new Uint8ClampedArray(w * h);
  const fill = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) a[y * w + x] = 255; };
  fill(10, 2, 22, 18);   // head, nose reaching x=10
  fill(20, 12, 85, 34);  // body
  for (const x of [26, 36, 66, 76]) fill(x, 35, x + 3, 57); // legs down to y=57
  const anchors = findAnchors(a, w, h);
  assert.equal(anchors.noseX, 10);
  assert.equal(anchors.ground, 57);
  assert.equal(anchors.top, 2);
  assert.equal(anchors.legs.length, 4);
  assert.deepEqual(anchors.legs.map((l) => Math.round(l.cx)), [28, 38, 68, 78]);
});
test("an empty mask has no anchors", () => {
  assert.equal(findAnchors(new Uint8ClampedArray(400), 20, 20), null);
});
console.log(`${n} coat portrait cases passed.`);
