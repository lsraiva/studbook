/**
 * The race, on screen. A canvas renderer for an exhibition result from exhibition.js.
 *
 * Every position comes from the causal engine's frames (4 per second), interpolated to the
 * display rate: nothing is scripted toward a known finish. The camera follows the leaders,
 * the course is the same oval the engine ran on (assets/race/track.js), and the HUD reads the
 * live order from the same positions. Reduced motion shows the finish and the result only.
 */
import { pointAt, COURSE } from "./track.js";

const SILKS = ["#c8453b", "#2f6fb5", "#e0b13a", "#3f8f5a", "#7d4fb0", "#d9773a", "#1f8c95", "#b8406e", "#6b7d2f", "#4a5bd1", "#a05a2c", "#3c3c3c"];
const LENGTH_M = 2.4; // one length, in metres, for gaps
const DRAW = 1.35; // horses are drawn a little larger than life so a field reads on a phone
const shortName = (name) => String(name ?? "").replace(/\s*\(L\d+\)$/, "");

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

export class RaceScene {
  /**
   * @param host     element that receives the stage (canvas + HUD)
   * @param data     exhibition result
   * @param options  { reducedMotion, onClose, labels }
   */
  constructor(host, data, options = {}) {
    this.host = host;
    this.data = data;
    this.options = options;
    this.reduced = Boolean(options.reducedMotion);
    this.dt = data.snapshotEvery / data.tickHz; // seconds between frames
    this.byKey = new Map(data.runners.map((r) => [r.key, r]));
    this.finishTime = new Map(data.placings.map((p) => [p.key, p.time]));
    this.raceEnd = Math.max(...data.placings.map((p) => p.time));
    // a sprint plays near real time, a staying race is brought to under a minute
    this.speed = Math.max(1.4, Math.min(4, this.raceEnd / 48));
    this.t = 0;
    this.playing = false;
    this.leaderKey = null;
    this.calls = [];
    this.cam = null;
    this.build();
  }

  build() {
    this.host.replaceChildren();
    this.stage = el("div", "rs-stage");
    this.canvas = el("canvas", "rs-canvas");
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", `Corrida de exibição: ${this.data.label}, ${this.data.distance} m`);
    const top = el("div", "rs-top");
    const title = el("div", "rs-title");
    const heading = el("strong");
    // the going label arrives in the engine's words; the page's i18n layer owns the Portuguese
    const say = window.__studbookI18n?.translate ?? ((x) => x);
    heading.append(el("span", "", say(this.data.label)), el("span", "", ` · ${this.data.distance} m`));
    title.append(el("span", "rs-eyebrow", "Exibição · motor causal"), heading);
    this.clock = el("div", "rs-clock", "0.0 s");
    this.toGo = el("div", "rs-togo", `faltam ${this.data.distance} m`);
    const right = el("div", "rs-right");
    right.append(this.toGo, this.clock);
    top.append(title, right);
    this.board = el("ol", "rs-board");
    this.board.setAttribute("aria-live", "off");
    this.call = el("p", "rs-call");
    this.call.setAttribute("aria-live", "polite");
    const controls = el("div", "rs-controls");
    this.playBtn = el("button", "tiny", "Pausar");
    this.playBtn.type = "button";
    this.playBtn.addEventListener("click", () => (this.playing ? this.pause() : this.play()));
    this.fastBtn = el("button", "tiny", "2×");
    this.fastBtn.type = "button";
    this.fastBtn.addEventListener("click", () => {
      this.boost = this.boost === 2 ? 1 : 2;
      this.fastBtn.textContent = this.boost === 2 ? "1×" : "2×";
    });
    const skip = el("button", "tiny", "Ir para a chegada");
    skip.type = "button";
    skip.addEventListener("click", () => this.finish());
    const close = el("button", "tiny", "Fechar");
    close.type = "button";
    close.addEventListener("click", () => this.close());
    // sound follows the game's own setting, and can be muted here without changing it
    this.audio = new RaceAudio();
    this.audio.setEnabled(Boolean(this.options.sound) && !this.reduced);
    this.soundBtn = el("button", "tiny", this.audio.enabled ? "Som: ligado" : "Som: desligado");
    this.soundBtn.type = "button";
    this.soundBtn.setAttribute("aria-pressed", String(this.audio.enabled));
    this.soundBtn.addEventListener("click", () => {
      this.audio.setEnabled(!this.audio.enabled);
      this.soundBtn.textContent = this.audio.enabled ? "Som: ligado" : "Som: desligado";
      this.soundBtn.setAttribute("aria-pressed", String(this.audio.enabled));
      if (this.audio.enabled && this.playing) this.audio.start({ bell: false });
    });
    controls.append(this.playBtn, this.fastBtn, this.soundBtn, skip, close);
    this.resultBox = el("div", "rs-result");
    this.resultBox.hidden = true;
    this.stage.append(this.canvas, top, this.board, this.call, controls, this.resultBox);
    this.host.append(this.stage);
    this.ctx = this.canvas.getContext("2d");
    this.resize = this.resize.bind(this);
    this.observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(this.resize) : null;
    this.observer?.observe(this.stage);
    this.resize();
    this.boost = 1;
  }

