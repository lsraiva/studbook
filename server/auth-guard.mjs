/**
 * Authentication throttling (F1-06). In-memory and single-process on purpose:
 * the server is a single writer until Postgres (F2); a restart forgets counters,
 * which only ever loosens a limit, never locks a player out permanently.
 */
import { timingSafeEqual } from "node:crypto";

/** Sliding-window counter keyed by an arbitrary string (ip:…, email:…). */
export function createWindowLimiter({ limit, windowMs, now = () => Date.now(), maxKeys = 50_000 }) {
  const hits = new Map(); // key -> number[]
  const recent = (key) => {
    const t = now();
    const list = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  };
  return {
    /** Seconds until the key may try again, or 0 when it is under the limit. */
    retryAfter(key) {
      const list = recent(key);
      if (list.length < limit) return 0;
      return Math.max(1, Math.ceil((list[0] + windowMs - now()) / 1000));
    },
    hit(key) {
      const list = recent(key);
      list.push(now());
      hits.set(key, list);
      if (hits.size > maxKeys) hits.delete(hits.keys().next().value); // bounded memory under a flood
    },
    clear(key) {
      hits.delete(key);
    },
    size: () => hits.size,
  };
}

/**
 * The client address. Behind Fly's proxy every request comes from the proxy, so the
 * edge-set Fly-Client-IP header is used — but only when running on Fly, where the edge
 * overwrites it. Locally the socket address is the truth and the header is ignored.
 */
export function clientAddress(req, { trustFly = Boolean(process.env.FLY_APP_NAME) } = {}) {
  const forwarded = trustFly ? req.headers["fly-client-ip"] : null;
  const value = typeof forwarded === "string" && forwarded.trim() ? forwarded.trim() : req.socket?.remoteAddress ?? "unknown";
  return value.slice(0, 64);
}

/** Constant-time comparison of two short codes; unequal lengths still take a compare. */
export function sameCode(given, expected) {
  const a = Buffer.from(String(given ?? ""), "utf8");
  const b = Buffer.from(String(expected ?? ""), "utf8");
  if (a.length !== b.length || !b.length) {
    timingSafeEqual(b.length ? b : Buffer.alloc(1), b.length ? b : Buffer.alloc(1));
    return false;
  }
  return timingSafeEqual(a, b);
}
