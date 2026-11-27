/**
 * "Enquanto você esteve fora": what happened in the stable between two visits.
 *
 * An online room runs its meetings on the clock whether or not its owner is looking, so a
 * player can come back to a different yard. This keeps a small snapshot of what the player last
 * saw (in this browser) and, on the next visit, says what changed: meetings run, races, wins,
 * prize money, the balance, foals born, horses that left. An honest reason to open the game
 * again; nothing here is invented, it is a difference between two views.
 */

/** The few facts of a view worth comparing later. */
export function snapshotOf(v) {
  const per = v.meetingsPerSeason ?? 4;
  const horses = (v.horses ?? []).map((h) => ({
    id: h.id, name: h.name, starts: h.starts ?? 0, wins: h.wins ?? 0, places: h.places ?? 0,
    earnings: h.earnings ?? 0, retired: Boolean(h.retired), age: h.age ?? 0,
  }));
  return {
    at: Date.now(),
    season: v.season ?? 1,
    meeting: v.round ?? 1,
    clock: ((v.season ?? 1) - 1) * per + (v.round ?? 1),
    per,
    guineas: v.stable?.guineas ?? 0,
    horses,
  };
}

/**
 * What changed from `prev` (a snapshot) to `now` (a snapshot). Returns null when no meeting was
 * run in between: there is nothing to tell.
 */
export function computeRecap(prev, now) {
  if (!prev || !now || !(now.clock > prev.clock)) return null;
  const before = new Map(prev.horses.map((h) => [h.id, h]));
  const after = new Map(now.horses.map((h) => [h.id, h]));
  let starts = 0, wins = 0, places = 0, prizes = 0;
  const winners = [];
  for (const h of now.horses) {
    const was = before.get(h.id);
    const d = { starts: h.starts - (was?.starts ?? 0), wins: h.wins - (was?.wins ?? 0), places: h.places - (was?.places ?? 0), earnings: h.earnings - (was?.earnings ?? 0) };
    if (d.starts <= 0) continue;
    starts += d.starts; wins += Math.max(0, d.wins); places += Math.max(0, d.places); prizes += Math.max(0, d.earnings);
    if (d.wins > 0 || d.places > 0) winners.push({ id: h.id, name: h.name, wins: Math.max(0, d.wins), places: Math.max(0, d.places), earnings: Math.max(0, d.earnings) });
  }
  winners.sort((a, b) => b.wins - a.wins || b.earnings - a.earnings || b.places - a.places);
  const born = now.horses.filter((h) => !before.has(h.id) && h.age <= 1).map((h) => ({ id: h.id, name: h.name }));
  const arrived = now.horses.filter((h) => !before.has(h.id) && h.age > 1).map((h) => ({ id: h.id, name: h.name }));
  const left = prev.horses.filter((h) => !after.has(h.id)).map((h) => ({ id: h.id, name: h.name }));
  const retired = now.horses.filter((h) => h.retired && before.get(h.id) && !before.get(h.id).retired).map((h) => ({ id: h.id, name: h.name }));
  const meetings = now.clock - prev.clock;
  return {
    meetings,
    seasons: Math.floor(meetings / now.per),
    restMeetings: meetings % now.per,
    awayMs: Math.max(0, now.at - prev.at),
    starts, wins, places, prizes,
    balance: now.guineas - prev.guineas,
    star: winners[0] ?? null,
    winners: winners.slice(0, 3),
    born, arrived, left, retired,
  };
}

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const nf = (n) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
const plural = (n, one, many) => `${nf(n)} ${n === 1 ? one : many}`;

/** How long, said the way a person would. */
export function awayText(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 90) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return plural(hours, "hora", "horas");
  return plural(Math.round(hours / 24), "dia", "dias");
}

/**
 * Show the recap over the page.
 * @param recap  from computeRecap
 * @param o      { portrait(id) -> HTMLImageElement|null, onShare(id)?, onClose?() }
 */
