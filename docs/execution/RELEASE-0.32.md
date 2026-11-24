# Publicação 0.32.0 — 24/11/2026

## Publicado e verificado

- Página inicial: https://studbook.fly.dev/
- Jogo: https://studbook.fly.dev/play
- Prévia 3D: https://studbook.fly.dev/horse-3d
- Código da imagem publicada: `3c2ad997531d457825ae096b7fd0839cda8f8e21`.
- PR #2 mesclado em main. O merge tem SHA diferente da imagem; alterações documentais posteriores não exigem novo build do aplicativo.
- `/api/health` confirmou versão 0.32.0, revisão esperada, seis contas e manutenção desligada.
- Verificação administrativa confirmou preservação das cinco associações de estábulo existentes e disponibilidade da chave do backup no ambiente seguro do Fly.

## Entrega visível

Nova página de chegada com apresentação do jogo, entrada/criação de conta e acesso público à prévia. Botão 3D dentro do estábulo, com dados do cavalo selecionado lidos da conta ou claramente identificados como demo offline. Retorno ao jogo sem perda do save no teste de fluxo.

A prévia é experimental e usa um modelo compartilhado; não é a aparência genética definitiva de cada cavalo nem corrida ao vivo. Modelo/rig/clips e limites de licença estão em assets/models/NOTICE.txt.

## Validação

- 234 verificações funcionais locais aprovadas.
- Nove testes de navegador cobertos; um timeout local de execução foi rechecado com sucesso, sem relaxar a asserção de largura.
- CI final aprovado em push e pull_request:
  - https://github.com/lsraiva/studbook/actions/runs/45404816520
  - https://github.com/lsraiva/studbook/actions/runs/45404835750
- Teste isolado de cadastro online -> estábulo -> cavalo 3D -> retorno, com saldo preservado.
- No site publicado: homepage, login e viewer verificados no navegador; modelo leve e seis clips carregaram sem pageerrors; mobile sem overflow.
- Restauração local do backup validou contas/estábulos sem modificar os arquivos. Uma conta já estava sem sala antes do deploy; não foi apagada nem recriada automaticamente durante manutenção.

## Backup e recuperação

Cópia mais recente anterior ao deploy, AES-256-GCM:
https://d2ol7oe51mr4n9.cloudfront.net/user_3KyFSDOS9fOAEJYue9ZEhXEnxpo/bc7fadb9-d8d9-40d6-8e0c-96e385f3a578.zip

Chave: secret do Fly `STUDBOOK_BACKUP_KEY_20261124`. Não está no ZIP, Git, documentos nem prompts. Confirmada no aplicativo após deploy. Preserve esse secret em cofre seguro antes de excluir/recriar o app. O backup é pontual; política recorrente de backup externo/PITR ainda é trabalho futuro.

O envelope backup.enc.json contém iv, tag e ciphertext em base64, com chave hexadecimal de 32 bytes e SHA-256 do plaintext. O plaintext é JSON com files[{name,data(base64)}]. Descriptografar e validar hash somente em ambiente privado; restaurar primeiro fora de /data. Nunca publicar o conteúdo descriptografado.

## Limites e próximos passos

Ainda faltam Postgres/ledger transacional completo, rate limits de autenticação, email real, identidade visual por animal, LOD/performance em aparelhos físicos, motor causal de corrida ao vivo, multiplayer live e NFT real auditado.

A publicação foi autorizada pelo proprietário. Foram mantidos CPU/memória/volume da aplicação; não foram comprados assets nem geradas mídias pagas. O build remoto/deploy usa a infraestrutura existente do Fly; cobrança normal do provedor continua aplicável.

Leia ../HANDOFF.md e PLAN-INDEX.md para continuar em outro modelo. Revogue/substitua os acessos temporários expostos na conversa; não os copie para o novo modelo.
