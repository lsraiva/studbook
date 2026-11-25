/**
 * The racecourse: one oval shared by the simulation and the picture.
 *
 * A left-handed oval of two straights and two semicircular bends. A race of any distance
 * finishes at the end of the home straight; its start is found by walking back along the
 * rail. The same geometry yields the engine's bend sections (so an outer lane really costs
 * ground) and the scene's drawing coordinates (so what is drawn is what was simulated).
 * Pure ES module, no imports, no DOM.
 */

export const COURSE = Object.freeze({
  straight: 420, // m, each straight
  radius: 100, // m, inner rail of each bend; must match the engine's bendRadius
  laneWidth: 1.2, // m, must match the engine's laneWidth
});

const PI = 3.141592653589793;
export const lapLength = (course = COURSE) => 2 * course.straight + 2 * PI * course.radius;

/**
 * Loop coordinate s (metres from the finish post, increasing in running direction, wrapping
 * every lap) → which section it is on. Running order from the post: home bend… no — the post
 * sits at the END of the home straight, so after it come: bend A, back straight, bend B,
 * home straight (ending at the post).
 */
function section(s, course) {
  const L = lapLength(course);
  const bend = PI * course.radius;
  let t = ((s % L) + L) % L;
  if (t < bend) return { kind: "bendA", t };
  t -= bend;
  if (t < course.straight) return { kind: "back", t };
  t -= course.straight;
  if (t < bend) return { kind: "bendB", t };
  return { kind: "home", t: t - bend };
}

/**
 * Bend sections in race metres (0 = start, distance = finish) for the engine.
 */
export function bendsFor(distance, course = COURSE) {
  const L = lapLength(course);
  const bend = PI * course.radius;
  const startS = -distance; // loop coordinate of the start
  const out = [];
  // bend A occupies [0, bend) and bend B [bend+straight, 2*bend+straight) on every lap
  for (let lap = -Math.ceil(distance / L) - 1; lap <= 1; lap += 1) {
    for (const [a, b] of [[0, bend], [bend + course.straight, 2 * bend + course.straight]]) {
      const from = lap * L + a - startS;
      const to = lap * L + b - startS;
      const lo = Math.max(0, from);
      const hi = Math.min(distance, to);
      if (hi > lo) out.push([lo, hi]);
    }
  }
  return out.sort((p, q) => p[0] - q[0]);
}

/**
 * Race metre x and lane → plane coordinates in metres (origin at the oval's centre, y down,
 * home straight at the bottom running left→right, races run anticlockwise on screen).
 * Returns { x, y, heading } with heading in radians (direction of travel).
 */
export function pointAt(distance, raceMetre, lane, course = COURSE) {
  const s = raceMetre - distance; // loop coordinate: the post is s = 0
  const { kind, t } = section(s, course);
  const r = course.radius + lane * course.laneWidth;
  const half = course.straight / 2;
  switch (kind) {
    case "bendA": { // right-hand end, from bottom to top
      const a = PI / 2 - t / course.radius; // angle from +x axis, y down
      return { x: half + r * Math.cos(a), y: r * Math.sin(a), heading: a - PI / 2 };
    }
    case "back": // top straight, right → left
      return { x: half - t, y: -r, heading: PI };
    case "bendB": { // left-hand end, from top to bottom
      const a = -PI / 2 - t / course.radius;
      return { x: -half + r * Math.cos(a), y: r * Math.sin(a), heading: a - PI / 2 };
    }
    default: // home straight, left → right, ending at the post (x = +half)
      return { x: -half + t, y: r, heading: 0 };
  }
}

/** The finishing post in plane coordinates (inner rail). */
export const finishPost = (course = COURSE) => ({ x: course.straight / 2, y: course.radius });
