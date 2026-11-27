/**
 * The shareable card: one horse as a picture worth posting. The horse in its own coat and
 * markings on the stud farm at dusk, its name, its line (sire × dam), what it has done, and
 * the stable that owns it. 1080 × 1350 (4:5), drawn on a canvas in the browser: nothing is
 * uploaded anywhere. The player shares or saves the file themselves.
 */
import { coatPortrait } from "./coat-portrait.js?v=0.38.0"; // same URL as ui.js: one module, one cache

const W = 1080, H = 1350;
const GOLD = "#d7b77d", CREAM = "#f1eee4", MUTED = "#a6b0a2", INK = "#0b120d";

const load = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Where the animal actually is inside its plate (the plates have transparent margins). */
function bounds(img) {
  const w = 160, h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const a = g.getImageData(0, 0, w, h).data;
  let top = h, bottom = 0, left = w, right = 0;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (a[(y * w + x) * 4 + 3] < 40) continue;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    if (x < left) left = x;
    if (x > right) right = x;
  }
  if (bottom <= top) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: left / w, y: top / h, w: (right - left + 1) / w, h: (bottom - top + 1) / h };
}

/** Text that shrinks until it fits its width. */
function fitText(ctx, text, maxWidth, size, min, font) {
  let px = size;
  do {
    ctx.font = font(px);
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 2;
  } while (px > min);
  return px;
}

