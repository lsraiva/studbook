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

/** Resolves to a data URL of the plate in this coat; rejects only if the plate cannot load. */
export function coatPortrait(src, appearance, maxWidth = 360) {
  const key = `${src}|${appearance.bodyColor}|${appearance.maneColor}`;
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
