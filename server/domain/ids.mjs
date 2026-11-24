/**
 * F2-01 — global identifiers.
 *
 * Today ids are local strings (u…, r…, st…, h…). Postgres keys need to be global and the
 * import must be repeatable, so every legacy id maps to a deterministic RFC 4122 UUIDv5
 * under one Studbook namespace: importing the same JSON twice yields the same keys,
 * and nothing about a horse's identity depends on which room it now lives in.
 */
import { createHash } from "node:crypto";

/** Fixed namespace for Studbook (random v4, generated once; never change it). */
export const STUDBOOK_NAMESPACE = "3f6c1b8e-6a43-4f0e-9d4b-2a7c5e91d0b4";

const hex = (uuid) => Buffer.from(uuid.replace(/-/g, ""), "hex");

export function uuidV5(name, namespace = STUDBOOK_NAMESPACE) {
  const bytes = createHash("sha1").update(Buffer.concat([hex(namespace), Buffer.from(String(name), "utf8")])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(String(value));

/** One function per entity, so a key's meaning is written down exactly once. */
export const accountKey = (userId) => uuidV5(`account:${userId}`);
/** A stable belongs to an account, not to a room: transfers move it without changing its key. */
export const stableKey = (userId) => uuidV5(`stable:${userId}`);
/** House yards (AI stables) are per room; they never own tokenizable horses. */
export const houseStableKey = (roomId, stableId) => uuidV5(`house-stable:${roomId}:${stableId}`);
/** A horse is born once, in one room: the origin room + local id is its identity forever. */
export const horseKey = (originRoomId, horseId) => uuidV5(`horse:${originRoomId}:${horseId}`);
export const roomKey = (roomId) => uuidV5(`room:${roomId}`);
