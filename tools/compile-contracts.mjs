#!/usr/bin/env node
/**
 * Compile the contracts with solc-js, resolving OpenZeppelin from node_modules.
 *   npm i --no-save solc@0.8.24 @openzeppelin/contracts@5.0.2
 *   node tools/compile-contracts.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = createRequire(import.meta.url);
const fromCwd = createRequire(join(process.cwd(), "noop.js"));
const load = (name) => {
  try {
    return fromCwd(name);
  } catch {
    return here(name);
  }
};
let solc;
try {
  solc = load("solc");
} catch {
  console.error("solc is not installed: npm i --no-save solc@0.8.24 @openzeppelin/contracts@5.0.2");
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "contracts");
// .t.sol are Foundry tests, not part of the deployable build
const files = readdirSync(root).filter((f) => f.endsWith(".sol") && !f.endsWith(".t.sol"));
const sources = Object.fromEntries(files.map((f) => [f, { content: readFileSync(join(root, f), "utf8") }]));

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.deployedBytecode.object"] } },
  },
};

const out = JSON.parse(
  solc.compile(JSON.stringify(input), {
    import: (path) => {
      try {
        const local = resolve(process.cwd(), "node_modules", path);
        const beside = resolve(dirname(fileURLToPath(import.meta.url)), "..", "node_modules", path);
        return { contents: readFileSync(existsSync(local) ? local : beside, "utf8") };
      } catch {
        return { error: `not found: ${path}` };
      }
    },
  }),
);

const errors = (out.errors ?? []).filter((e) => e.severity === "error");
for (const e of out.errors ?? []) console.log(e.severity.toUpperCase(), e.formattedMessage.split("\n")[0]);
for (const [file, contracts] of Object.entries(out.contracts ?? {})) {
  for (const [name, c] of Object.entries(contracts)) {
    console.log(`OK ${name} (${file}) — ${c.evm.deployedBytecode.object.length / 2} bytes, ${c.abi.length} ABI entries`);
  }
}
process.exit(errors.length ? 1 : 0);
