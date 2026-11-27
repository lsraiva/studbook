/**
 * The birth, as a moment: the mare and the stallion meet, their lines cross in gold, and the
 * foal appears in its own coat and markings. Plays over the existing result card, which stays
 * underneath with every number; this scene only stages the reveal. Skippable at any time;
 * reduced motion shows the final frame at once.
 */
import { coatPortrait } from "./coat-portrait.js?v=0.38.0"; // same URL as ui.js: one module, one cache

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** A portrait in its coat, or the plain plate if painting takes too long or fails. */
function portrait(src, appearance) {
  const img = el("img");
  img.alt = "";
  img.src = src;
  if (!appearance) return { img, ready: Promise.resolve() };
  const ready = Promise.race([
    coatPortrait(src, appearance).then((url) => { img.src = url; }).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 1400)),
  ]);
  return { img, ready };
}

/**
 * @param {object} o
 *  dam, sire, foal: { name, src, appearance|null }
 *  eyebrow, tier, coat: strings already in the interface language
 *  reducedMotion, onSound(stage) optional, onDone()
 */
export function playBirth(o) {
  const stage = el("div", "birth-stage");
  stage.setAttribute("role", "dialog");
  stage.setAttribute("aria-modal", "true");
  stage.setAttribute("aria-label", `Nasce ${o.foal.name}`);
  const canvas = el("canvas", "birth-canvas");
  const top = el("p", "birth-eyebrow", o.eyebrow);
  const row = el("div", "birth-row");
  const make = (who, side) => {
    const fig = el("figure", `birth-parent ${side}`);
    const p = portrait(who.src, who.appearance);
    fig.append(p.img, el("figcaption", "", who.name));
    return { fig, ready: p.ready };
  };
  const dam = make(o.dam, "dam");
  const sire = make(o.sire, "sire");
  const foalFig = el("figure", "birth-foal");
  const foalPic = portrait(o.foal.src, o.foal.appearance);
  const name = el("h2", "birth-name", o.foal.name);
  const meta = el("p", "birth-meta", o.coat);
  const stamp = el("span", "birth-stamp", o.tier);
  foalFig.append(foalPic.img, stamp, name, meta);
  row.append(dam.fig, foalFig, sire.fig);
  const actions = el("div", "birth-actions");
  const go = el("button", "brass", "Conhecer o potro");
  go.type = "button";
  const skip = el("button", "tiny birth-skip", "Pular");
  skip.type = "button";
  actions.append(go);
  stage.append(canvas, top, row, actions, skip);
  document.body.append(stage);
  document.body.classList.add("stage-open");

  let raf = 0, done = false;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    stage.classList.add("leaving");
    setTimeout(() => {
      stage.remove();
      document.body.classList.remove("stage-open");
      o.onDone?.();
    }, o.reducedMotion ? 0 : 320);
  };
  go.addEventListener("click", finish);
  // Escape closes this scene only: the result card waiting underneath must not close with it
  const onKey = (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    document.removeEventListener("keydown", onKey);
    finish();
  };
  document.addEventListener("keydown", onKey);
  const showFinal = () => {
    stage.classList.add("revealed", "meet", "joined");
    go.focus();
  };
  skip.addEventListener("click", () => { cancelAnimationFrame(raf); showFinal(); skip.hidden = true; });

  if (o.reducedMotion) {
    showFinal();
    skip.hidden = true;
    o.onSound?.("reveal");
    return { finish };
  }

  // the gold: two streams leave the parents and braid into the foal
  const ctx = canvas.getContext("2d");
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(stage.clientWidth * dpr);
    canvas.height = Math.round(stage.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  const centre = (node) => {
    const a = node.getBoundingClientRect(), b = stage.getBoundingClientRect();
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height * 0.45 };
  };
  const sparks = [];
  let start = 0, revealed = false;
  Promise.all([dam.ready, sire.ready, foalPic.ready]).then(() => {
    requestAnimationFrame(() => stage.classList.add("meet"));
    start = performance.now();
    const tick = (now) => {
      const t = (now - start) / 1000;
      const w = stage.clientWidth, h = stage.clientHeight;
      ctx.clearRect(0, 0, w, h);
      if (t > 0.9 && t < 2.9) {
        const from = [centre(dam.fig), centre(sire.fig)];
        const to = centre(foalFig);
        for (let s = 0; s < 2; s += 1) for (let k = 0; k < 3; k += 1) {
          sparks.push({ a: from[s], b: to, p: 0, speed: 0.55 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2, side: s ? -1 : 1, size: 1.2 + Math.random() * 2.4 });
        }
      }
      for (const sp of sparks) {
        sp.p = Math.min(1, sp.p + 0.012 * sp.speed);
        // an arcing, braiding path: the two lines twist around each other on the way in
        const x = sp.a.x + (sp.b.x - sp.a.x) * sp.p;
        const lift = Math.sin(sp.p * Math.PI) * h * 0.12 * sp.side;
        const braid = Math.sin(sp.p * Math.PI * 4 + sp.phase) * 10 * (1 - sp.p);
        const y = sp.a.y + (sp.b.y - sp.a.y) * sp.p - lift + braid;
        const alpha = (1 - Math.abs(sp.p - 0.5) * 1.4) * 0.9;
        ctx.fillStyle = `rgba(232, 200, 130, ${Math.max(0, alpha)})`;
        ctx.beginPath();
        ctx.arc(x, y, sp.size * (1.4 - sp.p * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = sparks.length - 1; i >= 0; i -= 1) if (sparks[i].p >= 1) sparks.splice(i, 1);
      // the glow gathering where the foal will appear
      if (t > 1.6 && !revealed) {
        const c = centre(foalFig);
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 60 + (t - 1.6) * 140);
        g.addColorStop(0, `rgba(255, 236, 190, ${Math.min(0.85, (t - 1.6) * 0.7)})`);
        g.addColorStop(1, "rgba(255, 236, 190, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      if (t > 1.0 && !stage.classList.contains("joined")) { stage.classList.add("joined"); o.onSound?.("join"); }
      if (t > 2.9 && !revealed) {
        revealed = true;
        stage.classList.add("revealed");
        o.onSound?.("reveal");
        skip.hidden = true;
        go.focus();
      }
      if (t < 4.5 || sparks.length) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
  });
  return { finish };
}
