/**
 * Micro-interactions: the small motions that make the stable feel answered.
 *
 *  - bank(): the balance rolls to its new value, the pill glows green or red, a "+₲ 120" chip
 *    floats off it, and on a real gain gold coins arc from where the player last clicked.
 *  - press feedback: a soft ripple from the exact point of every button press.
 *  - tabs: a brass indicator slides to the current tab.
 *  - eliteStamp(): a stamped toast when a horse rises into the elite.
 *
 * Built so the page's i18n sweep (a MutationObserver on text) is not woken on every frame: the
 * rolling digits come from a data attribute shown through CSS, and the coins share one canvas.
 * The real number is always in the DOM text, for screen readers and tests alike.
 * Reduced motion: values change at once, no coins, no ripples.
 */

const REDUCED = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

/* ------------------------------------------------------------------ last press point */

let lastPress = null;
document.addEventListener(
  "pointerdown",
  (event) => {
    lastPress = { x: event.clientX, y: event.clientY, at: performance.now() };
    const button = event.target.closest?.("button, .button, .tab");
    if (!button || REDUCED || button.disabled || button.classList.contains("gcard")) return;
    const r = button.getBoundingClientRect();
    button.style.setProperty("--rx", `${event.clientX - r.left}px`);
    button.style.setProperty("--ry", `${event.clientY - r.top}px`);
    button.classList.remove("rippling");
    void button.offsetWidth; // restart the animation on a quick second press
    button.classList.add("rippling");
    setTimeout(() => button.classList.remove("rippling"), 600);
  },
  { capture: true, passive: true },
);

/* ------------------------------------------------------------------ sound */

