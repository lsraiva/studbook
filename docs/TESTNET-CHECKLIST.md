# Checklist de lançamento — testnet (P5)

**Definição de pronto:** um cavalo nascido no jogo tem token na Sepolia; um segundo mint do mesmo
cavalo reverte; a venda passa pelo escrow e paga 93/5/2; a queima preserva o pedigree; e qualquer
pessoa consegue ver o token no explorer.

Datas relativas a **18/11/2026** (D0). Dono: **V** = você · **A** = agente · **VA** = os dois.

---

## Fase A — decisões e regras (D0–D1)

| # | Item | Dono | Prazo | Aceite |
|---|---|---|---|---|
| A1 | Congelar as três decisões do `docs/NFT-FLOW.md`: moeda do mercado = GNS, royalty = 2% à dona da égua no parto, cavalo sem carteira = claim em 12 meses | V | D1 | escrito no documento, sem "a definir" |
| A2 | Definir `minter` (carteira quente, saldo baixo) e `treasury` (recebe o rake) | V | D1 | dois endereços, sendo diferentes |
| A3 | Confirmar rede: **Sepolia** (chainId 11155111), `rulesVersion = 1` | VA | D1 | anotado no repo |
| A4 | Validar as 8 invariantes abaixo contra o código | A | D2 | cada linha com ✅ e onde está provado |

### Invariantes a validar (as regras que o token não pode quebrar)

| # | Invariante | Onde está provado hoje |
|---|---|---|
| 1 | Um cavalo = um token (nullifier derivado do animal) | `server/index.mjs` · `tests/server.test.mjs` (mint confirmado uma vez) |
| 2 | Cobertura queima ao ser usada | motor (`breed` consome) + `CoveringToken.burn` |
| 3 | Genoma 48 bits + pedigree no mesmo word | `assets/token.js` · `tests/token.test.mjs` · `HorsePacked.t.sol` |
| 4 | Listagem = escrow; cavalo listado não corre | motor (`listHorse` tira do estábulo) + `HorseMarket.listHorse` |
| 5 | Split 93/5/2 e decaimento com piso 20 | `HorseMarket.quote/currentPrice` |
| 6 | Queima preserva `coreOf`/`creatorOf` | `HorseNFT.burn` (não apaga) |
| 7 | Royalty EIP-2981 a 2% | `HorseNFT.royaltyInfo` |
| 8 | Versão de regras por token | `core` bits 144–159 |

## Fase B — chaves e infraestrutura (D1–D3)

| # | Item | Dono | Prazo | Aceite |
|---|---|---|---|---|
| B1 | Conta em provedor RPC (Alchemy/Infura) com app Sepolia | V | D2 | URL `https://…` funcionando |
| B2 | Faucet Sepolia para a `minter` (0,3–0,5 ETH) | V | D2 | saldo no explorer |
| B3 | `fly secrets set RPC_URL=… CHAIN_ID=11155111 MINTER_ADDRESS=0x… TREASURY_ADDRESS=0x… MINTER_KEY=0x…` | V | D3 | `fly secrets list` mostra os cinco |
| B4 | Nunca commitar a chave; `.gitignore` cobre `.env` | A | D3 | `git grep` vazio |
| B5 | Plano de rotação: se a `minter` vazar, `setMinter` no contrato e novo deploy de chave | A | D3 | procedimento escrito em `docs/SERVER.md` |

## Fase C — contratos (D3–D6)

| # | Item | Dono | Prazo | Aceite |
|---|---|---|---|---|
| C1 | `node tools/compile-contracts.mjs` limpo | A | feito | 4 contratos, < 24 KB cada |
| C2 | Rodar `HorsePacked.t.sol` no Foundry (vetor compartilhado) | A | D4 | `forge test` verde |
| C3 | Script de deploy idempotente, gravando `contracts/deployments.sepolia.json` | A | D5 | endereços + tx hashes no repo |
| C4 | Deploy na Sepolia: `HorseNFT(minter)` → `CoveringToken(minter)` → `HorseMarket(nft, cover, treasury, minter)` | VA | D6 | 3 endereços no explorer |
| C5 | Verificar código no Etherscan (API key opcional) | V | D6 | source publicado |

## Fase D — relayer no servidor (D6–D9)

| # | Item | Dono | Prazo | Aceite |
|---|---|---|---|---|
| D1 | Assinatura do mint: keccak256 puro + ECDSA secp256k1 sobre o core empacotado | A | D8 | teste de assinatura verificando com a chave pública |
| D2 | `POST /api/mints/sign` devolve payload + assinatura; `MINT_ENABLED=false` desliga tudo | A | D8 | teste com flag ligada/desligada |
| D3 | Confirmação automática: ouvir eventos `HorseMinted` (ou polling de recibo) e marcar `minted` | A | D9 | intent muda de `pending` para `minted` sozinho |
| D4 | Reconciliação: `GET /api/mints` mostra o estado real da chain depois de restart | A | D9 | teste de restart no meio do fluxo |
| D5 | Limite de mints por dia e por conta | A | D9 | 429 acima do limite |

## Fase E — tela (D9–D10)

| # | Item | Dono | Prazo | Aceite |
|---|---|---|---|---|
| E1 | Painel "your tokens": estados `unclaimed / pending / minted / failed` | A | D10 | legível em celular |
| E2 | Link para o explorer por token | A | D10 | abre o token certo |
| E3 | Fluxo de carteira: vincular, trocar, aviso de endereço inválido | A | D10 | teste de UI |

## Fase F — prova de ponta a ponta (D10–D13)

| # | Item | Dono | Prazo | Aceite |
|---|---|---|---|---|
| F1 | Conta → cobertura → parto → token na Sepolia | VA | D11 | token visível no explorer |
| F2 | Mintar duas vezes o mesmo cavalo | A | D11 | segundo reverte (`AlreadySpent`) |
| F3 | Vender no mercado: escrow, 93/5/2, decaimento | A | D12 | três saldos conferidos no explorer |
| F4 | Queimar e checar que o filho ainda resolve o pai | A | D12 | `genomeOf(burnedId)` responde |
| F5 | Falhas: RPC fora, gas insuficiente, saldo insuficiente | A | D13 | cada uma com mensagem e retry |
| F6 | Relatório de testnet publicado em `docs/` com os hashes | A | D13 | link verificável |

## Fase G — operação (D13–D14)

| # | Item | Dono | Prazo | Aceite |
|---|---|---|---|---|
| G1 | `MINT_ENABLED=false` documentado como botão de pânico | A | feito | 1 linha de env |
| G2 | Backup do volume antes e depois do deploy | V | D14 | dois backups em `/data/backups` |
| G3 | Monitoramento: `/api/health` + erro de mint logado | A | D14 | alerta simples (uptime robot) |

## Fora de escopo da testnet

Mainnet, entrada de GNS por fiat/crypto, auditoria externa (é gate da **mainnet**, não da testnet),
Postgres e promoção entre divisões. Misturar isso aqui atrasa o que importa: provar o ciclo na chain.

---

## Caminho crítico

```
A1/A2 (decisões e carteiras) → B1/B2 (RPC + faucet) → C4 (deploy) → D1/D2 (assinatura) → F1 (primeiro token)
```

Tudo antes de C4 depende de você; de D1 em diante, depende de mim. Se A1 e A2 saírem hoje, o
primeiro token na Sepolia cai em **D11**.