  resize() {
    const box = this.stage.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(320, box.width);
    this.h = Math.max(240, box.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.playing) this.draw();
  }

  /* ---------- positions from frames ---------- */

  positions(t) {
    const frames = this.data.frames;
    const f = t / this.dt;
    const i = Math.max(0, Math.min(frames.length - 1, Math.floor(f) - 1));
    const a = frames[i];
    const b = frames[Math.min(frames.length - 1, i + 1)];
    const k = Math.max(0, Math.min(1, f - (i + 1)));
    const out = [];
    for (let j = 0; j < a.r.length; j += 1) {
      const [key, xa, la] = a.r[j];
      const rb = b.r.find((row) => row[0] === key) ?? a.r[j];
      let x = xa + (rb[1] - xa) * k;
      const lane = la + (rb[2] - la) * k;
      // after the last frame, finishers ease up past the post instead of freezing
      const done = this.finishTime.get(key);
      if (done !== undefined && t > done) x = Math.max(x, this.data.distance + (t - done) * 11);
      out.push({ key, x, lane, done: done !== undefined && t >= done ? done : null });
    }
    // finishers rank by when they crossed (the official order), everyone else by ground covered
    return out.sort((p, q) => {
      if (p.done !== null && q.done !== null) return p.done - q.done || this.rank(p.key) - this.rank(q.key);
      if (p.done !== null) return -1;
      if (q.done !== null) return 1;
      return q.x - p.x;
    });
  }

  rank(key) {
    return this.data.placings.findIndex((p) => p.key === key);
  }

  /* ---------- playback ---------- */

  play() {
    if (this.reduced) return this.finish();
    if (this.t >= this.raceEnd + 2) this.t = 0;
    this.resultBox.hidden = true;
    this.call.hidden = false;
    this.saidStraight = false;
    this.said200 = false;
    this.cam = null;
    this.playing = true;
    this.playBtn.textContent = "Pausar";
    this.audio.start({ bell: this.t === 0 });
    let last = performance.now();
    const step = (now) => {
      if (!this.playing) return;
      if (now - last < 31) { this.raf = requestAnimationFrame(step); return; }
      const elapsed = Math.min(0.1, (now - last) / 1000);
      last = now;
      // the last furlong slows down: the finish is what everyone came for
      const leaderLeft = this.leaderLeft ?? this.data.distance;
      const slow = leaderLeft < 60 && leaderLeft > -5 ? 0.45 : 1;
      this.t += elapsed * this.speed * this.boost * slow;
      this.draw();
      const excitement = Math.max(0, Math.min(1, 1 - (this.leaderLeft ?? this.data.distance) / 450));
      this.audio.update({ pace: (this.speed * this.boost * slow) / 1.6, excitement, field: this.data.runners.length });
      if (this.t >= this.raceEnd + 1.2) return this.finish();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.audio.pause();
    this.playBtn.textContent = "Continuar";
  }

  finish() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.t = this.raceEnd + 1.2;
    this.draw();
    this.showResult();
    this.audio.cheer();
    this.playBtn.textContent = "Assistir de novo";
  }

