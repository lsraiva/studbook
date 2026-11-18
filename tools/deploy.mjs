#!/usr/bin/env node
/**
 * Deploy the three contracts to a testnet, idempotently.
 *
 *   node tools/deploy.mjs --dry-run         # compiles, validates env, prints the plan, sends nothing
 *   node tools/deploy.mjs                   # deploys what is missing and writes the manifest
 *
 * Env: RPC_URL, MINTER_KEY (never in argv), CHAIN_ID (default 11155111), TREASURY_ADDRESS,
 *      MINTER_ADDRESS (defaults to the key's address).
 *
 * Idempotency: an address in contracts/deployments.<network>.json is reused when it still has code
 * on chain, so running twice does not deploy twice. A changed constructor argument is refused
 * rather than silently redeployed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contractsDir = join(root, "contracts");
const requireFrom = (base, name) => createRequire(join(base, "noop.js"))(name);
const load = (name, what) => {
  for (const base of [root, process.cwd()]) {
    try {
      return requireFrom(base, name);
    } catch {
      /* next */
    }
  }
  console.error(`${name} is not installed: npm i --no-save ${what}`);
  process.exit(2);
};

const solc = load("solc", "solc@0.8.24 @openzeppelin/contracts@5.0.2");
const { JsonRpcProvider, Wallet, ContractFactory, getAddress, isAddress } = load(
  "ethers",
  "ethers@6 @openzeppelin/contracts@5.0.2",
);

const dryRun = process.argv.includes("--dry-run");
const chainId = Number(process.env.CHAIN_ID ?? 11155111);
const network = Number(process.env.CHAIN_ID ?? 11155111) === 11155111 ? "sepolia" : `chain-${chainId}`;
const manifestPath = join(contractsDir, `deployments.${network}.json`);

/* ------------------------------------------------------------------ compile */

const files = ["HorsePacked.sol", "HorseNFT.sol", "CoveringToken.sol", "HorseMarket.sol"];
const sources = Object.fromEntries(
  files.map((file) => [file, { content: readFileSync(join(contractsDir, file), "utf8") }]),
);

const output = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources,
      settings: {
        optimizer: { enabled: true, runs: 200 },
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
    {
      import: (path) => {
        for (const base of [resolve(root, "node_modules"), resolve(process.cwd(), "node_modules")]) {
          const file = resolve(base, path);
          if (existsSync(file)) return { contents: readFileSync(file, "utf8") };
        }
        return { error: `not found: ${path}` };
      },
    },
  ),
);

const errors = (output.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const error of errors) console.error(error.formattedMessage.split("\n")[0]);
  process.exit(1);
}
const artifact = (file, name) => output.contracts[file][name].evm.bytecode.object;

/* --------------------------------------------------------------------- plan */

if (!dryRun) {
  if (!process.env.RPC_URL) {
    console.error("RPC_URL is required (unless --dry-run)");
    process.exit(2);
  }
  if (!process.env.MINTER_KEY) {
    console.error("MINTER_KEY is required (unless --dry-run) — keep it in env, never in argv");
    process.exit(2);
  }
}

const wallet = dryRun ? null : new Wallet(process.env.MINTER_KEY);
const minter = process.env.MINTER_ADDRESS ?? wallet?.address ?? "0x0000000000000000000000000000000000000000";
const treasury = process.env.TREASURY_ADDRESS ?? minter;
if (!isAddress(minter) || !isAddress(treasury)) {
  console.error("MINTER_ADDRESS / TREASURY_ADDRESS must be addresses");
  process.exit(2);
}

const plan = [
  { name: "HorseNFT", file: "HorseNFT.sol", args: [getAddress(minter)], check: "server" },
  { name: "CoveringToken", file: "CoveringToken.sol", args: [getAddress(minter)], check: "server" },
  {
    name: "HorseMarket",
    file: "HorseMarket.sol",
    args: ["<HorseNFT>", "<CoveringToken>", getAddress(treasury), getAddress(minter)],
    check: "server",
  },
];

console.log(`network ${network} (chainId ${chainId}) · deployer ${dryRun ? "(dry run)" : wallet.address}`);
console.log(`minter ${minter} · treasury ${treasury}`);

if (dryRun) {
  for (const step of plan) console.log(`would deploy ${step.name}(${step.args.join(", ")}) — ${artifact(step.file, step.name).length / 2} bytes`);
  console.log("\ndry run: nothing sent, no manifest written");
  process.exit(0);
}

/* ------------------------------------------------------------------- deploy */

const provider = new JsonRpcProvider(process.env.RPC_URL, chainId, { staticNetwork: true });
const signer = wallet.connect(provider);
const balance = await provider.getBalance(signer.address);
if (balance === 0n) {
  console.error(`the deployer ${signer.address} has no ETH on ${network} — use the faucet first`);
  process.exit(2);
}
console.log(`balance ${balance.toString()} wei`);

const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { contracts: {} };
const manifest = {
  network,
  chainId,
  deployedAt: previous.deployedAt ?? new Date().toISOString(),
  deployer: signer.address,
  minter: getAddress(minter),
  treasury: getAddress(treasury),
  contracts: { ...previous.contracts },
};

const save = () => writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const addressOf = (name) => manifest.contracts?.[name]?.address ?? null;

async function stillThere(address) {
  try {
    return (await provider.getCode(address)) !== "0x";
  } catch {
    return false;
  }
}

for (const step of plan) {
  const args = step.args.map((arg) =>
    arg === "<HorseNFT>" ? addressOf("HorseNFT") : arg === "<CoveringToken>" ? addressOf("CoveringToken") : arg,
  );
  if (args.includes(null)) {
    console.error(`cannot deploy ${step.name}: a dependency is missing from the manifest`);
    process.exit(1);
  }

  const before = manifest.contracts?.[step.name];
  if (before?.address && (await stillThere(before.address))) {
    const argsMatch = JSON.stringify(before.args) === JSON.stringify(args);
    if (!argsMatch) {
      console.error(
        `${step.name} already lives at ${before.address} with different arguments.\n` +
          `  on chain: ${JSON.stringify(before.args)}\n  requested: ${JSON.stringify(args)}\n` +
          "Refusing to deploy a second copy: change the manifest deliberately if that is what you want.",
      );
      process.exit(1);
    }
    console.log(`reusing ${step.name} at ${before.address}`);
    continue;
  }

  console.log(`deploying ${step.name}…`);
  const factory = new ContractFactory(
    output.contracts[step.file][step.name].abi,
    artifact(step.file, step.name),
    signer,
  );
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const receipt = await contract.deploymentTransaction().wait();
  const address = await contract.getAddress();

  // it must answer with the minter it was built with, or the manifest would lie
  const wired = await contract[step.check]();
  if (getAddress(wired) !== getAddress(minter)) {
    console.error(`${step.name}.${step.check}() is ${wired}, expected ${minter}`);
    process.exit(1);
  }

  manifest.contracts[step.name] = {
    address,
    txHash: receipt.hash,
    block: receipt.blockNumber,
    args,
  };
  manifest.deployedAt = new Date().toISOString();
  save(); // written after each step: a crash leaves a true manifest, not an empty one
  console.log(`  ${step.name} → ${address} (tx ${receipt.hash})`);
}

console.log(`\nmanifest written to contracts/deployments.${network}.json`);
