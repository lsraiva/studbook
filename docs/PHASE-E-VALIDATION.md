# Fase E — validação da vinculação de carteira

**Escopo:** sair de `unclaimed`, assinar e cunhar — da tela até a API.
**Ambiente de produção:** `https://studbook.fly.dev/` · cliente `v0.30.0` · servidor com `MINT_MODE=simulated`.
**Data:** 2026-11-23.

---

## 1. Resultado

| | |
|---|---|
| Casos executados | **19** (12 de interface + 7 de produção) |
| Passaram | 19 |
| Falharam | 0 |
| Pendências para fechar a fase | 4 (seção 4) |

**A fase funciona de ponta a ponta no modo simulado.** Um cavalo sai de `unclaimed`, vira `pending`,
é assinado com ECDSA real e termina `minted` com um id de token — verificado contra o servidor de
produção e contra a interface.

---

## 2. Produção — requisições reais, 23/11

| # | Passo | Requisição | Resultado |
|---|---|---|---|
| P1 | versão servida | `GET /` | `ui.js?v=0.30.0` |
| P2 | saúde | `GET /api/health` | `{"ok":true,"cloud":true,"accounts":5}` |
| P3 | conta nova | `POST /api/register` | `201`, sala `3E71BB` |
| P4 | estado inicial | `GET /api/mints` | `unclaimed` |
| P5 | vincular carteira | `POST /api/wallet` | `200 {"wallet":"0x…a11ce"}` |
| P6 | transição | `GET /api/mints` | `pending` (1) |
| P7 | assinar | `POST /api/mints/sign` | `200`, `mode simulated`, assinatura DER de 71 bytes |
| P8 | cunhar | `POST /api/mints/confirm` | `200`, token `900001`, `status minted`, `tx sim:e893fe7791e5` |

---

## 3. Interface — `tests/wallet-ui.test.mjs`, 19 asserções

O app real é montado em jsdom contra uma API que devolve o mesmo formato do servidor.

| # | Caso | Resultado |
|---|---|---|
| U1 | a aba Ledger mostra o painel de tokens | ✅ |
| U2 | o cavalo começa `unclaimed` | ✅ |
| U3 | o campo de carteira é oferecido | ✅ |
| U4 | o campo existe e tem rótulo acessível | ✅ |
| U5 | o botão de vincular existe | ✅ |
| U6 | endereço malformado é recusado **antes** de qualquer chamada | ✅ |
| U7 | a tela chama `POST /api/wallet` | ✅ |
| U8 | com o endereço digitado | ✅ |
| U9 | autenticada com o token de sessão | ✅ |
| U10 | o cavalo passa para `pending` | ✅ |
| U11 | o botão `mint` aparece | ✅ |
| U12 | clicar em `mint` chama `POST /api/mints/sign` | ✅ |
| U13 | e depois `POST /api/mints/confirm` | ✅ |
| U14 | com o mesmo nullifier nas duas chamadas | ✅ |
| U15 | o cavalo termina `minted` | ✅ |
| U16 | mostrando o id do token | ✅ |
| U17 | o botão `mint` desaparece | ✅ |
| U18 | nada lança exceção na vinculação | ✅ |
| U19 | nada lança exceção no mint | ✅ |

---

## 4. Pendências para fechar a fase

| # | Pendência | Por que importa | Dono |
|---|---|---|---|
| 1 | **Tela para trocar/remover carteira** | hoje vincula uma vez; endereço errado fica errado | eu |
| 2 | **Relayer real (`MINT_MODE=chain`)** | o modo simulado não publica; falta assinatura com a chave da Sepolia e leitura do recibo | eu + chaves suas |
| 3 | **Link para o explorer** | no simulado não há chain para linkar; entra junto com o item 2 | eu |
| 4 | **Falha de assinatura/conexão** | se o RPC cair no meio, a tela precisa dizer e permitir repetir — hoje o erro aparece e o botão volta a habilitar, sem teste | eu |

---

## 5. Passos para fechar a fase

1. Tela de troca de carteira (item 1) + teste de UI: vincular, trocar, tentar vincular endereço inválido.
2. `MINT_MODE=chain` com as chaves da Sepolia: assinar com a `minter`, transmitir, ler o recibo e gravar `txHash` real (item 2).
3. Link `https://sepolia.etherscan.io/token/<nft>?a=<tokenId>` na coluna de recibo (item 3).
4. Teste de falha: RPC desligado no meio do mint, botão volta, mensagem clara (item 4).
5. Rodar de novo esta matriz com o relayer real e anexar os hashes.

**Critério de pronto da fase:** um cavalo nascido no jogo aparece em `sepolia.etherscan.io` com o genoma
empacotado que o servidor assinou, e um segundo mint do mesmo cavalo reverte.