  close() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.audio.stop();
    this.observer?.disconnect();
    this.options.onClose?.();
  }

  /* ---------- drawing ---------- */

  draw() {
    const ctx = this.ctx;
    const runners = this.positions(this.t);
    const leader = runners[0];
    this.leaderLeft = this.data.distance - leader.x;

    // camera: follow the front of the field; frame the leaders, never the whole oval
    const front = runners.slice(0, Math.min(4, runners.length));
    const at = (r) => pointAt(this.data.distance, Math.min(r.x, this.data.distance + 12), r.lane);
    const mean = front.reduce((acc, r) => { const p = at(r); return { x: acc.x + p.x / front.length, y: acc.y + p.y / front.length }; }, { x: 0, y: 0 });
    const lead = at(leader);
    const target = { x: (mean.x + lead.x) / 2, y: (mean.y + lead.y) / 2 };
    // look ahead along the running line, so the leaders have room in front of them
    const racing = leader.x < this.data.distance;
    const ahead = racing ? 0.16 : 0;
    const spread = Math.max(18, Math.min(leader.x, this.data.distance) - Math.min(runners[runners.length - 1].x, this.data.distance));
    // a phone frames the leaders closely; a wide screen can afford the whole field
    const narrow = this.w < 640;
    const viewMetres = narrow ? Math.max(34, Math.min(90, spread * 1.1)) : Math.max(70, Math.min(170, spread * 1.6));
    const scale = Math.min(this.w, this.h * 1.5) / viewMetres;
    target.x += Math.cos(lead.heading) * viewMetres * ahead;
    target.y += Math.sin(lead.heading) * viewMetres * ahead;
    if (!this.cam || !this.playing) this.cam = { ...target, scale };
    else {
      this.cam.x += (target.x - this.cam.x) * 0.16;
      this.cam.y += (target.y - this.cam.y) * 0.16;
      this.cam.scale += (scale - this.cam.scale) * 0.03;
    }
    const s = this.cam.scale;
    const toScreen = (p) => ({ x: this.w / 2 + (p.x - this.cam.x) * s, y: this.h * 0.55 + (p.y - this.cam.y) * s });

    // ground
    ctx.fillStyle = "#16301f";
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawCourse(ctx, toScreen, s);
    this.drawMarkers(ctx, toScreen, s);
    // runners, back to front so leaders sit on top
    for (const r of [...runners].reverse()) this.drawHorse(ctx, r, toScreen, s);
    this.updateHud(runners);
  }

  /** The oval's rails, sampled once: every frame only projects and culls them. */
  courseSamples() {
    if (this.samples) return this.samples;
    const lanes = Math.max(8, this.data.runners.length + 2);
    const inner = -0.8;
    const outer = lanes + 0.8;
    const L = 2 * COURSE.straight + 2 * Math.PI * COURSE.radius;
    const rows = [];
    for (let m = 0; m < L; m += 6) rows.push({ m, a: pointAt(0, m, inner), b: pointAt(0, m, outer) });
    rows.push({ m: L, a: pointAt(0, L, inner), b: pointAt(0, L, outer) }); // close the oval exactly
    this.samples = rows;
    return rows;
  }

  drawCourse(ctx, toScreen, s) {
    const rows = this.courseSamples();
    const pad = 80;
    const inView = (p) => p.x > -pad && p.x < this.w + pad && p.y > -pad && p.y < this.h + pad;
    const proj = rows.map((row) => ({ m: row.m, a: toScreen(row.a), b: toScreen(row.b) }));
    // turf as quads between the rails, only where the camera can see; mown bands every 12 m
    for (let i = 0; i < proj.length - 1; i += 1) {
      const p = proj[i], q = proj[i + 1];
      if (!inView(p.a) && !inView(p.b) && !inView(q.a) && !inView(q.b)) continue;
      ctx.fillStyle = Math.floor(p.m / 12) % 2 ? "#2f6a3b" : "#336f3f";
      ctx.beginPath();
      ctx.moveTo(p.a.x, p.a.y);
      ctx.lineTo(q.a.x, q.a.y);
      ctx.lineTo(q.b.x, q.b.y);
      ctx.lineTo(p.b.x, p.b.y);
      ctx.closePath();
      ctx.fill();
      // hairline seam hides anti-aliasing gaps between quads
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // rails: polylines through the visible samples
    const rail = (pick, colour) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(1.5, 0.18 * s);
      ctx.beginPath();
      let open = false;
      for (let i = 0; i < proj.length; i += 1) {
        const p = pick(proj[i]);
        const near = inView(p) || (i > 0 && inView(pick(proj[i - 1]))) || (i < proj.length - 1 && inView(pick(proj[i + 1])));
        if (!near) { open = false; continue; }
        if (!open) { ctx.moveTo(p.x, p.y); open = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    };
    rail((row) => row.a, "#ecebe2");
    rail((row) => row.b, "rgba(236,235,226,0.7)");
  }

  drawMarkers(ctx, toScreen, s) {
    const lanes = Math.max(8, this.data.runners.length + 2);
    const d = this.data.distance;
    // furlong-style poles every 200 m to go, and the post
    for (let left = 200; left < d; left += 200) {
      const p = toScreen(pointAt(d, d - left, -1.4));
      ctx.fillStyle = "#d7b77d";
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, 0.45 * s), 0, Math.PI * 2);
      ctx.fill();
      if (s > 3) {
        ctx.font = `600 ${Math.max(10, Math.min(13, 0.9 * s))}px system-ui, sans-serif`;
        ctx.fillStyle = "rgba(241,238,228,0.75)";
        ctx.fillText(`${left} m`, p.x + 6, p.y - 6);
      }
    }
    const a = toScreen(pointAt(d, d, -0.8));
    const b = toScreen(pointAt(d, d, lanes + 0.8));
    ctx.strokeStyle = "#f1eee4";
    ctx.lineWidth = Math.max(2, 0.25 * s);
    ctx.setLineDash([0.8 * s, 0.8 * s]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const post = toScreen(pointAt(d, d, -1.6));
    ctx.fillStyle = "#c8453b";
    ctx.beginPath();
    ctx.arc(post.x, post.y, Math.max(4, 0.9 * s), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f1eee4";
    ctx.beginPath();
    ctx.arc(post.x, post.y, Math.max(2, 0.45 * s), 0, Math.PI * 2);
    ctx.fill();
  }

  drawHorse(ctx, r, toScreen, s) {
    const card = this.byKey.get(r.key);
    const p = pointAt(this.data.distance, r.x, r.lane);
    const at = toScreen(p);
    s *= DRAW;
    const len = 2.4 * s;
    const wid = 0.75 * s;
    const stride = Math.sin((r.x / 2.6) * Math.PI * 2); // one cycle per stride
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(p.heading);
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0.15 * s, 0.25 * s, len * 0.55, wid * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (card?.mine) {
      ctx.strokeStyle = "rgba(226,197,142,0.9)";
      ctx.lineWidth = Math.max(1.5, 0.16 * s);
      ctx.beginPath();
      ctx.ellipse(0, 0, len * 0.72, wid * 1.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // legs: four short strokes, scissoring with the stride
    ctx.strokeStyle = card?.coat ?? "#7a4b2e";
    ctx.lineWidth = Math.max(1, 0.16 * s);
    for (const [fx, side, phase] of [[0.75, -1, 1], [0.75, 1, -1], [-0.7, -1, -1], [-0.7, 1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(fx * s, side * wid * 0.45);
      ctx.lineTo((fx + 0.35 * stride * phase) * s, side * wid * 0.95);
      ctx.stroke();
    }
    // body, neck and head
    ctx.fillStyle = card?.coat ?? "#7a4b2e";
    ctx.beginPath();
    ctx.ellipse(0, 0, len * 0.5, wid * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(len * 0.52, 0, len * 0.2, wid * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    // mane and tail
    ctx.strokeStyle = card?.mane ?? "#241a14";
    ctx.lineWidth = Math.max(1, 0.14 * s);
    ctx.beginPath();
    ctx.moveTo(len * 0.18, 0);
    ctx.lineTo(len * 0.5, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-len * 0.48, 0);
    ctx.lineTo(-len * (0.68 + 0.04 * stride), 0.1 * s * stride);
    ctx.stroke();
    // saddle cloth under the rider
    ctx.fillStyle = card?.mine ? "#e2c58e" : "#f1eee4";
    ctx.fillRect(-0.45 * s, -wid * 0.52, 0.8 * s, wid * 1.04);
    // jockey: silks colour by stable, cap
    const silk = SILKS[hashString(card?.stable ?? r.key) % SILKS.length];
    ctx.fillStyle = silk;
    ctx.beginPath();
    ctx.ellipse(0.05 * s, 0, 0.42 * s, 0.32 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f1eee4";
    ctx.beginPath();
    ctx.arc(0.32 * s, 0, 0.16 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // saddle-cloth number, upright
    if (s > 2.2) {
      ctx.font = `700 ${Math.max(9, Math.min(13, 0.85 * s))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = String(card?.number ?? "");
      const bx = at.x;
      const by = at.y - wid * 1.4;
      ctx.fillStyle = card?.mine ? "#e2c58e" : "rgba(14,23,18,0.82)";
      ctx.fillRect(bx - 0.6 * s, by - 0.45 * s, 1.2 * s, 0.9 * s);
      ctx.fillStyle = card?.mine ? "#201c13" : "#f1eee4";
      ctx.fillText(label, bx, by + 0.5);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  }

  /* ---------- HUD: order, clock, calls ---------- */

  updateHud(runners) {
    const t = Math.min(this.t, this.raceEnd);
    this.clock.textContent = `${t.toFixed(1)} s`;
    const left = Math.max(0, Math.round(this.leaderLeft));
    this.toGo.textContent = left > 0 ? `faltam ${left} m` : "chegada";
    const leader = runners[0];
    const rows = runners.slice(0, 8).map((r, i) => {
      const card = this.byKey.get(r.key);
      const li = el("li", card?.mine ? "mine" : "");
      // after the post a gap is a time, before it a distance in lengths
      const gap = i === 0 ? "" : r.done !== null && leader.done !== null
        ? `+${(r.done - leader.done).toFixed(2)} s`
        : `+${Math.max(0.1, (Math.min(leader.x, this.data.distance) - r.x) / LENGTH_M).toFixed(1)} c`;
      li.append(el("b", "", String(card?.number ?? i + 1)), el("span", "", shortName(card?.name) || r.key), el("small", "", gap));
      return li;
    });
    this.board.replaceChildren(...rows);
    // race calls: a change at the front, the turn for home, the last 200
    if (this.playing) {
      if (this.leaderKey && leader.key !== this.leaderKey && leader.x > 100) this.say(`${shortName(this.byKey.get(leader.key)?.name)} assume a ponta!`);
      if (!this.saidStraight && this.leaderLeft < COURSE.straight && this.leaderLeft > 0) {
        this.saidStraight = true;
        this.say(`Reta final — ${shortName(this.byKey.get(leader.key)?.name)} na frente.`);
      }
      if (!this.said200 && this.leaderLeft < 200 && this.leaderLeft > 0) {
        this.said200 = true;
        const chaser = runners[1] ? shortName(this.byKey.get(runners[1].key)?.name) : null;
        this.say(chaser ? `Últimos 200 metros: ${shortName(this.byKey.get(leader.key)?.name)}, ${chaser} ataca!` : "Últimos 200 metros!");
      }
    }
    this.leaderKey = leader.key;
  }

  say(text) {
    if (this.call.textContent === text) return;
    this.call.textContent = text;
  }

  showResult() {
    const winner = this.byKey.get(this.data.placings[0].key);
    this.say(this.data.deadHeat ? "Empate na foto de chegada!" : `${winner?.name} vence!`);
    const box = this.resultBox;
    box.replaceChildren();
    box.append(el("p", "rs-eyebrow", this.data.deadHeat ? "Foto de chegada · empate" : "Resultado"));
    box.append(el("h3", "", `${winner?.name} vence`));
    const list = el("ol", "rs-podium");
    const first = this.data.placings[0].time;
    for (const placing of this.data.placings) {
      const card = this.byKey.get(placing.key);
      const li = el("li", card?.mine ? "mine" : "");
      const gap = placing.position === 1 ? `${placing.time.toFixed(2)} s` : `+${(placing.time - first).toFixed(2)} s`;
      li.append(el("b", "", String(placing.position)), el("span", "", card?.name ?? placing.key), el("em", "", card?.stable ?? ""), el("small", "", gap));
      list.append(li);
    }
    box.append(list);
    box.append(el("p", "rs-note", "Exibição: simulada pelo motor causal, não altera resultados, saldo nem histórico."));
    box.hidden = false;
    this.call.hidden = true;
  }
}

/**
 * The sound of a race, synthesised: no samples, no downloads. A start bell, the field's
 * hoofbeats at the pace the race is being played, and a crowd that rises through the home
 * straight and cheers the finish. Every call is guarded: a browser without audio, or one
 * that refuses to start it, simply gets a silent race.
 */
export class RaceAudio {
  constructor() {
    this.enabled = false;
    this.ctx = null;
  }

  ensure() {
    if (this.ctx) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      // two seconds of brown noise, reused by the crowd and the hooves
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i += 1) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = last * 3.5;
      }
      const crowd = ctx.createBufferSource();
      crowd.buffer = buffer;
      crowd.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 850;
      band.Q.value = 0.6;
      const crowdGain = ctx.createGain();
      crowdGain.gain.value = 0;
      crowd.connect(band).connect(crowdGain).connect(master);
      crowd.start();
      Object.assign(this, { ctx, master, buffer, crowdGain, nextBeat: 0 });
      return true;
    } catch {
      return false;
    }
  }

  start({ bell }) {
    if (!this.enabled || !this.ensure()) return;
    this.ctx.resume?.().catch(() => {});
    this.nextBeat = this.ctx.currentTime + 0.05;
    if (bell) this.bell();
  }

  bell() {
    try {
      const now = this.ctx.currentTime;
      for (const [freq, level] of [[1318.5, 0.18], [2637, 0.06]]) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(level, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
        osc.connect(gain).connect(this.master);
        osc.start(now);
        osc.stop(now + 1.5);
      }
    } catch { /* a silent bell is still a start */ }
  }

  /** Called every drawn frame. pace: playback rate; excitement: 0 at the start, 1 at the post. */
  update({ pace, excitement, field }) {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(0.025 + 0.22 * excitement * excitement, now, 0.4);
    // a field gallops at ~2.3 strides a second; at 2x playback it sounds twice as fast
    const stride = 1 / (2.3 * Math.max(0.3, pace));
    const loud = Math.min(0.32, 0.1 + field * 0.015);
    while (this.nextBeat < now + 0.12) {
      const at = Math.max(this.nextBeat, now);
      for (const offset of [0, 0.055, 0.11, 0.17]) this.hoof(at + offset + Math.random() * 0.012, loud * (0.7 + Math.random() * 0.3));
      this.nextBeat = at + stride;
    }
  }

  hoof(at, level) {
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      const low = this.ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 260;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(level, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      src.connect(low).connect(gain).connect(this.master);
      src.start(at, Math.random() * 1.5, 0.08);
    } catch { /* one missed beat */ }
  }

  cheer() {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const g = this.crowdGain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0.42, now + 0.25);
      g.setTargetAtTime(0.03, now + 1.2, 1.1);
    } catch { /* silence */ }
  }

  pause() {
    this.ctx?.suspend?.().catch(() => {});
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.pause();
  }

  stop() {
    try { this.ctx?.close(); } catch { /* already closed */ }
    this.ctx = null;
  }
}
