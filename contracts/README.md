# Contracts

Three contracts, one job each. They are written against the flow in `docs/NFT-FLOW.md` and the
layout in `assets/token.js`. **Unaudited — do not deploy with real value before an audit.**

| File | What it is |
|---|---|
| `HorsePacked.sol` | the 160-bit core word: genome 48 · lineage 8 · sex 8 · bornSeason 16 · sireId 32 · damId 32 · rulesVersion 16 |
| `HorseNFT.sol` | ERC-721 + EIP-2981. Server-only `mint` behind a nullifier and a monotonic nonce; `burn` keeps `coreOf` and `creatorOf` |
| `CoveringToken.sol` | ERC-1155, one series per stallion per season (`id = sireId << 8 | vintage`), five a season, burned when used |
| `HorseMarket.sol` | escrow listings for horses and coverings, seasonal decay with a floor, 5% rake, 2% royalty, settlement by server voucher |

## Deploy order

```solidity
HorseNFT    nft        = new HorseNFT(server);
CoveringToken cover    = new CoveringToken(server);
HorseMarket market     = new HorseMarket(nft, cover, treasury, server);

nft.setApprovalForAll(address(market), true);   // from the seller, per wallet
```

`server` is the game's signing key. It must be a hot key with a low balance: it signs mints,
burns and settlement vouchers, and it cannot move anyone's horse without a voucher from the buyer's
own purchase flow.

## The vector both languages share

```
genome 0x3F0F0FF00FF · lineage 3 · sex 1 · bornSeason 7 · sireId 12 · damId 34 · rulesVersion 2
core   0x2000000220000000c0007010303f0f0ff00ff
```

`tests/token.test.mjs` asserts the JavaScript packer produces exactly this word; `contracts/test/
HorsePacked.t.sol` asserts the Solidity library does too. Change one side and both suites fail.

## Compile

```bash
npm i --no-save solc@0.8.24 @openzeppelin/contracts@5.0.2
node tools/compile-contracts.mjs
```

Sizes at 0.8.24, optimizer 200 runs: HorseNFT 6.4 KB · CoveringToken 5.3 KB · HorseMarket 5.3 KB —
all well under the 24 KB limit.

## Known limits

- GNS is off-chain, so the market settles by voucher; a fully on-chain currency would need an ERC-20
  and a different escrow.
- No upgradeability, deliberately.
- `listHorse` has no season argument in the simple overload; use `listHorseAt` when the decay clock
  matters.
