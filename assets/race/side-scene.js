/**
 * The race as a broadcast: a side-on camera following the field past the grandstand.
 *
 * Same data and HUD as the aerial scene (RaceScene): every position still comes from the causal
 * engine's frames. This view only changes the camera — distance runs left to right, lanes become
 * depth — and the picture: a painted grandstand in parallax, a gallop cycle of 8 painted frames
 * advanced by the ground each horse covers (a faster horse strides faster), each runner repainted
 * in its own coat and its stable's silks, dust behind the field, and a photo-finish flash.
 */
import { RaceScene, SILKS, hashString, shortName } from "./scene.js";
import { remapPixels } from "../coat-portrait.js";

const SHEET = "assets/art/race-gallop.webp";
const STAND = "assets/art/race-grandstand.webp";
const COLS = 4, ROWS = 2, FRAMES = COLS * ROWS;
const STRIDE_M = 6.6; // ground covered by one full gallop cycle
const SPRITE_M = 3.1; // width of a frame in metres (nose to tail)
const FRAME_W = 300; // working width of one prepared frame, in pixels

const load = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`race art failed to load: ${src}`));
  img.src = src;
});
const hex = (value) => {
  const n = parseInt(String(value).replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Cut the sheet into frames aligned on the hoof line and the body's centre of mass. */
function sliceFrames(img) {
  const cellW = img.naturalWidth / COLS, cellH = img.naturalHeight / ROWS;
  const scale = FRAME_W / cellW;
  const w = Math.round(cellW * scale), h = Math.round(cellH * scale);
  const cuts = [];
  for (let i = 0; i < FRAMES; i += 1) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, (i % COLS) * cellW, Math.floor(i / COLS) * cellH, cellW, cellH, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    let bottom = 0, sumX = 0, count = 0;
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      if (data.data[(y * w + x) * 4 + 3] > 60) { bottom = Math.max(bottom, y); sumX += x; count += 1; }
    }
    cuts.push({ data, cx: count ? sumX / count : w / 2, bottom: bottom || h - 1 });
  }
  // a common frame where every cut shares the same anchor (centre of mass, ground line)
  const left = Math.max(...cuts.map((c) => c.cx)), right = Math.max(...cuts.map((c) => w - c.cx));
  const up = Math.max(...cuts.map((c) => c.bottom)), outW = Math.ceil(left + right), outH = Math.ceil(up + 4);
  return cuts.map((cut) => {
    const c = document.createElement("canvas");
    c.width = outW; c.height = outH;
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    tmp.getContext("2d").putImageData(cut.data, 0, 0);
    c.getContext("2d").drawImage(tmp, Math.round(left - cut.cx), Math.round(up - cut.bottom));
    return c;
  });
}

