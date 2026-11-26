/**
 * The living stable: the player's own horses out in a painted paddock, each in its coat and
 * markings, walking, grazing and standing on their own. Day or dusk follows the player's clock.
 * Click a horse to open it. Draws only while on screen; reduced motion gets one still frame.
 *
 * Purely decorative: it reads a list of horses and never touches game state.
 */
import { coatPortrait } from "./coat-portrait.js?v=0.38.0"; // same URL as ui.js: one module, one cache

const HORIZON = 0.54; // the fence line in the painted plates (paddock-day/dusk), as a fraction of height
const NEAR = 0.97; // the lowest ground a hoof may stand on

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Where the hooves are, and how wide the horse is, from the plate's alpha. */
function measure(img) {
  const w = 96, h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * 96));
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
  if (bottom <= top) return { top: 0, bottom: 1, left: 0, right: 1 };
  return { top: top / h, bottom: (bottom + 1) / h, left: left / w, right: (right + 1) / w };
}

const rand = (seed) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
const hash = (text) => {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

export function isDusk(date = new Date()) {
  const hour = date.getHours();
  return hour >= 17 || hour < 6;
}

export class Paddock {
  /**
   * @param {HTMLElement} host
   * @param {{ reducedMotion?: boolean, onPick?: (id: string) => void, dusk?: boolean }} o
   */
  constructor(host, o = {}) {
    this.host = host;
    this.o = o;
    this.dusk = o.dusk ?? isDusk();
    this.horses = new Map();
    this.motes = [];
    this.t = 0;
    this.raf = 0;
    this.visible = true;
    this.hover = null;

    host.classList.add("pasture-live");
    host.classList.toggle("dusk", this.dusk);
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Seus cavalos no piquete");
    this.label = document.createElement("span");
    this.label.className = "paddock-label";
    this.label.hidden = true;
    host.append(this.canvas, this.label);
    this.ctx = this.canvas.getContext("2d");

    this.bg = null;
    this.ready = loadImage(`assets/art/paddock-${this.dusk ? "dusk" : "day"}.webp`)
      .then((img) => { this.bg = img; this.paint(); })
      .catch(() => {});

    this.fit = this.fit.bind(this);
    this.frame = this.frame.bind(this);
    this.resize = new ResizeObserver(this.fit);
    this.resize.observe(host);
    if ("IntersectionObserver" in window) {
      this.io = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        this.wake();
      });
      this.io.observe(host);
    }
    this.onVisibility = () => this.wake();
    document.addEventListener("visibilitychange", this.onVisibility);

    this.canvas.addEventListener("pointermove", (e) => this.pointer(e));
    this.canvas.addEventListener("pointerleave", () => { this.hover = null; this.label.hidden = true; this.canvas.style.cursor = ""; });
    this.canvas.addEventListener("click", (e) => {
      const hit = this.hit(e);
      if (hit) this.o.onPick?.(hit.id);
    });
    this.fit();
  }

  fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.paint();
  }

  /**
   * @param {Array<{id: string, name: string, src: string, appearance: object|null, age: number, elite?: boolean}>} list
   */
  set(list) {
    const keep = new Set();
    for (const item of list) {
      const key = `${item.id}|${item.src}|${JSON.stringify(item.appearance ?? null)}`;
      keep.add(item.id);
      const old = this.horses.get(item.id);
      if (old && old.key === key) {
        old.name = item.name;
        old.elite = Boolean(item.elite);
        continue;
      }
      const r = rand(hash(item.id));
      const horse = old ?? {
        id: item.id,
        x: 0.08 + r() * 0.84,
        depth: r(), // 0 = by the fence, 1 = at the front
        dir: r() < 0.5 ? -1 : 1,
        state: "stand",
        until: r() * 3,
        speed: 0.012 + r() * 0.01,
        phase: r() * Math.PI * 2,
        r,
      };
      Object.assign(horse, { key, name: item.name, foal: item.age <= 1, elite: Boolean(item.elite), img: null, box: null });
      this.horses.set(item.id, horse);
      const plate = item.appearance
        ? coatPortrait(item.src, item.appearance, 420).catch(() => item.src)
        : Promise.resolve(item.src);
      plate.then(loadImage).then((img) => {
        if (this.horses.get(item.id) !== horse || horse.key !== key) return;
        horse.img = img;
        horse.box = measure(img);
        this.paint();
      }).catch(() => {});
    }
    for (const id of [...this.horses.keys()]) if (!keep.has(id)) this.horses.delete(id);
    this.paint();
  }

  /** Ground y for a depth: further away is higher up and smaller. */
  ground(depth) {
    return this.h * (HORIZON + 0.07 + (NEAR - HORIZON - 0.07) * depth);
  }

  scaleAt(depth, foal) {
    const base = Math.min(this.h * 0.44, this.w * 0.2);
    return base * (0.55 + 0.45 * depth) * (foal ? 0.72 : 1);
  }

  step(dt) {
    for (const horse of this.horses.values()) {
      horse.until -= dt;
      if (horse.until <= 0) {
        const pick = horse.r();
        if (pick < 0.42) {
          horse.state = "walk";
          horse.until = 3 + horse.r() * 5;
          if (horse.r() < 0.4) horse.dir = -horse.dir;
          horse.drift = (horse.r() - 0.5) * 0.04;
        } else if (pick < 0.8) {
          horse.state = "graze";
          horse.until = 4 + horse.r() * 6;
        } else {
          horse.state = "stand";
          horse.until = 2 + horse.r() * 3;
        }
      }
      if (horse.state === "walk") {
        horse.x += horse.dir * horse.speed * dt;
        horse.depth = Math.min(1, Math.max(0, horse.depth + (horse.drift ?? 0) * dt));
        if (horse.x < 0.06) { horse.x = 0.06; horse.dir = 1; }
        if (horse.x > 0.94) { horse.x = 0.94; horse.dir = -1; }
      }
    }
    // light in the air: pollen by day, fireflies at dusk
    const want = this.dusk ? 26 : 18;
    while (this.motes.length < want) {
      this.motes.push({ x: Math.random(), y: HORIZON + Math.random() * (1 - HORIZON), vx: (Math.random() - 0.5) * 0.01, vy: -0.004 - Math.random() * 0.006, p: Math.random() * 6.28, s: 0.8 + Math.random() * 1.6 });
    }
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.p += dt * (this.dusk ? 2.2 : 1.2);
      if (m.y < HORIZON - 0.25 || m.x < -0.05 || m.x > 1.05) { m.x = Math.random(); m.y = 1.02; }
    }
  }

  paint() {
    const { ctx, w, h } = this;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    if (this.bg) {
      // cover-fit, anchored low so the pasture is never cropped away
      const s = Math.max(w / this.bg.naturalWidth, h / this.bg.naturalHeight);
      const dw = this.bg.naturalWidth * s, dh = this.bg.naturalHeight * s;
      ctx.drawImage(this.bg, (w - dw) / 2, (h - dh) * 0.7, dw, dh);
    }
    const herd = [...this.horses.values()].filter((horse) => horse.img).sort((a, b) => a.depth - b.depth);
    for (const horse of herd) this.drawHorse(horse);
    this.canvas.dataset.drawn = String(herd.length); // for tests: how many horses are out
    for (const m of this.motes) {
      const a = this.dusk ? 0.35 + 0.65 * Math.max(0, Math.sin(m.p)) : 0.25 + 0.2 * Math.sin(m.p);
      ctx.fillStyle = this.dusk ? `rgba(255, 226, 140, ${a})` : `rgba(255, 250, 225, ${a})`;
      if (this.dusk) { ctx.shadowColor = "rgba(255, 210, 110, 0.9)"; ctx.shadowBlur = 8; }
      ctx.beginPath();
      ctx.arc(m.x * w, m.y * h, m.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  drawHorse(horse) {
    const { ctx } = this;
    const img = horse.img, box = horse.box;
    const height = this.scaleAt(horse.depth, horse.foal);
    // the plate is scaled so the horse itself, not the transparent margin, is `height` tall
    const plateH = height / Math.max(0.2, box.bottom - box.top);
    const plateW = plateH * (img.naturalWidth / img.naturalHeight);
    const gx = horse.x * this.w;
    const gy = this.ground(horse.depth);
    const walking = horse.state === "walk";
    const bob = walking ? Math.abs(Math.sin(this.t * 6 + horse.phase)) * height * 0.012 : Math.sin(this.t * 1.4 + horse.phase) * height * 0.003;
    const tilt = horse.state === "graze" ? 0.05 : 0;

    // shadow on the grass
    const bodyW = plateW * (box.right - box.left);
    ctx.fillStyle = this.dusk ? "rgba(20, 10, 30, 0.26)" : "rgba(20, 30, 10, 0.28)";
    ctx.beginPath();
    ctx.ellipse(gx + (this.dusk ? -bodyW * 0.12 : 0), gy - 1, bodyW * 0.48, height * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(gx, gy - bob);
    // plates face left; a horse walking right is mirrored
    if (horse.dir > 0) ctx.scale(-1, 1);
    // grazing: the head goes down, pivoting at the hind feet
    if (tilt) {
      const back = plateW * (box.right - (box.left + box.right) / 2) * 0.85;
      ctx.translate(back, 0);
      ctx.rotate(-tilt);
      ctx.translate(-back, 0);
    }
    const left = -plateW * ((box.left + box.right) / 2);
    const top = -plateH * box.bottom;
    if (this.dusk) ctx.filter = "brightness(0.82) saturate(0.9)";
    ctx.drawImage(img, left, top, plateW, plateH);
    ctx.filter = "none";
    ctx.restore();

    if (horse.elite) {
      const glint = 0.5 + 0.5 * Math.sin(this.t * 2 + horse.phase);
      const sx = gx, sy = gy - height - 10;
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * glint;
      ctx.fillStyle = "rgba(242, 205, 120, 1)";
      ctx.shadowColor = "rgba(255, 215, 120, 0.9)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const rr = i % 2 ? 2.2 : 6;
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    horse.hitbox = { x: gx - bodyW / 2, y: gy - height, w: bodyW, h: height };
  }

  hit(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const herd = [...this.horses.values()].filter((horse) => horse.hitbox).sort((a, b) => b.depth - a.depth);
    return herd.find((horse) => x >= horse.hitbox.x && x <= horse.hitbox.x + horse.hitbox.w && y >= horse.hitbox.y && y <= horse.hitbox.y + horse.hitbox.h) ?? null;
  }

  pointer(e) {
    const hit = this.hit(e);
    this.hover = hit;
    this.canvas.style.cursor = hit ? "pointer" : "";
    if (!hit) { this.label.hidden = true; return; }
    this.label.textContent = hit.name;
    this.label.hidden = false;
    this.label.style.left = `${hit.hitbox.x + hit.hitbox.w / 2}px`;
    this.label.style.top = `${Math.max(4, hit.hitbox.y - 30)}px`;
  }

  wake() {
    if (this.o.reducedMotion) { this.paint(); return; }
    const run = this.visible && !document.hidden;
    if (run && !this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
    if (!run && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.step(dt);
    this.paint();
    this.raf = requestAnimationFrame(this.frame);
  }

  start() {
    this.wake();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resize.disconnect();
    this.io?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.host.replaceChildren();
    this.host.classList.remove("pasture-live", "dusk");
  }
}
