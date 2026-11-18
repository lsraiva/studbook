/**
 * The cloud transport. Same tiny interface as the offline socket the page already used —
 * readyState, addEventListener, send — but every message is an HTTP call to the server, which
 * owns the state. Nothing here can change a horse: the server sends a view back.
 */
const TOKEN_KEY = "hf:studbook:token";

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode: the session lasts as long as the tab */
    }
  },
};

export async function apiCall(base, path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const error = new Error(json.error ?? `server said ${res.status}`);
    error.status = res.status;
    error.code = json.code;
    throw error;
  }
  return json;
}

/** Is there an authoritative server on this origin? */
export async function detectServer() {
  try {
    const health = await apiCall("", "/api/health");
    return health?.cloud ? "" : null;
  } catch {
    return null;
  }
}

export class CloudSocket {
  constructor(base, token) {
    this.base = base;
    this.token = token;
    this.readyState = 1;
    this.listeners = { open: [], message: [], close: [] };
    setTimeout(() => this.emit("open", {}), 0);
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  emit(type, event) {
    for (const fn of this.listeners[type] || []) fn(event);
  }

  push(payload) {
    this.emit("message", { data: JSON.stringify(payload) });
  }

  async call(path, body) {
    return apiCall(this.base, path, { method: "POST", token: this.token, body });
  }

  /** Join a friend's room by code; the server answers with the room's view. */
  async joinRoom(code) {
    const out = await this.call("/api/room/join", { code });
    this.push(out.state);
    return out;
  }

  async send(raw) {
    if (raw === "__ping") return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      if (msg.type === "join") {
        const out = await apiCall(this.base, "/api/me", { token: this.token });
        this.push(out.state);
        return;
      }
      if (msg.type === "action") {
        const out = await this.call("/api/action", { action: msg.action });
        this.push(out.state);
        return;
      }
      if (msg.type === "reset") {
        const out = await this.call("/api/action", { action: { type: "startOver", bank: 2000 } });
        this.push(out.state);
      }
    } catch (error) {
      this.push({ type: "error", error: error.message });
      if (error.status === 401) {
        tokenStore.set(null);
        this.emit("close", { reason: "auth" });
      }
    }
  }
}
