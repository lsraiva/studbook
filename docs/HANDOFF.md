# Studbook — continuidade em outro modelo

## Pedido do proprietário

Continuar o Studbook existente, economizando créditos e sem recomeçar o projeto. O proprietário autorizou publicar a página de entrada e a prévia 3D no Fly. Não autorizou compras externas de assets, dinheiro real, mainnet ou criação indiscriminada de infraestrutura.

## Onde trabalhar

- Repositório: https://github.com/lsraiva/studbook
- Produção: https://studbook.fly.dev
- GitHub Pages de referência: https://lsraiva.github.io/studbook/
- Consulte `GET /api/health` para versão e revisão efetivamente publicadas. Não assuma que HEAD e produção são iguais.
- Trabalho desta linha começou no PR #2, branch `fix/foundation-gates-20261123`. Verifique estado atual do PR/branches antes de continuar.

## Arquitetura real

Aplicação Node 22, módulos JavaScript, HTML/CSS, sem framework obrigatório e sem build de frontend principal. Fly atende API e arquivos públicos. `assets/engine.js` é a regra, `assets/ui.js` é a interface, `server/index.mjs` contém API/contas/calendário. Dados ainda ficam em JSON no volume `/data`; Postgres NÃO foi implementado.

O renderer 3D usa Three.js. Fonte em `visual-source/`; build `npm run build:visual`; artefatos servidos em `horse-3d.html`, `assets/horse-viewer-v032.*` e `assets/models/`. O build do Docker recebe COMMIT_SHA e o expõe em `/api/health` para rastreabilidade.

## O que já existe

- Correções de clique duplicado, calendário autoritativo e reset online proibido.
- Allowlist de arquivos públicos, proteção contra traversal/symlink e testes.
- Correções de overflow mobile e testes Playwright.
- Transferências elegíveis de estábulo preservam saldo/IDs/genoma/cobertura por journal durável de um único escritor. Leia `docs/execution/ROOM-TRANSFER.md` antes de mexer.
- Página de entrada `welcome.html`, com CTAs para jogar e abrir 3D. No Fly, `/` abre essa página; `/play` ou `/index.html` abre o jogo; `/horse-3d` ou `/horse-3d.html` abre a prévia.
- Botão no estábulo envia o ID do cavalo ao viewer. No online, os dados vêm de `/api/me` autenticado; no offline, são explicitamente dados de demonstração. Tokens NÃO vão na URL.
- O modelo 3D ainda é compartilhado entre os cavalos. Não alegar que cada NFT já possui aparência genética única.
- Dois perfis: Leve 8,91 MB (1K) e Alta 18,44 MB (2K). Rig de 116 ossos, seis movimentos e morph Original/Estudo.
- O modelo tem base de cavalo de tração com refinamento conservador; ainda não é um puro-sangue final. Performance em hardware físico não foi certificada.
- Nada de corrida 3D ao vivo integrado ainda. A corrida atual do jogo é resolvida pelo motor existente e apresentada em replay.

## Testes e comandos

```text
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run contracts
npm run build:visual
```

`npm test` inclui regras, packing, UI, carteira simulada, servidor, transferências e falhas de storage. CI também testa navegador e compila contratos. Compilar não equivale a auditoria EVM.

Para rodar: `node server/index.mjs` (API + site) ou `node tools/serve.mjs` (somente demo estática). Não colocar fixtures no volume real. `STUDBOOK_MAINTENANCE=1` pausa POSTs e o scheduler para validação/restauração isolada; não deixe ligado em produção por engano.

## Proteção dos dados e deploy

Antes desta publicação foi criado backup cifrado AES-256-GCM fora do Fly e testada a restauração local com os arquivos do aplicativo. Foram encontrados 6 usuários e 5 estábulos/salas; uma conta já estava sem sala antes da alteração. Não recriar nem apagar patrimônio automaticamente para esconder esse estado legado.

Backup cifrado: https://d2ol7oe51mr4n9.cloudfront.net/user_3KyFSDOS9fOAEJYue9ZEhXEnxpo/81e69cf6-11d0-468f-959a-5a05e81f5383.zip
A chave está sob um secret do Fly chamado `STUDBOOK_BACKUP_KEY_20261124`, não neste documento. O ZIP não contém a chave. Restaurar primeiro em diretório/ambiente isolado; nunca sobrescrever `/data` sem novo backup e conciliação.

Topologia observada: uma máquina shared CPU, 256 MB, região ams, volume criptografado de 1 GB. Não aumentar recursos nem criar réplica/serviços pagos sem orçamento aprovado. O journal atual depende de um único processo escritor; não escalar horizontalmente antes do Postgres.

## Plano completo e tarefas

Veja `docs/execution/PLAN-INDEX.md`, `docs/execution/STATUS.md` e os documentos completos vinculados ali. São 10 fases F0–F9 e 61 tarefas; não trate toda a F1 ou F3 como concluída.

Próximas prioridades:
1. Conferir o deploy real e o fluxo entrar -> estábulo -> 3D -> voltar em aparelhos físicos.
2. Revisar detalhes da entrada/estábulo com feedback do proprietário, sem novas gerações desnecessárias.
3. F1-06/F1-07: rate limit de autenticação, recuperação de senha/email real, tratamento de falhas de gravação e isolamento cloud/offline.
4. F2: Postgres, ownership global, ledger/transações/idempotência/outbox, importação reconciliada e réplica antes de dinheiro real.
5. F3: silhueta atlética final, identidade visual por animal e LOD/performance física. Licença dos modelos continua aplicável.
6. F4/F5: motor de corrida contínuo e determinístico, posições/fadiga/tática/ultrapassagem; chegada determina resultado. Só depois apresentação completa na pista.
7. F6: multiplayer live com reconnect/fencing/snapshots. Liga por prazo usa estratégias fechadas e não dá vantagem oculta por presença online.
8. F7: alpha com jogadores, carga, recuperação e observabilidade.
9. F8/F9: testnet, reconciliação e auditoria externa; mainnet/dinheiro real exigem nova autorização.

## Regras que não devem mudar silenciosamente

Preservar criação/genética/pedigree e o plantel existente. Mercado em GNS com taxa de 5%; beneficiário do royalty de criação de 2% definido pelo dono da égua no parto; claim de 12 meses para elegíveis sem carteira, com política detalhada antes da ativação. Não prometer valorização financeira.

A licença do modelo 3D permite uso dentro do projeto, não revenda do GLB como asset/NFT isolado nem falsa autoria. Leia `assets/models/NOTICE.txt`. A licença MIT do código não substitui a do modelo.

## Acessos

O proprietário forneceu credenciais temporárias na conversa e deve revogá-las/substituí-las. NÃO copie chaves de histórico, documentos ou prompts. Use integração segura/segredos de escopo mínimo. Nenhuma credencial é necessária para ler este repositório público e executar testes locais.

## Prompt para entregar ao próximo modelo

“Continue o Studbook em https://github.com/lsraiva/studbook. Leia primeiro docs/HANDOFF.md, docs/execution/STATUS.md e PLAN-INDEX.md. Confira HEAD, PRs e /api/health antes de alterar. Reaproveite código, assets e testes; não recomece nem declare plano como implementação. Trabalhe em lotes pequenos, preserve dados e respeite os gates do plano. Não faça compras, migrações ou novas operações financeiras sem aprovação. Quero gráficos 3D de realismo estilizado premium e corrida causal ao vivo, mantendo o jogo de criação. Relate resultados e bloqueios de forma curta, com economia de tokens.”
