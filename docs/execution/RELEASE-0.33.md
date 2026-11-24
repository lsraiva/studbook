# Publicação 0.33.0 — identidade visual individual

## Publicado e verificado

- Produção: https://studbook.fly.dev — versão 0.33.0, revisão `564bd0c4839eef6b77ecc99476d8ee2d580e9050`, manutenção desligada, 6 contas preservadas.
- Cartão premium: selo SB de demonstração, pedigree curto, textura de papel, hierarquia revisada e sem colisões no rodapé.
- Viewer mobile: alvos de toque ≥44 px, painel recomposto, sombras/pixel ratio reduzidos e enquadramento adaptativo; testado em 390×844.
- Limitação preservada: o 3D ainda não reproduz com exatidão crina e todas as meias porque a textura base está baked. Corrigir exige separar malha/materiais de crina, cauda, face e membros — não apenas shader. Não declarar paridade 3D/ficha concluída.
- Fluxo publicado testado no navegador: entrar na demo offline → cartão de pelagem → viewer 3D → mesmo cavalo.
- O fluxo publicado abriu cartão e viewer sem pageerrors; a conferência exata de crina/meias no 3D segue pendente pela limitação acima.
- Sem migração de dados, compra de assets ou geração paga de mídia.

## Objetivo e limites

Cada cavalo recebe agora uma aparência própria e estável — pelagem, crina/cauda, marcas faciais e meias — em vez de um retrato genérico apenas por linhagem.

A identidade é derivada do **id público** do cavalo e da linhagem, por função pura e determinística. Não usa genótipo oculto, não revela traits não certificados e **não altera desempenho**. Ainda não é um simulador de genética de pelagem: dois filhos não herdam automaticamente a cor dos pais; isso permanece trabalho futuro.

## Onde aparece

- Cartão do estábulo: retrato de linhagem tonalizado para a pelagem do animal, mais faixa compacta com pelagem, marca facial e meias.
- linha do plantel (amostra compacta; oculta em telas estreitas para não alargar a tabela).
- ficha detalhada do cavalo.
- cavalo no mercado.
- viewer 3D: tinta de pelagem, cor de crina/cauda, meias e marca facial; o nome da pelagem aparece na ficha lateral.
- A mesma função alimenta todos os pontos, portanto o mesmo cavalo mantém a aparência ao alternar estábulo, mercado e 3D.

## Implementação

- `assets/phenotype.js`: 8 pelagens, 4 tipos de marca facial e 0–4 meias; hash FNV-1a estável; nenhuma aleatoriedade em tempo de execução; filtro de cor do retrato e validação/escape do markup SVG.
- Reutiliza o símbolo de cavalo já existente na interface, sem novos arquivos de arte.
- Shader do viewer aplica pelagem/marcações sobre o material `coat_B`; a crina/cauda usa o material `hair`. O morph anatômico e as seis animações permanecem.
- Nenhuma migração de dados: a aparência é calculada a partir de campos já existentes, e por isso vale imediatamente para cavalos antigos.

## Validação

- 7 novos casos unitários: determinismo, independência de genótipo, unicidade de seeds, cobertura de todas as pelagens/marcas/meias, coerência rótulo↔meias, cores seguras e markup sem injeção.
- `npm test`: 241 verificações, zero falhas.
- Testes de navegador: identidade estável estábulo→3D→estábulo, ficha/linha coerentes, layout 360/390/430/1440 px, sem overflow.
- Inspeção visual: cartão mostra pelagem e meias; viewer mostra cavalo com marcações (blaze/meias) e tinta correta.
- Performance física continua não certificada; SwiftShader não representa aparelho real.

## Riscos e pendências

- Aparência não é usada em metadata NFT/on-chain; a identidade on-chain continua trabalho da F8.
- Aparência individual não é atualmente persistida como campo do estado; sendo derivada de id+linhagem, permanece estável, mas um futuro gerador de pelagem hereditária exigirá migração/versionamento explícito.
- O modelo 3D continua com conformação de tração; textura/rig e LOD finais seguem em aberto.
- Nenhuma compra, geração paga de mídia, mudança de schema ou operação blockchain.