let audio = null;
function clink(gain, soundOn) {
  if (!soundOn) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const now = audio.currentTime;
    const notes = gain >= 500 ? [1568, 2093, 2637] : gain >= 100 ? [1568, 2093] : [1760];
    notes.forEach((freq, i) => {
      const osc = audio.createOscillator();
      const amp = audio.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t = now + i * 0.07;
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.07, t + 0.008);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(amp).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch { /* sound is optional */ }
}

/* ------------------------------------------------------------------ coins */

let layer = null;
const coins = [];
let coinRaf = 0;
function coinLayer() {
  if (layer) return layer;
  const canvas = document.createElement("canvas");
  canvas.className = "coin-layer";
  canvas.setAttribute("aria-hidden", "true");
  canvas.setAttribute("data-no-i18n", "");
  document.body.append(canvas);
  layer = { canvas, ctx: canvas.getContext("2d") };
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  addEventListener("resize", fit);
  return layer;
}

function drawCoin(ctx, x, y, r, spin) {
  const w = Math.max(0.15, Math.abs(Math.cos(spin))) * r;
  const g = ctx.createLinearGradient(x - w, y - r, x + w, y + r);
  g.addColorStop(0, "rgb(255, 236, 170)");
  g.addColorStop(0.5, "rgb(222, 178, 84)");
  g.addColorStop(1, "rgb(150, 104, 36)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, w, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(110, 72, 20, 0.7)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function coinFrame(now) {
  const { ctx, canvas } = coinLayer();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = coins.length - 1; i >= 0; i -= 1) {
    const c = coins[i];
    const t = Math.min(1, Math.max(0, (now - c.start) / c.dur));
    if (now < c.start) continue;
    // a quadratic arc that lifts before it falls into the purse
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const mx = (c.ax + c.bx) / 2 + c.bend, my = Math.min(c.ay, c.by) - c.lift;
    const x = (1 - e) * (1 - e) * c.ax + 2 * (1 - e) * e * mx + e * e * c.bx;
    const y = (1 - e) * (1 - e) * c.ay + 2 * (1 - e) * e * my + e * e * c.by;
    ctx.globalAlpha = t > 0.9 ? (1 - t) * 10 : 1;
    drawCoin(ctx, x, y, c.r * (1 - 0.35 * e), c.spin + t * 14);
    ctx.globalAlpha = 1;
    if (t >= 1) {
      coins.splice(i, 1);
      c.onLand?.();
    }
  }
  coinRaf = coins.length ? requestAnimationFrame(coinFrame) : 0;
  if (!coins.length) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function coinBurst(target, amount, onLand) {
  const to = target.getBoundingClientRect();
  const recent = lastPress && performance.now() - lastPress.at < 8000 ? lastPress : null;
  const from = recent ?? { x: innerWidth / 2, y: innerHeight * 0.55 };
  const n = Math.min(14, 4 + Math.round(Math.log10(Math.max(10, amount)) * 3));
  const now = performance.now();
  let landed = false;
  for (let i = 0; i < n; i += 1) {
    coins.push({
      ax: from.x + (Math.random() - 0.5) * 40,
      ay: from.y + (Math.random() - 0.5) * 30,
      bx: to.left + to.width * 0.5 + (Math.random() - 0.5) * 10,
      by: to.top + to.height * 0.5,
      bend: (Math.random() - 0.5) * 160,
      lift: 80 + Math.random() * 120,
      r: 6 + Math.random() * 3,
      spin: Math.random() * 6,
      start: now + i * 45,
      dur: 650 + Math.random() * 250,
      onLand: () => { if (!landed) { landed = true; onLand?.(); } },
    });
  }
  if (!coinRaf) coinRaf = requestAnimationFrame(coinFrame);
}

/* ------------------------------------------------------------------ the bank */

const banks = new WeakMap();

/**
 * Show a new balance on `node` (the <b> inside the bank pill).
 * @param {HTMLElement} node
 * @param {number} value
 * @param {{ format: (n: number) => string, soundOn?: boolean, symbol?: string }} o
 */
export function bank(node, value, o) {
  if (!node) return;
  const state = banks.get(node);
  node.textContent = o.format(value); // the truth, always
  if (!state) { banks.set(node, { shown: value, raf: 0 }); return; }
  const from = state.shown;
  if (from === value) return;
  const delta = value - from;
  state.shown = value;
  const pill = node.closest(".pill") ?? node.parentElement;
  if (REDUCED) return;

  // the rolling digits, drawn from an attribute so no text node changes per frame
  pill.classList.add("rolling");
  cancelAnimationFrame(state.raf);
  const start = performance.now();
  const dur = Math.min(1400, 450 + Math.log10(Math.abs(delta) + 1) * 260);
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    node.setAttribute("data-roll", o.format(Math.round(from + delta * e)));
    if (t < 1) state.raf = requestAnimationFrame(step);
    else { pill.classList.remove("rolling"); node.removeAttribute("data-roll"); }
  };
  state.raf = requestAnimationFrame(step);

  pill.classList.remove("gain", "loss");
  void pill.offsetWidth;
  pill.classList.add(delta > 0 ? "gain" : "loss");
  setTimeout(() => pill.classList.remove("gain", "loss"), 1300);

  const chip = document.createElement("span");
  chip.className = `bank-delta ${delta > 0 ? "up" : "down"}`;
  chip.setAttribute("aria-hidden", "true");
  chip.setAttribute("data-no-i18n", "");
  chip.textContent = `${delta > 0 ? "+" : "−"}${o.symbol ?? "₲"} ${o.format(Math.abs(delta))}`;
  pill.append(chip);
  setTimeout(() => chip.remove(), 1500);

  if (delta > 0 && delta >= 20) coinBurst(pill, delta, () => clink(delta, o.soundOn));
}

/* ------------------------------------------------------------------ tabs */

let indicator = null;
/** Slide a brass bar under the current tab. Call after the tabs change. */
export function tabIndicator(container) {
  if (!container) return;
  const current = container.querySelector('[aria-current="true"]');
  if (!indicator || !container.contains(indicator)) {
    indicator = document.createElement("span");
    indicator.className = "tab-indicator";
    indicator.setAttribute("aria-hidden", "true");
    container.style.position ||= "relative";
    container.append(indicator);
  }
  if (!current) { indicator.style.opacity = "0"; return; }
  indicator.style.opacity = "1";
  indicator.style.width = `${current.offsetWidth - 16}px`;
  indicator.style.transform = `translate(${current.offsetLeft + 8}px, ${current.offsetTop + current.offsetHeight - 3}px)`;
}

/* ------------------------------------------------------------------ elite stamp */

const bands = new Map();
let seeded = false;
const RANK = { "below the field": 0, "above the field": 1, "near elite": 2, stakes: 3 };

/**
 * Compare each horse's band with the last draw and stamp any that rose into the elite.
 * @param {Array<{id: string, name: string, band?: string, stakes?: boolean}>} horses
 * @param {(node: HTMLElement) => void} show where to put the stamp (the toast column)
 */
export function eliteStamp(horses, show) {
  const rose = [];
  for (const horse of horses ?? []) {
    const band = horse.stakes ? "stakes" : horse.band;
    const before = bands.get(horse.id);
    bands.set(horse.id, band);
    if (seeded && before !== undefined && (RANK[band] ?? 0) >= 2 && (RANK[band] ?? 0) > (RANK[before] ?? 0)) rose.push({ horse, band });
  }
  seeded = true;
  for (const { horse, band } of rose.slice(0, 2)) {
    const node = document.createElement("div");
    node.className = "toast stamp-toast";
    node.setAttribute("role", "status");
    const seal = document.createElement("span");
    seal.className = "stamp-seal";
    seal.textContent = band === "stakes" ? "STAKES" : "ELITE";
    const text = document.createElement("span");
    text.textContent = band === "stakes" ? `${horse.name} is stakes class` : `${horse.name} is near elite`;
    node.append(seal, text);
    show(node);
  }
  return rose.length;
}
