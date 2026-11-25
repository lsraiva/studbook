# Release 0.35.0 — interface em português

## Escopo

- Camada `assets/i18n.js` traduz a chrome inteira do jogo: abas, cabeçalho, tabelas, filtros, botões, estados vazios, avisos e mensagens de erro.
- Erros da API são traduzidos no transporte (`assets/net.js`), não apenas na tela.
- Textos dinâmicos preservam nomes de cavalos, estábulos, e-mails e números.
- `index.html` passou para `lang="pt-BR"` e título/descrição em português.
- Landing, gate e banner de modo já estavam em PT; agora o jogo alinha com eles.

## O que NÃO foi traduzido por completo

Textos editoriais longos gerados pelo motor (explicações de páreo, diagnóstico de corrida e algumas frases de conselho) foram traduzidos apenas quando cobertos pelo dicionário. A auditoria de tela deixou um pequeno resíduo de frases do motor em inglês. Não declarar “100% traduzido”: a próxima etapa é mover esses textos para chaves de idioma no engine, em vez de depender de correspondência de frases.

## Preservação

- Nenhuma regra, saldo, genética, pedigree ou contrato alterado.
- Nenhuma migração ou recurso novo.
- Nomes próprios e dados do jogador não passam pelo tradutor.
- jsdom roda em inglês por design (fixtures existentes), enquanto o navegador real usa PT.

## Verificação

- `npm test`: 303+ checks, incluindo 5 casos de i18n.
- Browser: abas e ação principal em PT; banner offline em PT; 360 px sem overflow.
- Auditoria visual: chrome, títulos, tabelas, filtros e botões em português; resíduo conhecido apenas em frases longas do motor.
