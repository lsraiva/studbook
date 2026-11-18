# Multiplayer

The rule that makes it work: **the world turns on a clock, never on a click.** A player decides what
to enter and when to enter it; the server decides when the meeting closes.

## Rooms

A room is one game state with several human seats — the engine already carried more than one stable,
so a seat is a stable, not a rewrite.

| Piece | Value |
|---|---|
| Room | `id`, six-character `code`, `state`, `closesAt`, `version` |
| Seats | up to 12 humans (plan said 8–16; the server enforces 12) |
| Joining | `POST /api/room/join { code }` — a wrong code is 404, a full room is 409 |
| Solo room | a meeting closes every `SOLO_SECONDS` (default 120) |
| League room | two or more humans: every `MEETING_SECONDS` (default 12 h) |

A new account gets its own room. Joining someone else's dissolves the old room if it held nobody
else, and takes the seat on the target: the engine's `takeSeat` action provisions the stable.

## The clock

```
POST /api/action { type: "advance" }  →  400 "the meeting closes on the clock — enter your runners and wait"
```

No client action moves the world. A scheduler inside the server runs every 2 s and, for every room
whose deadline has passed, calls `runRound` once for that room, persists it and re-arms the clock.
Everyone seated in the room advances together; nobody has to be online. That is the acceptance test:
two browsers in one room, one of them closed, and the season still turns.

## What the client shows

In a room the "run the meeting" button disappears and a line takes its place:

> room 956F2C · 2 seats · meeting 2 closes in 11h 58m

A solo player also gets a code field: *join a friend*. The countdown is computed from the server's
deadline, so a wrong client clock cannot hurry anything.

## Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/api/room` | the room's state and deadline |
| POST | `/api/room/join` | join by code |
| POST | `/api/action` | any game action except `advance` |
| GET | `/api/ranking` | the public table, across every room, without e-mails |

## Not yet

- Promotion and relegation between leagues; the ranking is still one global table.
- Per-league tables and season calendars.
- Presence (who is online), chat, invitations by link.
- Late joiners inheriting a season already under way — today they seat mid-season with a fresh yard.

## Config

| Env | Default | Meaning |
|---|---|---|
| `MEETING_SECONDS` | `43200` | deadline in a room with two or more humans |
| `SOLO_SECONDS` | `120` | deadline while a room has one human |
