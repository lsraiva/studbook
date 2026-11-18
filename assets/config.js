/**
 * Where the authoritative server lives.
 *
 * Same origin (the server serves the game itself) wins; otherwise SERVER_URL below; otherwise
 * ?server=https://host. With none of those, the game plays offline and saves in this browser.
 */
const query = new URLSearchParams(globalThis.location?.search ?? "");
export const SERVER_URL = (query.get("server") ?? "").replace(/\/+$/, "");
export const HAS_QUERY_SERVER = Boolean(SERVER_URL);
