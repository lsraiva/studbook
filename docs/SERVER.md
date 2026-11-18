# The server

The rules run on the server. The browser sends an action and receives a view; it never holds the
state, the seed, the prices or a balance. That single boundary is what makes cheating a rejected
request instead of a rewritten save.

## Run it

```bash
node server/index.mjs          # game + API on http://127.0.0.1:8787
```

Open that address, create an account, and the stable follows the account instead of the browser.
The server also serves `index.html` and `assets/`, so there is nothing to build and nothing else to
start. Data lives in `server/data/` (users, sessions, one JSON per game).

| Env | Default | What it does |
|---|---|---|
| `PORT` | `8787` | listen port |
| `DATA_DIR` | `server/data` | accounts, sessions, saves |
| `ALLOWED_ORIGINS` | `*` | CORS allow-list, comma separated, for a client on another origin |
| `ACTION_LIMIT` / `ACTION_WINDOW_MS` | `40` / `10000` | per-account action rate limit |
| `SESSION_DAYS` | `30` | token lifetime |

## Host it

Two configs are in the repo, ready: `fly.toml` (Fly.io, with a volume and a health check) and
`render.yaml` (Render blueprint). Both expect this Dockerfile and mount the save volume at `/data`.

```bash
# Fly.io
fly launch --no-deploy --copy-config
fly volumes create studbook_data --size 1
fly deploy

# Render: New > Blueprint > this repo > Apply. Nothing to type.
```

I cannot create the account for you — Fly and Render both require a verified billing identity — so
these two files are the deploy, minus the account.

Anything that runs Node 22 with a disk will do; the app has zero dependencies.

```bash
docker build -t studbook .
docker run -p 8787:8787 -v studbook-data:/data studbook
```

On a PaaS: start command `node server/index.mjs`, a persistent volume mounted at `/data`, and
`DATA_DIR=/data`. Put TLS in front of it (the token travels in an `Authorization` header, so the
transport must be HTTPS).

## Point the page at it

1. Same origin — the page served by the server picks it up on its own (`/api/health`).
2. Another origin, permanently: set `SERVER_URL` in `assets/config.js`.
3. Another origin, once: `https://lsraiva.github.io/studbook/?server=https://your-host`.

With none of those, the game plays offline and saves in `localStorage`, which is the current
GitHub Pages behaviour — Pages is static, so it cannot host the API.

## What the server refuses

The suite `tests/server.test.mjs` proves each of these from outside, over HTTP:

- coin packs and testing grants (`addCoins`, `testGrant`, a 50.000 bank);
- a price above the ceiling, a horse that is not yours, a lot of the wrong kind;
- a forged `state` or `view` in the request body — ignored, the server's state wins;
- an `openWindow` that asks for a week: clamped to 300 s, and `closeWindow` before the deadline;
- more than 40 actions per 10 s — 429.

## Accounts

Email and password, hashed with `scrypt` (N=16384) and a per-user salt, compared in constant time.
Sessions are opaque 256-bit tokens, stored server-side with an expiry, sent as `Bearer`. No
password ever leaves the server, and no token is written into a URL.

## Known limits

- One account, one game: accounts are not yet pooled into a shared room, so the rivals are still
  the house's three stables. The engine already supports several seats.
- Saves are one JSON file per account, written atomically. That is fine for a few thousand
  accounts and a bad idea at scale — swap the storage functions for Postgres when it matters.
- No email verification and no password reset yet.

## Accounts out of prototype

| Endpoint | What it does |
|---|---|
| `POST /api/verify {code}` | confirms the address the account was opened with (six digits, 15 min) |
| `POST /api/recover {email}` | sends a reset code; the answer is identical for unknown addresses, so it cannot be used to probe accounts |
| `POST /api/reset {email, code, password}` | replaces the password and **kills every old session** |

Mail has no provider in this build: `deliver()` writes the code to the server log, and with
`DEV_MAIL=1` it also returns it in the response so the flow can be finished and tested locally.
Wiring Resend, Postmark or a webhook means replacing that one function.

## Backups

```bash
node tools/backup.mjs                          # ./server/data/backups/<stamp>/
DATA_DIR=/data node tools/backup.mjs           # on Fly
fly ssh console -C "DATA_DIR=/data node tools/backup.mjs"
fly ssh sftp get /data/backups/<stamp> ./backups   # pull it off the machine
```

Each backup is a readable copy — `users.json`, `sessions.json`, `rooms/` and a `manifest.json` —
keeping the last seven. `BACKUP_KEEP` changes that. Run it from a cron outside Fly (a scheduled
GitHub Action with `flyctl ssh`) or by hand before a deploy: it is a copy, not a dump format, so any
file you can `cat` you can restore.
