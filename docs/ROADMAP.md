# Studbook — recap e plano

Atualizado em 2026-11-18, depois da sessão que foi da auditoria do arquivo único até os contratos.

---

## 1. Onde o projeto está

`main` em `4672154`, versão 0.8.0. Site no ar em `https://lsraiva.github.io/studbook/`, portão de
lançamento **6/6** (hash `a951f836…`), suítes: **31** motor · **25** packing · **12** design ·
**25** servidor.

| Camada | Estado |
|---|---|
| Motor de regras | módulo puro, determinístico, 31 asserções, fuzz de 800 ações |
| Interface | 9 telas, galeria de cavalos, palco de corrida, contraste AA medido |
| Servidor autoritativo | `server/index.mjs`, contas, sessões, saves, anti-trapaça — **testado, não hospedado** |
| Contratos | `HorseNFT`, `CoveringToken`, `HorseMarket`, `HorsePacked` — compilam, **não auditados, não deployados** |
| Arte | 4 placas (garanhão, potro, brasão, papel), 150 KB comprimidos |
| Documentação | DESIGN, ECONOMY, REVIEW, SERVER, NFT-FLOW (com diagramas), ROADMAP |

## 2. O que foi feito, em ordem

1. **Auditoria** do `index.html` (5.784 linhas): 16 achados, entre eles XSS por nome de jogador,
   moeda grátis e `NaN` nos rivais.
2. **P0**: escape de HTML, fim da moeda grátis, guardas de tipo de lote, correção do `NaN` que
   matava o mercado rival na temporada 2. Publicado com portão e suíte.
3. **Reestruturação**: arquivo único virou `engine.js` + `ui.js` + `styles.css` + testes + tools +
   docs + CI. Economia fechada (drift de +1.100 para −1,2 GNS/temporada), queima na venda à casa,
   certificação passando a comprar informação de verdade, seed por partida.
4. **Servidor autoritativo** com contas e save na nuvem: regras no servidor, view no cliente, 25
   asserções por HTTP incluindo tentativas de trapaça, restart e dois dispositivos.
5. **Design**: paleta declarada uma vez, escala tipográfica, movimento curto, tarja fixa no celular,
   contraste medido em teste, `prefers-reduced-motion`.
6. **Conteúdo**: temporada de 4 meetings, 7 pistas, prep de yearling, tack room com 3 itens,
   ranking (e `/api/ranking` público sem expor e-mail).
7. **NFT**: spec do ciclo completo (mint de cobertura consumida, escrow, decaimento, royalties,
   queima com pedigree preservado), packing de 160 bits + criador, 25 asserções e quatro contratos
   compilando em 6,4 / 5,3 / 5,3 / 0,085 KB.
8. **QA de navegador**: cinco etapas verificadas (abertura, cobertura inicial, tack room, ranking,
   corrida com resultado completo). **Uma falha**: cruzar a égua não faz nada.

## 3. O que está aberto e não é opinião

| # | Dívida | Consequência |
|---|---|---|
| 1 | **"Breed" sem efeito** — corrigi a divergência de seleção, o sintoma persistiu; clique agora delegado e recusas ficam na tela, mas falta a prova de ponta a ponta | trava o tutorial, o parto, a corrida com plantel próprio e a economia |
| 2 | **Interface sem teste** — 31 asserções no motor, zero no clique | é a causa do item 1 ter passado duas vezes |
| 3 | Servidor não hospedado | contas e nuvem existem no código, não para o jogador |
| 4 | Save em JSON por conta | adequado a milhares, não a milhões |
| 5 | Sem verificação de e-mail nem reset de senha | não é produto, é protótipo |
| 6 | Arte com 2 retratos para 8 linhagens | o teto visual atual |
| 7 | Certificação × genoma público | o certificado perde função numa chain pública |

## 4. Decisões que travam trabalho adiante

| Decisão | Recomendação | Quem trava |
|---|---|---|
| Modo multiplayer padrão | **liga com prazo** (salas de 8–16, meeting fecha em prazo fixo) | produto |
| Moeda do mercado de cavalos | **GNS** (mantém a economia medível) | produto |
| Royalty de criador | **2% ao dono da égua no parto** | produto |
| Cavalo sem carteira | **jogável off-chain, claim em 12 meses** | produto |
| Hospedagem | Fly.io (`fly.toml` pronto) | conta verificada — só você pode criar |

## 5. Plano

### P0 — fechar a ferida (agora)
- Teste de UI de verdade (jsdom ou Playwright headless): clicar em "take the first covering",
  "select", "breed" e exigir prenhez. É o primeiro teste de clique do projeto.
- Fechar o bug do breed com esse teste como prova, não com inspeção.
- **Aceite:** suíte de UI verde em CI; cruzamento funciona no navegador; `docs` atualizado.

### P1 — guiado, simples, com sorte visível (semana 1)
- **Cartão de próximo passo**: `adviceFor` já devolve a frase; o cartão ganha o botão que executa.
- **Uma frase por cavalo** (stayer promissor, sem velocidade) e os seis traços atrás de um toque.
- **Livro de sorte**: as cinco últimas rolagens com odds e resultado (92% cobertura, 3% gêmeos,
  9% ruído de corrida).
- **Corrida como história**: margem em pescoços e "o que decidiu", que o `raceDiagnosis` já calcula.
- **Aceite:** um jogador novo chega ao primeiro potro sem ler tabela nenhuma; odds exibidas são as
  do motor.

### P2 — multiplayer (semana 2)
- Trocar `advance` por `enterMeeting` (jogador) + `resolveMeeting` (servidor, no prazo).
- Salas de 8–16 estábulos; prazo por duração (não por hora do dia); inscrição automática opcional.
- Ranking por liga, com promoção e rebaixamento; o mercado segue global.
- **Aceite:** dois navegadores na mesma sala, um deles offline, e a temporada avança igual para os
  dois; nenhuma ação de cliente move o relógio.

### P3 — hospedagem e contas de verdade (semana 3)
- Deploy em Fly com volume em `/data`; TLS; backup diário do volume; rate limit em produção.
- Verificação de e-mail e reset de senha.
- **Aceite:** conta criada no celular, retomada no desktop; save sobrevive a restart e a deploy.

### P4 — arte de coleção (semana 4)
- **8 retratos, um por linhagem**; molduras por raridade; cena de parto em vez de modal numérico.
- Galeria com filtros e comparação lado a lado.
- **Aceite:** dois cavalos de linhagens diferentes não se confundem num print de 5 cm.

### P5 — NFT (mês 2)
- Aplicar as três decisões, deploy em testnet, minter ligado ao servidor, assinatura de mint,
  tabela de nullifiers, queima com pedigree.
- Auditoria externa antes de qualquer mainnet; GNS permanece off-chain.
- **Aceite:** cavalo nascido no jogo tem token correspondente; queima preserva `sireId`; auditoria
  sem findings críticos.

### P6 — retenção (contínuo)
- Metas de temporada, eventos marcados com prêmio grande, primeiras vezes (já existem) virando
  cerimônia.

## 6. Como medir sucesso

Não por preço de token. Por: % de cavalos vivos que correram na temporada; tempo até o primeiro
potro; jogadores que voltam no dia 7; corridas com 3+ inscritos; drift de GNS por temporada (tem de
seguir perto de zero); e, quando houver valor real, o rake por temporada.