export function showRecap(recap, o = {}) {
  document.querySelector(".recap-stage")?.remove();
  const stage = el("div", "recap-stage");
  stage.setAttribute("role", "dialog");
  stage.setAttribute("aria-modal", "true");
  stage.setAttribute("aria-label", "Enquanto você esteve fora");
  stage.setAttribute("data-no-i18n", "");
  const card = el("div", "recap-card");
  card.append(el("p", "recap-eyebrow", "Enquanto você esteve fora"));
  const span = recap.seasons
    ? `${plural(recap.seasons, "temporada", "temporadas")}${recap.restMeetings ? ` e ${plural(recap.restMeetings, "reunião", "reuniões")}` : ""}`
    : plural(recap.meetings, "reunião", "reuniões");
  card.append(el("h2", "", `${span} ${recap.meetings === 1 ? "foi disputada" : "se passaram"}`));
  card.append(el("p", "recap-sub", `Você ficou ${awayText(recap.awayMs)} longe do haras.`));

  // the best moment first
  if (recap.star) {
    const star = el("div", "recap-star");
    const pic = o.portrait?.(recap.star.id);
    if (pic) star.append(pic);
    const copy = el("div", "recap-star-copy");
    const did = recap.star.wins
      ? `venceu ${plural(recap.star.wins, "corrida", "corridas")}`
      : `chegou entre os primeiros ${recap.star.places === 1 ? "uma vez" : `${nf(recap.star.places)} vezes`}`;
    copy.append(el("b", "", recap.star.name), el("span", "", `${did} · ₲ ${nf(recap.star.earnings)} em prêmios`));
    if (o.onShare) {
      const share = el("button", "tiny", "Compartilhar cartão");
      share.type = "button";
      share.addEventListener("click", () => o.onShare(recap.star.id));
      copy.append(share);
    }
    star.append(copy);
    card.append(star);
  }

  const tiles = el("dl", "recap-tiles");
  const tile = (label, value, tone = "") => {
    const box = el("div", tone);
    box.append(el("dd", "", value), el("dt", "", label));
    tiles.append(box);
  };
  tile("corridas", nf(recap.starts));
  tile("vitórias", nf(recap.wins), recap.wins ? "good" : "");
  tile("prêmios", `₲ ${nf(recap.prizes)}`);
  tile("saldo", `${recap.balance >= 0 ? "+" : "−"}₲ ${nf(Math.abs(recap.balance))}`, recap.balance >= 0 ? "good" : "bad");
  card.append(tiles);

  const lines = el("ul", "recap-lines");
  const names = (list) => list.slice(0, 4).map((h) => h.name).join(", ") + (list.length > 4 ? ` e mais ${nf(list.length - 4)}` : "");
  if (recap.born.length) {
    const li = el("li", "born");
    li.append(el("b", "", plural(recap.born.length, "potro nasceu", "potros nasceram")), el("span", "", names(recap.born)));
    lines.append(li);
  }
  if (recap.arrived.length) { const li = el("li"); li.append(el("b", "", plural(recap.arrived.length, "cavalo chegou", "cavalos chegaram")), el("span", "", names(recap.arrived))); lines.append(li); }
  if (recap.retired.length) { const li = el("li"); li.append(el("b", "", plural(recap.retired.length, "cavalo se aposentou", "cavalos se aposentaram")), el("span", "", names(recap.retired))); lines.append(li); }
  if (recap.left.length) { const li = el("li"); li.append(el("b", "", plural(recap.left.length, "cavalo deixou o haras", "cavalos deixaram o haras")), el("span", "", names(recap.left))); lines.append(li); }
  if (!recap.starts) { const li = el("li"); li.append(el("b", "", "Nenhum cavalo seu correu"), el("span", "", "inscreva até três corredores para a próxima reunião")); lines.append(li); }
  if (lines.children.length) card.append(lines);

  const go = el("button", "brass", "Ver meu haras");
  go.type = "button";
  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    stage.remove();
    o.onClose?.();
  };
  const onKey = (event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } };
  go.addEventListener("click", close);
  document.addEventListener("keydown", onKey, true);
  card.append(go);
  stage.append(card);
  document.body.append(stage);
  go.focus();
  return { close };
}
