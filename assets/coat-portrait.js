/**
 * Coat-accurate portraits from the existing lineage paintings.
 *
 * The plates are bay horses on transparent backgrounds. A CSS filter tints the whole picture,
 * which reads as "a bay through coloured glass". This remaps the painting instead: every
 * opaque pixel's light (shadow → midtone → highlight) is laid onto the coat's own ramp, and the
 * dark, unsaturated hair of mane and forelock onto the mane's ramp. The brushwork, volume and
 * shine survive; the colour becomes the horse's. Each (plate, coat) pair is computed once.
 * No new art, no network: the same images the game already ships.
 */

const cache = new Map(); // `${src}|${coat}|${mane}` -> Promise<string data URL>

const hex = (value) => {
  const n = parseInt(String(value).replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const WHITE = [255, 255, 255];
const BLACK = [8, 6, 5];

/** A three-stop ramp around a base colour: deep shadow, the colour itself, a sunlit sheen. */
function ramp(base, t, sheen) {
  const shadow = mix(BLACK, base, 0.22);
  const light = mix(base, WHITE, sheen);
  return t < 0.5 ? mix(shadow, base, t / 0.5) : mix(base, light, (t - 0.5) / 0.5);
}

/** Pure pixel remap, exported for tests: RGBA in, RGBA out, same length. */
export function remapPixels(data, bodyColor, maneColor) {
  const body = hex(bodyColor);
  const mane = hex(maneColor);
  // light coats keep less contrast in the shadows; dark coats need more sheen to read
  const bodyLum = (0.2126 * body[0] + 0.7152 * body[1] + 0.0722 * body[2]) / 255;
  const sheen = bodyLum < 0.25 ? 0.42 : bodyLum > 0.6 ? 0.35 : 0.5;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    out[i + 3] = a;
    if (a === 0) continue;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = max > 0 ? (max - min) / max : 0;
    // mane and forelock: very dark, little colour
    const maneW = clamp01((0.2 - lum) / 0.12) * clamp01((0.6 - sat) / 0.35);
    const t = clamp01(lum / 0.62);
    let colour = ramp(body, t, sheen);
    if (maneW > 0) colour = mix(colour, ramp(mane, clamp01(lum / 0.22), 0.4), maneW);
    // specular highlights stay highlights on any coat
    const spec = clamp01((lum - 0.62) / 0.33);
    if (spec > 0) colour = mix(colour, WHITE, spec * 0.75);
    out[i] = colour[0];
    out[i + 1] = colour[1];
    out[i + 2] = colour[2];
  }
  return out;
}

function load(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`portrait failed to load: ${src}`));
    img.src = src;
  });
}

/**
 * Where to paint markings on a full-body side-profile plate facing left (the 2026-11 set),
 * read from its alpha mask alone: the front edge of the face from forehead to nose, the
 * ground line, and the four legs just above the hooves. Pure, exported for tests.
 */
export function findAnchors(alpha, w, h) {
  const solid = (x, y) => alpha[y * w + x] > 128;
  const front = new Int32Array(h).fill(-1);
  let top = -1, ground = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) if (solid(x, y)) { front[y] = x; break; }
    if (front[y] >= 0) { if (top < 0) top = y; ground = y; }
  }
  if (top < 0) return null;
  // the nose is the front-most point of the upper half
  let nose = top, noseX = w;
  for (let y = top; y < top + (ground - top) * 0.5; y += 1) if (front[y] >= 0 && front[y] < noseX) { noseX = front[y]; nose = y; }
  // legs: solid runs on a line a little above the hooves, left to right
  const scan = Math.round(ground - (ground - top) * 0.06);
  const legs = [];
  let run = -1;
  for (let x = 0; x <= w; x += 1) {
    const on = x < w && solid(x, scan);
    if (on && run < 0) run = x;
    if (!on && run >= 0) { if (x - run > w * 0.006) legs.push({ x0: run, x1: x - 1, cx: (run + x - 1) / 2 }); run = -1; }
  }
  return { top, nose, noseX, ground, front, legs: legs.slice(0, 4) };
}

