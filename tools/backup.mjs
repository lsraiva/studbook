#!/usr/bin/env node
/**
 * Backup. Copies accounts, sessions and every room into a timestamped folder and keeps the last
 * N. No dependencies, no cloud: a backup you can read with `cat`.
 *
 *   node tools/backup.mjs                 # ./server/data → ./server/data/backups/<stamp>/
 *   DATA_DIR=/data node tools/backup.mjs  # on Fly: fly ssh console -C "node tools/backup.mjs"
 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR ?? join(root, "server", "data");
const keep = Number(process.env.BACKUP_KEEP ?? 7);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = join(dataDir, "backups", stamp);

const exists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

await mkdir(target, { recursive: true });

const counts = {};
for (const file of ["users.json", "sessions.json"]) {
  if (await exists(join(dataDir, file))) {
    await cp(join(dataDir, file), join(target, file));
    counts[file] = "copied";
  }
}
if (await exists(join(dataDir, "rooms"))) {
  await cp(join(dataDir, "rooms"), join(target, "rooms"), { recursive: true });
  counts.rooms = (await readdir(join(dataDir, "rooms"))).filter((f) => f.endsWith(".json")).length;
}

await writeFile(
  join(target, "manifest.json"),
  JSON.stringify({ stamp: new Date().toISOString(), source: dataDir, counts }, null, 2),
);

// keep the newest N, drop the rest
const all = (await readdir(join(dataDir, "backups"))).filter((name) => /^\d{4}-/.test(name)).sort();
for (const old of all.slice(0, Math.max(0, all.length - keep))) {
  await rm(join(dataDir, "backups", old), { recursive: true, force: true });
}

console.log(`backup ${stamp}: ${JSON.stringify(counts)} · kept ${Math.min(all.length, keep)} of ${all.length}`);
