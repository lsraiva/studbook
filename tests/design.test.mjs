#!/usr/bin/env node
/**
 * Design checks. The look is a decision, so it gets tests like any other decision:
 * one palette, a type scale, motion that can be switched off, a tab strip that fits a phone.
 *
 *   node tests/design.test.mjs
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = await readFile(join(root, "assets/styles.css"), "utf8");
const html = await readFile(join(root, "index.html"), "utf8");

let bad = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) bad += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
};

const tokens = css.slice(css.indexOf(":root"), css.indexOf("* { box-sizing"));
const rest = css.slice(css.indexOf("* { box-sizing"));
const hexOutside = (rest.match(/#[0-9a-fA-F]{6}/g) ?? []).length;

ok("one palette, declared once", hexOutside <= 15, `${hexOutside} raw colours outside :root`);
ok("a type scale exists", /--step--1:/.test(tokens) && /--step-3:/.test(tokens) && /var\(--step-2\)/.test(rest));
ok("surface and text tokens are used", /var\(--panel\)/.test(rest) && /var\(--dim\)/.test(rest) && /--panel: var\(--ink-2\)/.test(tokens));
ok("motion is short and eased", /--dur-2: 220ms/.test(tokens) && /--ease: cubic-bezier/.test(tokens));
ok("reduced motion switches animation off", /@media \(prefers-reduced-motion: reduce\)/.test(css) && /animation-duration: 0\.001ms !important/.test(css));
ok("the tab strip becomes a sticky scroller on a phone", /@media \(max-width: 620px\)[\s\S]*?\.tabs \{[\s\S]*?position: sticky/.test(css));
ok("touch targets are at least 44px on a phone", /min-height: 44px/.test(css));
const token = (name) => (tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`)) ?? [])[1];
const lum = (hex) => {
  const [r, g, b] = hex.match(/[0-9a-fA-F]{2}/g).map((h) => parseInt(h, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const pairs = [
  ["fg", "ink-0", 4.5],
  ["muted", "ink-2", 4.5],
  ["muted", "ink-0", 4.5],
  ["dim", "ink-2", 4.5],
  ["brass", "ink-2", 3],
];
for (const [text, surface, floor] of pairs) {
  const value = ratio(token(text) ?? "#000000", token(surface) ?? "#ffffff");
  ok(`${text} on ${surface} clears ${floor}:1`, value >= floor, `${value.toFixed(1)}:1`);
}

ok("focus is visible", /:focus-visible \{ outline: var\(--ring\)/.test(css) || /outline: var\(--ring\)/.test(css));
ok("the account gate is styled", /\.gate-card \{/.test(css) && /\.gate-error \{/.test(css));
ok("braces balance", (css.match(/\{/g) ?? []).length === (css.match(/\}/g) ?? []).length, `${(css.match(/\{/g) ?? []).length} open`);

ok("the page has no inline style or script", !/<style[\s>]/.test(html) && !/<script(?![^>]*src=)[^>]*>[\s\S]*?[a-zA-Z]{3}/.test(html));
ok("the page loads one stylesheet and one module", (html.match(/rel="stylesheet"/g) ?? []).length === 1 && /<script type="module" src="assets\/ui\.js(?:\?[^"]*)?">/.test(html));

console.log(bad ? `\n${bad} failing` : "\nall green");
process.exit(bad ? 1 : 0);