/** White face markings and socks, painted only over the horse (never the background). */
function paintMarkings(ctx, w, h, appearance) {
  const blaze = appearance.blaze ?? "plain";
  const socks = appearance.sockLegs ?? [];
  if (blaze === "plain" && !socks.length) return;
  const a = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = a[i * 4 + 3];
  const anchor = findAnchors(alpha, w, h);
  if (!anchor) return;
  const { top, nose, front, ground, legs } = anchor;
  const head = nose - top;
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.filter = `blur(${Math.max(0.6, w / 900)}px)`;
  ctx.fillStyle = "rgba(246, 243, 236, 0.94)";
  if (blaze !== "plain" && head > 10) {
    const band = { star: null, stripe: [0.34, 0.86, 0.008], blaze: [0.26, 0.99, 0.018] }[blaze];
    if (blaze === "star" || band === null) {
      const y = Math.round(top + head * 0.5); // the forehead, below the ears and poll
      ctx.beginPath();
      ctx.ellipse(front[y] + w * 0.009, y, w * 0.009, h * 0.016, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (band) {
      const [from, to, width] = band;
      ctx.beginPath();
      const rows = [];
      for (let y = Math.round(top + head * from); y <= Math.round(top + head * to); y += 1) if (front[y] >= 0) rows.push(y);
      rows.forEach((y, i) => (i ? ctx.lineTo(front[y] - 1, y) : ctx.moveTo(front[y] - 1, y)));
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const y = rows[i];
        // the band narrows toward the forehead and widens over the nose
        const t = rows.length > 1 ? i / (rows.length - 1) : 1;
        ctx.lineTo(front[y] + w * width * (0.55 + 0.6 * t), y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  // socks: white from just above the hoof up the cannon, per leg (1..4 → left to right)
  const height = (ground - top);
  for (const leg of socks) {
    const L = legs[leg - 1];
    if (!L) continue;
    const y0 = Math.round(ground - height * 0.035), y1 = Math.round(ground - height * 0.13);
    // white with a feathered top edge, as a real sock fades into the coat
    const fade = ctx.createLinearGradient(0, y1, 0, y1 + (y0 - y1) * 0.35);
    fade.addColorStop(0, "rgba(246, 243, 236, 0)");
    fade.addColorStop(1, "rgba(246, 243, 236, 0.94)");
    ctx.fillStyle = fade;
    ctx.fillRect(L.x0 - w * 0.004, y1, (L.x1 - L.x0) + w * 0.008, y0 - y1);
  }
  ctx.restore();
}

/** Resolves to a data URL of the plate in this coat; rejects only if the plate cannot load. */
export function coatPortrait(src, appearance, maxWidth = 640) {
  // markings are drawn only on the 2026-11 plates; older plates have their own painted in
  const marks = /plate-/.test(src);
  const key = `${src}|${appearance.bodyColor}|${appearance.maneColor}|${marks ? `${appearance.blaze}|${(appearance.sockLegs ?? []).join("")}` : ""}`;
  if (!cache.has(key)) {
    cache.set(key, load(src).then((img) => {
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const frame = ctx.getImageData(0, 0, w, h);
      frame.data.set(remapPixels(frame.data, appearance.bodyColor, appearance.maneColor));
      ctx.putImageData(frame, 0, 0);
      if (marks) paintMarkings(ctx, w, h, appearance);
      return canvas.toDataURL("image/webp", 0.9);
    }).catch((error) => {
      cache.delete(key);
      throw error;
    }));
  }
  return cache.get(key);
}

/**
 * Upgrade an <img> in place: it shows the plate with the CSS filter at once, then swaps to the
 * remapped portrait when ready. If anything fails, the filtered plate simply stays.
 */
export function paintCoat(img, src, appearance) {
  img.src = src;
  img.style.filter = appearance.filter ?? "";
  img.dataset.coat = "pending";
  coatPortrait(src, appearance).then((url) => {
    if (!img.isConnected && !img.parentNode) return;
    img.src = url;
    img.style.filter = "";
    img.dataset.coat = "painted";
  }).catch(() => {
    img.dataset.coat = "filtered";
  });
}
