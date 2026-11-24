/**
 * F4-06 — race seeds that players cannot predict.
 *
 * seed = HMAC-SHA256(secret, "race:" + raceId + ":" + nonce), first 128 bits.
 * The secret is server-only runtime config (RACE_SEED_SECRET); public ids alone never
 * determine a race. The nonce is drawn when entries close, so a seed cannot be known
 * while entries are still open. Publishing secret-derived commitments for later audit
 * (commit–reveal) is a follow-up for live rooms (F6).
 */
import { createHmac, randomBytes } from "node:crypto";

export function newRaceNonce() {
  return randomBytes(16).toString("hex");
}

export function deriveRaceSeed({ secret, raceId, nonce }) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("race seed secret missing or too short");
  if (typeof raceId !== "string" || !raceId) throw new Error("race id required");
  if (typeof nonce !== "string" || !/^[0-9a-f]{32}$/.test(nonce)) throw new Error("nonce must be 128-bit hex");
  return createHmac("sha256", secret).update(`race:${raceId}:${nonce}`).digest("hex").slice(0, 32);
}

/** Commitment that can be published before the race and checked after the reveal. */
export function seedCommitment(seed) {
  return createHmac("sha256", "studbook-race-commit").update(seed).digest("hex");
}
