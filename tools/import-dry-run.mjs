#!/usr/bin/env node
/**
 * F2-01 import dry run: reads a DATA_DIR copy and reports what the Postgres import would
 * produce and whether the global invariants hold. Writes nothing.
 *
 *   node tools/import-dry-run.mjs <data-dir>
 *
 * Run it only on a restored copy of the data (never on the live /data volume), and do not
 * paste its row output anywhere: it contains account emails. The summary is safe to share.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { planImport } from "../server/domain/import-plan.mjs";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node tools/import-dry-run.mjs <data-dir copy>");
  process.exit(2);
}
const users = JSON.parse(await readFile(join(dir, "users.json"), "utf8").catch(() => "[]"));
const rooms = [];
for (const name of (await readdir(join(dir, "rooms")).catch(() => [])).filter((n) => n.endsWith(".json"))) {
  rooms.push(JSON.parse(await readFile(join(dir, "rooms", name), "utf8")));
}
const plan = planImport({ users, rooms });
console.log(JSON.stringify({ ok: plan.ok, counts: plan.counts, problems: plan.problems, warnings: plan.warnings }, null, 2));
process.exit(plan.ok ? 0 : 1);