/** One runner's frames: the horse in its coat, the white silks and cloth in its stable colour. */
function paintRunner(frames, coat, mane, silk) {
  const tint = hex(silk);
  return frames.map((frame) => {
    const c = document.createElement("canvas");
    c.width = frame.width; c.height = frame.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(frame, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const src = img.data;
    const coated = remapPixels(src, coat, mane);
    for (let i = 0; i < src.length; i += 4) {
      if (!src[i + 3]) continue;
      const r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sat = max > 0 ? (max - min) / max : 0;
      if (sat < 0.14 && lum > 0.28) {
        // silks: keep the folds' light, change the cloth's colour
        const k = 0.28 + 0.95 * lum;
        const sheen = lum > 0.86 ? (lum - 0.86) / 0.14 : 0;
        for (let j = 0; j < 3; j += 1) coated[i + j] = Math.min(255, tint[j] * k + (255 - tint[j] * k) * sheen * 0.5);
      }
    }
    img.data.set(coated);
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

export class SideRaceScene extends RaceScene {
  constructor(host, data, options = {}) {
    super(host, data, options);
    this.stage.classList.add("side-view");
    this.dust = [];
    this.flash = 0;
    this.sprites = new Map();
    this.loaded = Promise.all([load(SHEET), load(STAND)]).then(([sheet, stand]) => {
      const frames = sliceFrames(sheet);
      for (const runner of data.runners) {
        const silk = SILKS[hashString(runner.stable ?? runner.key) % SILKS.length];
        const key = `${runner.coat}|${runner.mane}|${silk}`;
        if (!this.sprites.has(key)) this.sprites.set(key, paintRunner(frames, runner.coat ?? "#7a4b2e", runner.mane ?? "#241a14", silk));
        runner.spriteKey = key;
        runner.silk = silk;
      }
      this.stand = stand;
      this.ready = true;
      this.draw();
    });
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.ready) {
      ctx.fillStyle = "#0e1712";
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.fillStyle = "rgba(241,238,228,0.7)";
      ctx.font = "15px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("Preparando a pista…", this.w / 2, this.h / 2);
      ctx.textAlign = "start";
      return;
    }
    const runners = this.positions(this.t);
    const leader = runners[0];
    this.leaderLeft = this.data.distance - leader.x;
    const narrow = this.w < 640;
    // zoom to the race: frame the leader and the next two, closer on a phone; a straggler may
    // leave the picture (the order board still shows him) rather than shrink the whole field
    const post = this.data.distance;
    const front = Math.min(leader.x, post + 6);
    const chaser = runners[Math.min(2, runners.length - 1)];
    const spread = Math.max(0, front - Math.min(chaser.x, post + 6));
    const want = narrow ? Math.min(24, Math.max(10, spread * 1.15 + 7)) : Math.min(44, Math.max(20, spread * 1.25 + 11));
    const dt = Math.max(0, this.t - (this.lastT ?? this.t));
    this.lastT = this.t;
    this.viewM = this.viewM === undefined || !this.playing ? want : this.viewM + (want - this.viewM) * Math.min(1, dt * 1.6);
    const ppm = this.w / this.viewM;
    // positions are already smooth (interpolated engine frames), so the camera follows exactly:
    // any lag here leaves the field off screen when a slow device drops frames
    this.camX = front - (this.w * (narrow ? 0.72 : 0.76)) / ppm;
    const toX = (m) => (m - this.camX) * ppm;

    const lanes = Math.max(8, this.data.runners.length + 2);
    // on a phone the order board and controls sit low, so the course sits higher
    const far = this.h * (narrow ? 0.4 : 0.54), near = this.h * (narrow ? 0.64 : 0.9);
    const laneY = (lane) => near - (lane / lanes) * (near - far);
    const laneS = (lane) => 1 - 0.22 * (lane / lanes);

    this.drawStand(ctx, ppm, far - 16);
    this.drawTrack(ctx, toX, ppm, far, near, lanes);

    // runners: the far lanes first, so nearer horses pass in front
    const order = [...runners].sort((a, b) => b.lane - a.lane);
    this.badges = [];
    for (const r of order) this.drawRunner(ctx, r, toX(r.x), laneY(r.lane), laneS(r.lane), ppm);
    // numbers go on top of every horse, so a runner hidden in the pack is still identified
    for (const b of this.badges) this.drawBadge(ctx, b);
    this.drawDust(ctx);
    this.drawNearRail(ctx, toX, ppm, near);

    // the photo-finish flash as the leader reaches the post
    if (this.leaderLeft <= 0 && !this.flashed && this.playing) { this.flashed = true; this.flash = 1; }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.55 * this.flash})`;
      ctx.fillRect(0, 0, this.w, this.h);
      this.flash = Math.max(0, this.flash - 0.06);
    }
    this.updateHud(runners);
  }

  drawStand(ctx, ppm, rail) {
    // the grandstand drifts slowly: far things move less, which is what sells the speed.
    // Its painted fence (at 62% of the picture) is laid exactly on the course's far rail.
    const img = this.stand;
    const h = Math.round(rail / 0.62);
    const w = Math.round((img.naturalWidth / img.naturalHeight) * h);
    // scale the painting once per size, then only copy it: resampling a 2048 px image every
    // frame is the most expensive thing this scene could do on a phone or without a GPU
    if (!this.standCache || this.standCache.height !== h) {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      this.standCache = c;
    }
    const shift = ((this.camX * ppm * 0.16) % w + w) % w;
    for (let x = -shift; x < this.w; x += w) ctx.drawImage(this.standCache, Math.round(x), 0);
    ctx.fillStyle = "#2c5a2f";
    ctx.fillRect(0, h - 1, this.w, Math.max(0, this.h - h + 1));
  }

  drawTrack(ctx, toX, ppm, far, near, lanes) {
    // the running surface: mown bands across the turf, every 8 m
    const grad = ctx.createLinearGradient(0, far - 10, 0, near + 30);
    grad.addColorStop(0, "#3f7a3c");
    grad.addColorStop(1, "#2d6430");
    ctx.fillStyle = grad;
    ctx.fillRect(0, far - 10, this.w, near - far + 60);
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    const band = 5;
    const first = Math.floor(this.camX / band) * band;
    for (let m = first; toX(m) < this.w; m += band * 2) ctx.fillRect(toX(m), far - 10, band * ppm, near - far + 60);
    // faint lane lines and a little texture in the grass
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let l = 1; l < lanes; l += 1) {
      const y = near - (l / lanes) * (near - far);
      ctx.beginPath();
      ctx.setLineDash([12, 18]);
      ctx.lineDashOffset = (this.camX * ppm) % 30;
      ctx.moveTo(0, y);
      ctx.lineTo(this.w, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    for (let i = 0; i < 70; i += 1) {
      const gx = ((i * 97.13 - this.camX * ppm) % this.w + this.w) % this.w;
      const gy = far + ((i * 53.7) % (near - far + 40));
      ctx.fillRect(gx, gy, 14 + (i % 5) * 6, 1.5);
    }
    // the far rail: white posts and a rail
    ctx.fillStyle = "#ecebe2";
    ctx.fillRect(0, far - 16, this.w, 3);
    const post = 4;
    for (let m = Math.floor(this.camX / post) * post; toX(m) < this.w; m += post) ctx.fillRect(toX(m) - 1, far - 16, 2.5, 12);
    // distance poles, every 200 m to go, and the post itself
    const d = this.data.distance;
    ctx.font = `600 ${Math.max(11, Math.min(14, ppm * 0.45))}px system-ui, sans-serif`;
    for (let left = 200; left < d; left += 200) {
      const x = toX(d - left);
      if (x < -40 || x > this.w + 40) continue;
      ctx.fillStyle = "#d7b77d";
      ctx.fillRect(x - 2, far - 52, 4, 40);
      ctx.fillStyle = "rgba(14,23,18,0.8)";
      ctx.fillRect(x - 20, far - 72, 40, 20);
      ctx.fillStyle = "#f1eee4";
      ctx.textAlign = "center";
      ctx.fillText(`${left}`, x, far - 57);
      ctx.textAlign = "start";
    }
    const fx = toX(d);
    if (fx > -60 && fx < this.w + 60) {
      ctx.fillStyle = "rgba(241,238,228,0.85)";
      ctx.fillRect(fx - 2, far - 10, 4, near - far + 30);
      ctx.fillStyle = "#f1eee4";
      ctx.fillRect(fx - 3, far - 92, 6, 80);
      ctx.fillStyle = "#c8453b";
      ctx.beginPath();
      ctx.arc(fx, far - 96, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f1eee4";
      ctx.beginPath();
      ctx.arc(fx, far - 96, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawRunner(ctx, r, x, y, scale, ppm) {
    const card = this.byKey.get(r.key);
    const frames = this.sprites.get(card?.spriteKey);
    if (!frames) return;
    const moving = r.x > 0.5 && r.done === null;
    const phase = moving ? Math.floor(((r.x / STRIDE_M) % 1) * FRAMES) : (r.done !== null ? Math.floor(((r.x / STRIDE_M) % 1) * FRAMES) : 0);
    const frame = frames[(phase + FRAMES) % FRAMES];
    const w = SPRITE_M * ppm * scale;
    const h = w * (frame.height / frame.width);
    // shadow on the turf
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.36, h * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    if (card?.mine) {
      ctx.strokeStyle = "rgba(226,197,142,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.42, h * 0.075, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.drawImage(frame, x - w / 2, y - h * 0.97, w, h);
    // the number over the rider, drawn after all horses (see draw)
    this.badges.push({ x: x + w * 0.02, y: y - h * 0.86, size: Math.max(14, Math.min(22, w * 0.11)), mine: Boolean(card?.mine), number: card?.number ?? "" });
    // kicked-up turf behind the hind legs
    if (moving && this.playing && Math.random() < 0.55) {
      this.dust.push({ x: x - w * 0.32, y: y - 2, vx: -(0.6 + Math.random() * 1.2), vy: -(0.3 + Math.random() * 0.7), life: 1, size: 2 + Math.random() * 3 * scale });
    }
  }

  drawBadge(ctx, { x, y, size, mine, number }) {
    ctx.fillStyle = mine ? "#e2c58e" : "rgba(14,23,18,0.86)";
    ctx.fillRect(x - size * 0.6, y - size * 0.6, size * 1.2, size * 1.1);
    ctx.fillStyle = mine ? "#201c13" : "#f1eee4";
    ctx.font = `700 ${Math.round(size * 0.68)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), x, y - size * 0.04);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  drawDust(ctx) {
    for (const p of this.dust) {
      p.x += p.vx * 3; p.y += p.vy; p.vy += 0.06; p.life -= 0.04;
      ctx.fillStyle = `rgba(122,100,62,${Math.max(0, p.life) * 0.5})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    this.dust = this.dust.filter((p) => p.life > 0).slice(-260);
  }

  drawNearRail(ctx, toX, ppm, near) {
    // the near rail rushes past faster than the field: the strongest cue of speed
    const y = near + this.h * 0.06;
    ctx.fillStyle = "rgba(236,235,226,0.92)";
    ctx.fillRect(0, y, this.w, 5);
    const gap = 3.2;
    const k = 1.35;
    const start = Math.floor((this.camX * k) / gap) * gap;
    for (let m = start; (m - this.camX * k) * ppm < this.w; m += gap) {
      const x = (m - this.camX * k) * ppm;
      ctx.fillRect(x - 3, y, 6, this.h - y);
    }
  }

  play() {
    this.flashed = false;
    this.dust = [];
    super.play();
  }
}

export { shortName };