/**
 * @param {object} o
 *  - name, src, appearance (from appearanceFor), coat (label in the page's language)
 *  - eyebrow: e.g. "Nasceu na temporada 4" or "3 vitórias em 9 corridas"
 *  - line: "Sire × Dam"
 *  - facts: up to three short [label, value] pairs
 *  - badge: optional word in a gold seal ("ELITE", "PROMISSOR")
 *  - stable: the owner's stable name
 *  - host: site shown at the foot (empty offline)
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function drawShareCard(o) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // the stud farm at dusk, then night falling toward the text
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const backdrop = await load("assets/art/paddock-dusk.webp").catch(() => null);
  const sceneH = 800;
  if (backdrop) {
    const scale = Math.max(W / backdrop.naturalWidth, sceneH / backdrop.naturalHeight);
    const dw = backdrop.naturalWidth * scale, dh = backdrop.naturalHeight * scale;
    ctx.drawImage(backdrop, (W - dw) * 0.3, sceneH - dh, dw, dh);
  }
  const fall = ctx.createLinearGradient(0, 430, 0, sceneH + 40);
  fall.addColorStop(0, "rgba(11, 18, 13, 0)");
  fall.addColorStop(1, INK);
  ctx.fillStyle = fall;
  ctx.fillRect(0, 430, W, sceneH - 390);
  const top = ctx.createLinearGradient(0, 0, 0, 200);
  top.addColorStop(0, "rgba(11, 18, 13, 0.75)");
  top.addColorStop(1, "rgba(11, 18, 13, 0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 200);

  // the horse, standing on the pasture
  // painted in its coat when the appearance is known; the plain plate otherwise, or on any failure
  const painted = async () => load(o.appearance ? await coatPortrait(o.src, o.appearance, 900) : o.src);
  const plate = await painted().catch(() => load(o.src)).catch(() => null);
  if (plate) {
    const b = bounds(plate);
    const targetW = 800, targetH = 520;
    const scale = Math.min(targetW / (plate.naturalWidth * b.w), targetH / (plate.naturalHeight * b.h));
    const dw = plate.naturalWidth * scale, dh = plate.naturalHeight * scale;
    const ground = 735;
    const dx = W / 2 - (b.x + b.w / 2) * dw;
    const dy = ground - (b.y + b.h) * dh;
    ctx.fillStyle = "rgba(10, 6, 16, 0.45)";
    ctx.beginPath();
    ctx.ellipse(W / 2, ground - 4, b.w * dw * 0.46, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = "rgba(255, 205, 130, 0.35)";
    ctx.shadowBlur = 40;
    ctx.drawImage(plate, dx, dy, dw, dh);
    ctx.restore();
  }

  // wordmark
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = "600 34px Georgia, serif";
  const stud = "STUD", book = "BOOK";
  try { ctx.letterSpacing = "6px"; } catch { /* older canvases */ }
  ctx.fillStyle = CREAM;
  ctx.fillText(stud, 64, 92);
  ctx.fillStyle = GOLD;
  ctx.fillText(book, 64 + ctx.measureText(stud).width, 92);
  try { ctx.letterSpacing = "0px"; } catch { /* older canvases */ }

  // badge
  if (o.badge) {
    ctx.save();
    ctx.translate(W - 150, 110);
    ctx.rotate(-0.1);
    ctx.font = "700 24px system-ui, -apple-system, 'Segoe UI', sans-serif";
    try { ctx.letterSpacing = "4px"; } catch { /* older canvases */ }
    const bw = ctx.measureText(o.badge).width + 44;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.fillStyle = "rgba(11, 18, 13, 0.6)";
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -30, bw, 60, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.textAlign = "center";
    ctx.fillText(o.badge, 2, 9);
    ctx.restore();
  }

  // the name and what goes with it
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = "600 24px system-ui, -apple-system, 'Segoe UI', sans-serif";
  try { ctx.letterSpacing = "5px"; } catch { /* older canvases */ }
  ctx.fillText(String(o.eyebrow ?? "").toUpperCase(), W / 2, 850);
  try { ctx.letterSpacing = "0px"; } catch { /* older canvases */ }

  ctx.fillStyle = CREAM;
  fitText(ctx, o.name, W - 140, 104, 54, (px) => `400 ${px}px Georgia, serif`);
  ctx.fillText(o.name, W / 2, 955);

  ctx.fillStyle = MUTED;
  ctx.font = "500 26px system-ui, -apple-system, 'Segoe UI', sans-serif";
  try { ctx.letterSpacing = "3px"; } catch { /* older canvases */ }
  ctx.fillText(String(o.coat ?? "").toUpperCase(), W / 2, 1002);
  try { ctx.letterSpacing = "0px"; } catch { /* older canvases */ }

  if (o.line) {
    ctx.fillStyle = CREAM;
    fitText(ctx, o.line, W - 160, 36, 24, (px) => `italic 400 ${px}px Georgia, serif`);
    ctx.fillText(o.line, W / 2, 1066);
  }

  // facts, in a row between two hairlines
  const facts = (o.facts ?? []).slice(0, 3);
  if (facts.length) {
    ctx.strokeStyle = "rgba(215, 183, 125, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(90, 1104); ctx.lineTo(W - 90, 1104);
    ctx.moveTo(90, 1214); ctx.lineTo(W - 90, 1214);
    ctx.stroke();
    const cell = (W - 180) / facts.length;
    facts.forEach(([label, value], i) => {
      const cx = 90 + cell * (i + 0.5);
      ctx.fillStyle = CREAM;
      fitText(ctx, String(value), cell - 24, 40, 24, (px) => `600 ${px}px Georgia, serif`);
      ctx.fillText(String(value), cx, 1160);
      ctx.fillStyle = MUTED;
      ctx.font = "500 20px system-ui, -apple-system, 'Segoe UI', sans-serif";
      try { ctx.letterSpacing = "3px"; } catch { /* older canvases */ }
      ctx.fillText(String(label).toUpperCase(), cx, 1194);
      try { ctx.letterSpacing = "0px"; } catch { /* older canvases */ }
    });
  }

  // foot: whose horse, and where the game lives
  ctx.fillStyle = GOLD;
  fitText(ctx, o.stable ?? "", W - 400, 30, 20, (px) => `400 ${px}px Georgia, serif`);
  ctx.textAlign = "left";
  ctx.fillText(o.stable ?? "", 64, 1290);
  if (o.host) {
    ctx.textAlign = "right";
    ctx.fillStyle = MUTED;
    ctx.font = "500 24px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText(o.host, W - 64, 1290);
  }

  // frame
  ctx.strokeStyle = "rgba(215, 183, 125, 0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  return canvas;
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

/**
 * Draw the card and hand it to the player: the system share sheet where there is one (phones),
 * otherwise a downloaded PNG. Returns "shared", "saved" or "cancelled".
 */
export async function shareCard(o) {
  const canvas = await drawShareCard(o);
  const blob = await toBlob(canvas);
  if (!blob) throw new Error("could not draw the card");
  const slug = String(o.name ?? "cavalo").normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "cavalo";
  const file = new File([blob], `studbook-${slug}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: o.name, text: o.shareText ?? "" });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      // a share sheet that fails falls through to a plain download
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "saved";
}
