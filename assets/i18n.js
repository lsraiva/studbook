/**
 * Interface language: Portuguese (pt-BR).
 *
 * This layer translates only known interface copy. It never touches horse names,
 * stable names, e-mails or numbers, and it never alters game state. Unknown text
 * is left exactly as it arrived so a missing translation is visible, not guessed.
 */
const DICT = new Map(Object.entries({
  // Navigation and chrome
  "Yard": "Estábulo",
  "Racing": "Corridas",
  "Race cards": "Programa",
  "Breeding": "Criação",
  "Stud market": "Mercado de garanhões",
  "Horse market": "Mercado de cavalos",
  "Tack room": "Loja",
  "Ranking": "Ranking",
  "Ledger": "Carteira",
  "season": "temporada",
  "going:": "pista:",
  "going": "pista",
  "field": "campo",
  "avg · elite cut": "média · corte de elite",
  "stakes": "provas principais",
  "sound: on": "som: ligado",
  "sound: off": "som: desligado",
  "linking…": "conectando…",
  "connecting to the sales ring…": "conectando ao recinto de vendas…",
  "live": "ao vivo",
  "cloud": "online",
  "offline": "offline",
  "guineas": "guinéus",
  "Guineas (₲)": "Guinéus (₲)",

  // Core screens
  "Your stable": "Seu estábulo",
  "Your stable ·": "Seu estábulo ·",
  "in training": "em treinamento",
  "Your runners": "Seus corredores",
  "Race meeting ·": "Reunião ·",
  "The race": "A corrida",
  "The race cards": "Programa de corridas",
  "Your coverings ·": "Suas coberturas ·",
  "The covering": "A cobertura",
  "Your mares": "Suas éguas",
  "Requests ·": "Pedidos ·",
  "Stallion catalogue ·": "Catálogo de garanhões ·",
  "Horse market ·": "Mercado de cavalos ·",
  "The world market": "Mercado global",
  "The tack room": "Loja",
  "The stud book table": "Tabela do stud book",
  "Your table": "Sua mesa",
  "Your tokens": "Seus tokens",
  "Account": "Conta",
  "Standings": "Classificação",
  "Rivals": "Rivais",
  "The week": "A semana",
  "Your foals ·": "Seus potros ·",
  "What the numbers mean": "O que significam os números",
  "Getting started": "Primeiros passos",
  "Testing tools": "Ferramentas de teste",
  "Sales catalogue": "Catálogo de vendas",

  // Table headings and fields
  "Horse": "Cavalo",
  "Sex": "Sexo",
  "Age": "Idade",
  "Value": "Valor",
  "Form": "Forma",
  "Upkeep": "Manutenção",
  "Entry": "Inscrição",
  "Mare": "Égua",
  "Stable": "Estábulo",
  "Horses": "Cavalos",
  "Best": "Melhor",
  "Instruction": "Instrução",
  "Covering": "Cobertura",
  "Going": "Pista",
  "Stakes": "Provas principais",
  "Rake": "Taxa",
  "Inbreeding": "Endogamia",
  "Upkeep per season": "Manutenção por temporada",

  // Buttons and actions
  "take it": "pegar",
  "take it · ₲ 20": "pegar · ₲ 20",
  "take the first covering in your account · ₲ 20": "pegar a primeira cobertura da conta · ₲ 20",
  "cover her with it": "cobrir a égua",
  "enter": "inscrever",
  "breed": "cruzar",
  "consign": "consignar",
  "select": "selecionar",
  "certify": "certificar",
  "use": "usar",
  "clear": "limpar",
  "buy": "comprar",
  "sell": "vender",
  "sell horse": "vender cavalo",
  "withdraw": "retirar",
  "cancel": "cancelar",
  "close": "fechar",
  "back": "voltar",
  "sign in": "entrar",
  "sign out": "sair",
  "create a stable": "criar estábulo",
  "play offline": "jogar offline",
  "use this name": "usar este nome",
  "start over": "recomeçar",
  "post request": "publicar pedido",
  "run the season": "disputar a temporada",
  "run meeting 1 of 4": "disputar reunião 1 de 4",
  "watch the replay": "ver o replay",
  "Watch the replay": "Ver o replay",
  "or just run the meeting when you are ready": "ou dispute a reunião quando quiser",
  "next up": "próxima",
  "lots": "lotes",
  "held": "em mãos",
  "open": "aberto",
  "bred": "nascidos",
  "wants": "pedidos",
  "prizes": "prêmios",
  "best horse": "melhor cavalo",
  "forced sales": "vendas forçadas",
  "price": "preço",
  "sire value": "valor do garanhão",
  "in the barn": "no inventário",
  "your seat": "seu assento",
  "house": "casa",
  "colt": "macho",
  "filly": "fêmea",
  "soulbound": "vinculado",
  "stakes class": "classe principal",
  "clean": "limpo",

  // Filters
  "search by name, sire or dam": "buscar por nome, pai ou mãe",
  "sex: any": "sexo: todos",
  "sex: mares": "sexo: éguas",
  "sex: colts": "sexo: machos",
  "age: any": "idade: todas",
  "age: 0-1": "idade: 0–1",
  "age: 2-3": "idade: 2–3",
  "age: 4-6": "idade: 4–6",
  "age: 7+": "idade: 7+",
  "wins: any": "vitórias: todas",
  "wins: unraced": "vitórias: sem corridas",
  "wins: raced, none": "vitórias: correu, nenhuma",
  "wins: 1+": "vitórias: 1+",
  "wins: 3+": "vitórias: 3+",
  "value: any": "valor: qualquer",
  "value: above the field": "valor: acima do campo",
  "value: below the field": "valor: abaixo do campo",
  "value: near elite": "valor: perto da elite",
  "order: as listed": "ordem: como listado",
  "order: name: A-Z": "ordem: nome A–Z",
  "order: value: highest first": "ordem: maior valor",
  "order: wins: most first": "ordem: mais vitórias",
  "order: age: youngest first": "ordem: mais jovem",
  "order: age: oldest first": "ordem: mais velho",
  "any lineage": "qualquer linhagem",
  "pick one above": "escolha uma acima",
  "no covering selected": "nenhuma cobertura selecionada",

  // Central explanations (short)
  "Pick up to three runners, then run the season. Upkeep is charged per horse in training, and a horse that costs more than it earns will eat your stable.":
    "Escolha até três corredores e dispute a temporada. A manutenção é cobrada por cavalo em treinamento, e um cavalo que custa mais do que rende vai consumir o estábulo.",
  "A replay of the running you just saw: the order at the finish is exactly the placings, so what the animation shows is what the rules decided.":
    "Replay da corrida que você acabou de ver: a ordem na chegada é exatamente a classificação, então a animação mostra o que as regras decidiram.",
  "A covering is a frozen straw: it stays usable after the stallion retires, so an elite sire's stock is finite. Pick a straw, then breed a mare to it.":
    "Uma cobertura é uma dose congelada: continua utilizável depois que o garanhão se aposenta, então o estoque de um reprodutor de elite é finito. Escolha uma dose e cruze uma égua.",
  "Pick a covering above, then breed a mare. The line under each name is what the cross would bring: vigour from a new lineage, and both parents' inbreeding.":
    "Escolha uma cobertura acima e cruze uma égua. A linha sob cada nome mostra o que o cruzamento traria: vigor de uma nova linhagem e a endogamia dos dois pais.",
  "Whole horses for sale, consigned by other stables. A lot ages in the ring, so a price that sits unsold drops to clearance. Consign your own from the Yard.":
    "Cavalos inteiros à venda, consignados por outros estábulos. O lote envelhece no recinto e o preço cai até a liquidação. Consigne os seus pelo Estábulo.",
  "Three things money can buy that the market does not sell: a catalogue page to read a horse, feed to move one trait a step, and a pass that waives this meeting's entry fees. Yearlings on the last row can be brought on before they ever see a racecourse.":
    "Três coisas que o dinheiro compra e o mercado não vende: uma página de catálogo para ler um cavalo, ração para mover um traço e um passe que isenta as inscrições desta reunião. Potros da última linha podem ser preparados antes de correr.",
  "Stables ranked by prize money won. Rivals are the house's own yards.":
    "Estábulos classificados por prêmios ganhos. Os rivais são os próprios estábulos da casa.",
  "Every horse you own has one token. Unclaimed means the account has no wallet yet; pending is signed and waiting for the chain; minted shows the token id and its receipt.":
    "Cada cavalo seu tem um token. Não reivindicado significa que a conta ainda não tem carteira; pendente está assinado e aguardando a rede; emitido mostra o id e o recibo.",
  "One frozen straw from a stallion. A breeding spends it, and it stays usable after the stallion retires.":
    "Uma dose congelada de um garanhão. O cruzamento a consome, e ela continua utilizável após a aposentadoria.",
  "Your money. Earned from race purses and selling coverings, spent on upkeep and better blood.":
    "Seu dinheiro. Ganho em prêmios e na venda de coberturas, gasto em manutenção e melhor sangue.",
  "The top 3% of the horses in training, recalculated each season. It is a rank, not a fixed bar, so last season's champion can drift out of it.":
    "Os 3% melhores cavalos em treinamento, recalculados a cada temporada. É uma posição, não um corte fixo: o campeão anterior pode sair dela.",
  "Board per horse per season, rising steeply with talent. A horse that costs more than it earns will eat the stable.":
    "Custo por cavalo por temporada, que sobe com o talento. Um cavalo que custa mais do que rende vai consumir o estábulo.",
  "Put a horse into the auction. It leaves your racing string while it is in the ring, and returns if you withdraw it.":
    "Coloque um cavalo no leilão. Ele sai da equipe de corrida enquanto estiver no recinto e volta se você retirar o lote.",
  "The house's 5% on any sale between stables.": "A taxa de 5% da casa em qualquer venda entre estábulos.",
  "The condition this season runs. Sprint rewards speed and acceleration; staying rewards stamina and recovery.":
    "A condição da temporada. Velocidade premia velocidade e arranque; fundo premia resistência e recuperação.",
  "Studbook is a game. The genotypes are simulated, the guineas are simulated, and nothing here is a real horse or a real currency.":
    "Studbook é um jogo. Os genótipos e os guinéus são simulados; nada aqui é um cavalo real ou moeda real.",
  "No runners entered. Pick up to three on the Yard screen — the enter button sits on each row.":
    "Nenhum corredor inscrito. Escolha até três na tela Estábulo — o botão de inscrição fica em cada linha.",
  "No coverings held — without one no mare can be covered and the yard cannot grow. Start with the first covering in your account at ₲ 20, or buy a rival's covering from the Stud market.":
    "Nenhuma cobertura em mãos — sem uma, nenhuma égua pode ser coberta e o estábulo não cresce. Comece com a primeira cobertura da conta por ₲ 20 ou compre de um rival no Mercado de garanhões.",
  "No foals bred yet. Cover a mare on the Breeding screen and the book starts here.":
    "Nenhum potro nascido. Cubra uma égua na tela Criação e o livro começa aqui.",
  "No mares in foal. Pick a covering and breed a mare above.":
    "Nenhuma égua prenha. Escolha uma cobertura e cruze uma égua acima.",
  "No meeting has run yet. Enter runners and run the meeting — or put the entries on a clock and it runs itself.":
    "Nenhuma reunião foi disputada. Inscreva corredores e dispute a reunião — ou coloque as inscrições em um relógio e ela roda sozinha.",
  "The covering is spent and the foal is due next season.": "A cobertura foi consumida e o potro nasce na próxima temporada.",
  "In foal · due next season": "Prenha · nasce na próxima temporada",
  "A mare in foal cannot be covered again. The foal arrives when the season turns, so running the season is what brings it into the yard.":
    "Uma égua prenha não pode ser coberta de novo. O potro chega na virada da temporada; é disputar a temporada que o traz ao estábulo.",
  "One mare, no covering. The covering is what makes her a breeding stable, and her foal is the first horse you may sell.":
    "Uma égua, sem cobertura. A cobertura é o que a torna um estábulo de criação, e o potro dela é o primeiro cavalo que você pode vender.",
  "Unraced: nothing on his card yet.": "Sem corridas: ainda não há nada na ficha.",
  "Offline: the world market needs the server. Play online to trade across rooms.":
    "Offline: o mercado global precisa do servidor. Jogue no modo online para negociar entre salas.",

  // Race-day guidance and central advice
  "Bloodstock · season": "Criação · temporada",
  "Enter up to three runners, then run the meeting.": "Inscreva até três corredores e dispute a reunião.",
  "A foal arrives when the season turns. Cover a mare and wait for it.": "O potro nasce na virada da temporada. Cubra uma égua e aguarde.",
  "A horse with no hole in it beats a specialist. Read all six traits before you buy.":
    "Um cavalo sem pontos fracos vence um especialista. Leia os seis traços antes de comprar.",
  "Breed for a turn of foot rather than stamina. A stayer here is a passenger.":
    "Busque arranque, não fundo. Um cavalo de resistência aqui é passageiro.",
  "Buy the bottomless horse: stamina and recovery first, speed last.":
    "Compre o cavalo de fundo: resistência e recuperação primeiro, velocidade por último.",
  "Soundness first on this ground. A fast, fragile horse wastes the entry fee.":
    "Solidez primeiro nesta pista. Um cavalo rápido e frágil desperdiça a inscrição.",
  "The most complete card of the seven. A hole in any trait shows here.":
    "A ficha mais completa das sete. Qualquer ponto fraco aparece aqui.",
  "Between a classic and heavy ground: stamina with a finishing kick.":
    "Entre clássico e pista pesada: resistência com arranque final.",
  "Favours a fast horse with a cool head. It rewards speed and accel; it punishes a horse short of soundness.":
    "Favorece um cavalo rápido e equilibrado. Premia velocidade e arranque; pune quem tem pouca solidez.",
  "Favours a fast horse with a sharp turn of foot. It rewards speed and accel; it punishes a horse short of soundness.":
    "Favorece um cavalo rápido e com arranque curto. Premia velocidade e arranque; pune quem tem pouca solidez.",
  "Favours a sound mover with a turn of foot on dead ground. It rewards stamina and recovery; it punishes a horse short of accel.":
    "Favorece um cavalo sólido com arranque em pista morta. Premia resistência e recuperação; pune quem tem pouco arranque.",
  "Favours a stayer that can grind out the last furlong. It rewards stamina and recovery; it punishes a horse short of accel.":
    "Favorece um cavalo de fundo que segura o último trecho. Premia resistência e recuperação; pune quem tem pouco arranque.",
  "Favours a tough, sound horse that handles bad ground. It rewards stamina and soundness; it punishes a horse short of accel.":
    "Favorece um cavalo resistente e sólido em pista ruim. Premia resistência e solidez; pune quem tem pouco arranque.",
  "Favours a well-rounded horse with no obvious hole in it. It rewards speed and stamina; it punishes a horse short of temperament.":
    "Favorece um cavalo completo, sem falha óbvia. Premia velocidade e resistência; pune quem tem pouco temperamento.",
  "Favours the horse that can do both: speed and a finish. It rewards speed and stamina; it punishes a horse short of soundness.":
    "Favorece o cavalo que faz as duas coisas: velocidade e chegada. Premia velocidade e resistência; pune quem tem pouca solidez.",
  "Consign": "Consignar",
  "Meeting pass": "Passe da reunião",
  "Preparing the catalogue…": "Preparando o catálogo…",
  "One trait, one step. Once per horse.": "Um traço, um passo. Uma vez por cavalo.",
  "Read one horse's traits without paying the certifier.": "Leia os traços de um cavalo sem pagar o certificador.",
  "No entry fees for the rest of this meeting.": "Sem inscrição pelo resto desta reunião.",
  "No yearlings in the yard": "Nenhum potro no estábulo",
  "Once per stable, at the cheapest price you will ever see.": "Uma vez por estábulo, pelo menor preço que você verá.",
  "A mare in foal cannot be covered again. The foal arrives when the season turns, so running the season is what brings it into the yard.":
    "Uma égua prenha não pode ser coberta de novo. O potro chega na virada da temporada; é disputar a temporada que o traz ao estábulo.",
  "Five goings, three meetings a season, so the calendar never runs the same card twice in a row. The weights below are read live from the rules the engine scores with rather than copied, and the card marked next up is the one your entries will run on.":
    "Cinco pistas, três reuniões por temporada: o calendário nunca repete a mesma ficha em sequência. Os pesos abaixo vêm ao vivo das regras do motor, e a ficha marcada como próxima é onde suas inscrições vão correr.",
  "Name the genetics you want and the price you will pay: a rival holding a matching covering fills it at the next season. Asking across lineages is how fresh blood gets into a herd.":
    "Escolha a genética desejada e o preço que pagará: um rival com cobertura compatível atende na próxima temporada. Pedir de outra linhagem é como sangue novo entra no plantel.",
  "Certify a lot to reveal the sire's genotype and its hidden carriers, then buy the covering and put it to your best mare.":
    "Certifique um lote para revelar o genótipo do garanhão e seus portadores ocultos; depois compre a cobertura e use na sua melhor égua.",
  "Everything this yard has bred, newest first, each with the tier it landed in on the day it was born. That tier is a rank against the field of that season, so a foal that looked excellent then can be ordinary against a better field later.":
    "Tudo o que este estábulo criou, do mais novo ao mais antigo, com a faixa alcançada no nascimento. A faixa é uma posição contra o campo daquela temporada: um potro excelente pode ser comum contra um campo melhor depois.",
  "How good a horse is now, scored for the condition it fits best. The field average and the elite cut are in the header, so a number can be placed.":
    "O quão bom o cavalo é agora, pontuado na condição que mais lhe favorece. A média do campo e o corte de elite ficam no cabeçalho para contextualizar o número.",
  "Inbreeding. Close-bred horses lose value directly, which is why good parents can still produce a poor foal.":
    "Endogamia. Cavalos aparentados perdem valor diretamente; por isso bons pais ainda podem gerar um potro fraco.",
  "Lots from every room. Buying one moves the animal into your yard and pays the seller less the same five per cent the local market takes.":
    "Lotes de todas as salas. Comprar move o animal para o seu estábulo e paga ao vendedor menos os mesmos 5% do mercado local.",
  "For replaying the opening. Pick the bank you want to start on, then start over. Funds are a testing grant rather than an earning, and every use is written into the week, so they cannot hide inside a real balance.":
    "Para repetir a abertura. Escolha o banco inicial e recomece. Os fundos são uma concessão de teste, não um ganho, e cada uso é registrado na semana para não se esconder no saldo real.",

  "Run meeting 1 of 4": "Disputar reunião 1 de 4",
  "Run the season and the running appears here.": "Dispute a temporada e a corrida aparece aqui.",
  "Start here: take the first covering. Twenty guineas, once per stable, and the cheapest you will ever buy.":
    "Comece aqui: pegue a primeira cobertura. Vinte guinéus, uma vez por estábulo, o menor preço que você verá.",
  "THE FIELD · 9 DECLARED": "O CAMPO · 9 DECLARADOS",
  "Breeding spends the covering and costs nothing extra.": "A cruza consome a cobertura e não custa nada além disso.",
  "The meeting pays the yard, and upkeep is charged when the season turns.":
    "A reunião paga o estábulo, e a manutenção é cobrada na virada da temporada.",
  "This build is one file with no server, so it is single-player by nature. The hosted build seats up to four stables in the same room.":
    "Esta versão é um arquivo sem servidor, então é single-player por natureza. A versão hospedada recebe até quatro estábulos na mesma sala.",
  "This save lives in your browser, and in the room on the hosted build. Starting over reseeds the game from season one with the standard bank.":
    "Este save fica no navegador e, na versão hospedada, na sala. Recomeçar gera um novo jogo desde a temporada 1 com o banco padrão.",
  "What you put in before a foal exists. Better care catches more often and lifts the foal's value, and the money is spent whether or not a foal arrives.":
    "O que você investe antes de o potro existir. Melhor cuidado aumenta a taxa de prenhez e o valor do potro; o dinheiro é gasto mesmo se ele não nascer.",
  "Who is at this table, and how to bring someone else to it. A room seats up to four stables, and everyone in it shares the same seasons, markets and races.":
    "Quem está nesta mesa e como trazer outra pessoa. A sala recebe até quatro estábulos, e todos compartilham temporadas, mercados e corridas.",
  "Once a season each house also sends its best stallion to the select sale, at a price several times the ordinary market. That is where a stable with money buys blood that actually moves its herd.":
    "Uma vez por temporada, cada casa também envia seu melhor garanhão ao leilão seletivo, por várias vezes o preço comum. É onde um estábulo com dinheiro compra sangue que muda o plantel.",
  "Your stable (you)": "Seu estábulo (você)",
  "a staying race": "uma prova de fundo",
  "a sprint": "um sprint",
  "a classic": "um clássico",
  "a mile": "uma milha",
  "heavy ground": "pista pesada",
  "yielding ground": "pista macia",
  "below the field": "abaixo do campo",
  "above the field": "acima do campo",
  "near elite": "perto da elite",
  "nothing extra": "nada extra",
  "Eight coats by four face markings. A place is filled by the first horse of your yard to wear it: one you bred, at any time, or one you hold now.": "Oito pelagens por quatro marcas de cara. Cada lugar é preenchido pelo primeiro cavalo do seu haras com aquela combinação: um que você criou, em qualquer época, ou um que está com você agora.",
  "What your yard has done so far, and what is still ahead of it.": "O que o seu haras já fez, e o que ainda tem pela frente.",
  "first win": "primeira vitória",
  "win a meeting with a horse of yours": "vencer uma reunião com um cavalo seu",
  "first foal": "primeiro potro",
  "breed a foal in your own yard": "criar um potro no seu haras",
  "first sale": "primeira venda",
  "sell a horse or a covering": "vender um cavalo ou uma cobertura",
  "a stakes horse": "um cavalo de elite",
  "own a horse of stakes class": "ter um cavalo de classe de elite",
  "breeder": "criador",
  "breed 5 foals": "criar 5 potros",
  "a yard of tradition": "haras de tradição",
  "breed 15 foals": "criar 15 potros",
  "second generation": "segunda geração",
  "breed a foal out of a horse you bred": "criar um potro filho de um cavalo que você criou",
  "three generations of one line": "três gerações da mesma linha",
  "three generations bred in your yard": "três gerações criadas no seu haras",
  "every coat": "todas as pelagens",
  "have a horse of each of the 8 coats": "ter um cavalo de cada uma das 8 pelagens",
  "half the album": "meio álbum",
  "fill 16 of the 32 places": "preencher 16 dos 32 lugares",
  "the whole album": "álbum completo",
  "fill all 32 places": "preencher os 32 lugares",
  "share card": "compartilhar cartão",
  "card saved as an image": "cartão salvo como imagem",
  "card shared": "cartão compartilhado",
  "could not draw the card": "não foi possível desenhar o cartão",
  "Start here: enter your horse in the first meeting. It costs nothing this season, and once it is in the field you can ride the live race yourself.": "Comece aqui: inscreva seu cavalo na primeira reunião. Nesta temporada não custa nada, e com ele no campo você pode montar a corrida ao vivo.",
  "Now the breeding: take the first covering. Twenty guineas, once per stable, and the cheapest you will ever buy.": "Agora a criação: pegue a primeira cobertura. Vinte guinéus, uma vez por estábulo, o menor preço que você verá.",
  "Your horse is in the field. Ride the live race now: it is an exhibition, so nothing is at stake, and you learn what the orders do before the meeting that counts.": "Seu cavalo está no campo. Monte a corrida ao vivo agora: é uma exibição, não vale nada, e você aprende o que cada ordem faz antes da reunião que conta.",
  "Ride the live race": "Montar a corrida ao vivo",
  "near certain": "quase certo",
  "under 1% to win": "menos de 1% de chance",
  "over 99% to win": "mais de 99% de chance",
  "chance of winning this meeting, from simulated runs of it": "chance de vencer esta reunião, simulando-a muitas vezes",
  "odds come from running this meeting many times with the rule that decides it; change an instruction and they move": "as cotações vêm de simular esta reunião muitas vezes com a regra que a decide; mude uma instrução e elas mudam",
  "that race is over — open the live race again": "Essa corrida terminou: abra a corrida ao vivo de novo.",
  "you can only ride your own runner": "Você só pode montar o seu próprio corredor.",
  "an email and a password of at least 8 characters": "informe um e-mail e uma senha de pelo menos 8 caracteres",
  "stable name": "nome do estábulo",
  "(to create a stable · optional)": "(para criar um estábulo · opcional)",
  "a stable name is 2 to 24 characters": "o nome do estábulo tem de 2 a 24 caracteres",
  "Room code": "Código da sala",
  "Invite link": "Link de convite",
  "Room name": "Nome da sala",
  "connected — the stable is on the server": "conectado: o estábulo está no servidor",
  "join a friend": "entrar na sala de um amigo",
  "verify": "verificar",
  "unverified": "não verificado",
  "room code": "código da sala",
  "or another room": "ou outra sala",
  "No lots from other rooms just now.": "Nenhum lote de outras salas agora.",
  "copy the link": "copiar o link",
  "switch room": "trocar de sala",
  "horse": "cavalo",
  "bind a wallet to claim them:": "vincule uma carteira para reivindicá-los:",
  "select it": "selecionar",
  "first look": "primeira olhada",
  "against her dam": "comparado à mãe",
  "horse lot": "lote de cavalo",
  "retired": "aposentado",
  "Buy a horse from the market, or breed one.": "Compre um cavalo no mercado ou crie um.",
  "Your horses": "Seus cavalos",
  "Your horses in training": "Seus cavalos em treinamento",
  "Enter this meeting.": "Inscrever nesta reunião.",
  "Withdraw from this meeting.": "Retirar desta reunião.",
  "You hold no covering - take the first covering in your account, or buy one in the Stud market.": "Você não tem cobertura: pegue a primeira cobertura da conta ou compre uma no Mercado de garanhões.",
  "You hold no covering — take the first covering in your account, or buy one in the Stud market.": "Você não tem cobertura: pegue a primeira cobertura da conta ou compre uma no Mercado de garanhões.",
  "A gift horse: she can never be sold or consigned, but her foals can.": "Um presente: ela nunca pode ser vendida nem consignada, mas os potros dela podem.",
  "Price in guineas": "Preço em guinéus",
  "Buy this lot.": "Comprar este lote.",
  "Reveal this stallion's genotype and his hidden carriers.": "Revelar o genótipo deste garanhão e os portadores ocultos.",
  "Stable rankings; scroll horizontally on small screens": "Classificação dos estábulos; role para o lado em telas pequenas",
  "Stable name": "Nome do estábulo",
  "A covering from the best stallion in the world, once per stable. This is what coins are for.": "Uma cobertura do melhor garanhão do mundo, uma vez por estábulo. É para isso que servem as moedas.",
  "Pick a covering first.": "Escolha uma cobertura primeiro.",
  "Cover her: the covering is spent and the foal arrives when the season turns.": "Cobrir: a cobertura é gasta e o potro chega na virada da temporada.",
  "She is in foal: the foal arrives when the season turns.": "Ela está prenha: o potro chega na virada da temporada.",
  "Sell to the house at once.": "Vender para a casa na hora.",
  "Only a mare can be covered.": "Só uma égua pode ser coberta.",
  "elite cut": "corte de elite",
  "SIMULATED": "SIMULADO",
  "No token here exists on a real blockchain. Tokens, receipts and claims are a demonstration; nothing can be sold for real money.": "Nenhum token daqui existe numa blockchain real. Tokens, recibos e reivindicações são uma demonstração; nada pode ser vendido por dinheiro real.",
  "Tokens need the server. Play online to hold horses on chain.": "Os tokens precisam do servidor. Jogue no modo online para ver os tokens dos seus cavalos.",
  "No horses yet. Cover a mare and wait for the foal.": "Ainda não há cavalos. Cubra uma égua e espere o potro.",
  "buy it": "comprar",
  "online your stable is permanent — starting over is only in the offline demo": "No modo online o estábulo é permanente: recomeçar só existe na demonstração offline.",
  "Online your stable is permanent: horses, guineas and pedigrees are kept, so there is no starting over. To replay the opening, use the offline demo. If your yard runs out of horses, the next step above names the cheapest way back in.": "No modo online o estábulo é permanente: cavalos, guinéus e pedigrees ficam guardados, então não há recomeço. Para repetir a abertura, use a demonstração offline. Se o estábulo ficar sem cavalos, o próximo passo lá em cima mostra o jeito mais barato de voltar.",
  "Your yard has no horse left to race or breed, and no lot in the ring fits your balance yet. Sell a covering, or wait: unsold lots get cheaper each season.": "Seu estábulo não tem mais cavalos para correr ou criar, e nenhum lote cabe no seu saldo agora. Venda uma cobertura ou espere: lotes não vendidos ficam mais baratos a cada temporada.",
  "wins": "vitórias",
  "horses": "cavalos",
  "you": "você",
  "rival": "rival",
  "Conditioning feed": "Ração de condicionamento",
  "accel — the cheapest part of the card": "arranque — a parte mais barata da ficha",
  "breed a mare to a covering": "cruze uma égua com uma cobertura",
  "buying blood · no season closed yet": "comprando sangue · nenhuma temporada encerrada",
  "speed": "velocidade",
  "stamina": "resistência",
  "accel": "arranque",
  "recovery": "recuperação",
  "temperament": "temperamento",
  "soundness": "solidez",
  "enter up to three runners": "inscreva até três corredores",
  "sell coverings, buy better blood": "venda coberturas, compre melhor sangue",
  "none yet — win a meeting, or breed your first foal": "ainda nenhum — vença uma reunião ou crie seu primeiro potro",
  "ring open — reading the catalogue…": "recinto aberto — lendo o catálogo…",
  "is the one your entries will run on.": "é onde suas inscrições vão correr.",
  "stable": "estábulo",
  "the house · horse lot": "a casa · lote de cavalo",
  "push: the card is won early, so a horse that can go fast is one to send": "atacar: a ficha se ganha cedo; um cavalo rápido é para mandar",
  "steady: the card is balanced, so the instruction matters less than the horse": "manter: a ficha é equilibrada; a instrução importa menos que o cavalo",
  "hold: the card is won late, so sending one early spends what it needs at the finish": "poupar: a ficha se ganha tarde; atacar cedo gasta o que falta na chegada",
  "speed and accel — the two weights that decide this card": "velocidade e arranque — os dois pesos que decidem esta ficha",
  "speed and stamina — the two weights that decide this card": "velocidade e resistência — os dois pesos que decidem esta ficha",
  "stamina and recovery — the two weights that decide this card": "resistência e recuperação — os dois pesos que decidem esta ficha",
  "stamina and soundness — the two weights that decide this card": "resistência e solidez — os dois pesos que decidem esta ficha",
  "soundness — the cheapest part of the card": "solidez — a parte mais barata da ficha",
  "temperament — the cheapest part of the card": "temperamento — a parte mais barata da ficha",
  "who runs, before the off: study the rival now, not at the finish line": "quem corre, antes da largada: estude o rival agora, não na chegada",
  "the field": "o campo",
  "○ cover a mare": "○ cobrir uma égua",
  "○ win a meeting": "○ vencer uma reunião",
  "○ sell a horse or a covering": "○ vender um cavalo ou uma cobertura",
  "○ end the season richer than you opened it": "○ terminar a temporada com mais dinheiro",

  // Race cards: labels, character and advice for every going
  "a flying start": "largada lançada",
  "Don't overpay for": "Não pague caro por",
  "A cool head is worth as much as raw speed. Temperament is this card's second weight.": "Cabeça fria vale tanto quanto velocidade pura. Temperamento é o segundo peso desta ficha.",
  "A horse with no hole in it beats a specialist. Read all six traits before you buy.": "Um cavalo sem ponto fraco vence o especialista. Leia os seis atributos antes de comprar.",
  "Buy the bottomless horse: stamina and recovery first, speed last.": "Compre o cavalo incansável: resistência e recuperação primeiro, velocidade por último.",
  "Soundness first on this ground. A fast, fragile horse wastes the entry fee.": "Solidez primeiro nesta pista. Um cavalo rápido e frágil desperdiça a inscrição.",
  "The most complete card of the seven. A hole in any trait shows here.": "A ficha mais completa das sete. Qualquer ponto fraco aparece aqui.",

  // Tiers, care, relatedness, margins
  "ordinary": "comum",
  "promising": "promissor",
  "excellent": "excelente",
  "exceptional": "excepcional",
  "stakes class": "classe de elite",
  "plain care": "cuidado básico",
  "prepared care": "cuidado preparado",
  "stud care": "cuidado de haras",
  "plain care · free": "cuidado básico · grátis",
  "slightly related": "pouco aparentado",
  "related": "aparentado",
  "close-bred": "consanguíneo",
  "race-day variance": "variação do dia",
  "in foal": "prenha",
  "mare": "égua",
  "a nose": "um focinho",
  "a neck": "um pescoço",
  "half a length": "meio corpo",
  "three quarters of a length": "três quartos de corpo",
  "first covering": "primeira cobertura",
  "taken": "usada",
  "sex · age": "sexo · idade",
  "care": "cuidado",

  // Runner table and account gate
  "The field": "O campo",
  "sire × dam": "pai × mãe",
  "Prioritise": "Priorize",
  "Assistir à corrida ao vivo": "Assistir à corrida ao vivo",
  "next up": "próxima",
  "meeting": "reunião",
  "field average": "média do campo",
  "₲ per runner · four places paid": "₲ por corredor · quatro primeiros premiados",
  "Entry": "Inscrição",
  "your runner": "seu corredor",
  "push": "atacar",
  "steady": "manter",
  "hold": "poupar",
  "email": "E-mail",
  "password": "Senha",
  "new password": "Nova senha",
  "code": "Código",

  // a played game
  "Run the meeting when your runners are entered — a season is three of them.": "Dispute a reunião quando seus corredores estiverem inscritos.",
  "value": "valor",
  "inbreeding": "consanguinidade",
  "record": "histórico",
  "run the meeting": "disputar a reunião",
  "✓ cover a mare": "✓ cobrir uma égua",
  "✓ win a meeting": "✓ vencer uma reunião",
  "✓ sell a horse or a covering": "✓ vender um cavalo ou uma cobertura",
  "✓ end the season richer than you opened it": "✓ terminar a temporada com mais dinheiro",
  "your yard": "seu estábulo",
  "best foal you have bred": "melhor potro que você criou",
  "keep the name": "manter o nome",
  "back to the yard": "voltar ao estábulo",
  "in the yard": "no estábulo",
  "The covering missed": "A cobertura não pegou",
  "buying blood": "comprando sangue",
  "short of a stallion": "precisa de um garanhão",
  "short of mares": "precisa de éguas",
  "short of coin": "precisa de dinheiro",
  "short of coverings": "precisa de coberturas",
  "covering": "cobertura"
}));

/* ---------- sentences the engine composes from parts ---------- */
const STAGE = { yearling: "potro", racehorse: "cavalo de corrida", veteran: "veterano" };
const TRAIT_PT = { speed: "velocidade", stamina: "resistência", "a turn of foot": "arranque", recovery: "recuperação", "a level head": "cabeça fria", soundness: "solidez" };
const CAUSAL_CAUSE = {
  "was outrun on the day": "foi superado no dia",
  "did not finish": "não completou",
  "stumbled once": "tropeçou uma vez",
  "ran out of breath, and push spent it too early": "ficou sem fôlego, e atacar gastou cedo demais",
  "ran out of breath before the line": "ficou sem fôlego antes da chegada",
  "finished with breath to spare, and hold kept too much back": "chegou com fôlego sobrando, e poupar segurou demais",
  "finished with breath to spare": "chegou com fôlego sobrando",
};
const BAND_PT = { stakes: "elite", "near elite": "perto da elite", "above the field": "acima do campo", "below the field": "abaixo do campo" };
const SEX_PT = { colt: "macho", filly: "fêmea", mare: "égua" };
const LUCK_PT = { "stakes class": "classe de elite", catch: "prenhez", foal: "potro", sale: "venda", covering: "cobertura" };
const years = (n) => `${n} ${Number(n) === 1 ? "ano" : "anos"}`;

function composite(text) {
  let m = text.match(/^(yearling|racehorse|veteran) with (.+), short of (.+) · (stakes|near elite|above the field|below the field)$/);
  if (m && TRAIT_PT[m[2]] && TRAIT_PT[m[3]]) return `${STAGE[m[1]]} com ${TRAIT_PT[m[2]]}, falta ${TRAIT_PT[m[3]]} · ${BAND_PT[m[4]]}`;
  m = text.match(/^(yearling|racehorse|veteran), no hole in it · (stakes|near elite|above the field|below the field)$/);
  if (m) return `${STAGE[m[1]]} sem ponto fraco · ${BAND_PT[m[2]]}`;
  m = text.match(/^(colt|filly|mare) · (?:age )?(\d+)( · in foal)?$/);
  if (m) return `${SEX_PT[m[1]]} · ${years(m[2])}${m[3] ? " · prenha" : ""}`;
  m = text.match(/^(.+) · next up$/);
  if (m) return `${translate(m[1])} · próxima`;
  m = text.match(/^Put entries on a (\d+)s clock$/);
  if (m) return `Inscrições com relógio de ${m[1]} s`;
  m = text.match(/^traits are certified — ([\d.,]+) ₲ to read this card$/);
  if (m) return `atributos certificados — ${m[1]} ₲ para ler esta ficha`;
  m = text.match(/^(plain|prepared|stud) care · (.+)$/);
  if (m) return `${translate(`${m[1]} care`)} · ${m[2] === "free" ? "grátis" : m[2]}`;
  m = text.match(/^(stakes class|catch|foal|sale|covering) · (\d+)% · (hit|miss)(?: — (.+))?$/);
  if (m) return `${LUCK_PT[m[1]]} · ${m[2]}% · ${m[3] === "hit" ? "acertou" : "errou"}${m[4] ? ` — ${m[4]}` : ""}`;
  m = text.match(/^(.+?) × (.+?)( · L\d+)?$/);
  if (m && (m[1] === "founder" || m[2] === "founder")) {
    return `${m[1] === "founder" ? "fundador" : m[1]} × ${m[2] === "founder" ? "fundadora" : m[2]}${m[3] ?? ""}`;
  }
  m = text.match(/^(\d+) declared$/);
  if (m) return `${m[1]} ${m[1] === "1" ? "declarado" : "declarados"}`;
  m = text.match(/^(\d+) runs?, (\d+) won$/);
  if (m) return `${m[1]} ${m[1] === "1" ? "corrida" : "corridas"}, ${m[2]} ${m[2] === "1" ? "vitória" : "vitórias"}`;
  m = text.match(/^([\d.]+)x the field$/);
  if (m) return `${m[1]}× o campo`;
  m = text.match(/^(\d+) lengths?$/);
  if (m) return `${m[1]} ${m[1] === "1" ? "corpo" : "corpos"}`;
  return lateGame(text);
}

/* ---------- what a played game says: race reports, the diary, the foal, the market ---------- */
const COND_PT = { sprint: "prova de velocidade", classic: "clássica", staying: "prova de fundo", flying: "largada lançada", heavy: "pista pesada", mile: "milha", yielding: "pista macia" };
const TACTIC_PT = { push: "atacar", steady: "manter", hold: "poupar" };
const TIER_PT = { ordinary: "comum", promising: "promissor", excellent: "excelente", exceptional: "excepcional", "stakes class": "classe de elite" };
const LOST_ON = { speed: "velocidade", stamina: "resistência", accel: "arranque", recovery: "recuperação", temperament: "temperamento", soundness: "solidez", "race-day variance": "variação do dia" };
const plural = (n, one, many) => `${n} ${String(n) === "1" ? one : many}`;
const cond = (key) => COND_PT[key] ?? key;
const margin = (text) => translate(text);
const careWord = (key) => ({ plain: "cuidado básico", prepared: "cuidado preparado", stud: "cuidado de haras" })[key] ?? key;

function lateGame(text) {
  let m;
  // the diary: "S4 · …" lines translate their sentence and keep the season mark
  m = text.match(/^S(\d+) · (.+)$/);
  if (m) {
    const inner = lateGame(m[2]);
    if (inner) return `T${m[1]} · ${inner}`;
  }
  m = text.match(/^(?:(The clock ran out) — )?Meeting (\d+) of (\d+) is run\. Entries for meeting (\d+) are open — up to three runners\.$/);
  if (m) return `${m[1] ? "O relógio acabou — " : ""}Reunião ${m[2]} de ${m[3]} disputada. Inscrições abertas para a reunião ${m[4]} — até três corredores.`;
  m = text.match(/^(.+) finished (\d+) of (\d+) in the (\w+), (?:([\d.]+) s behind|did not finish) — (.+)\.$/);
  if (m) {
    const c = m[6];
    let why = CAUSAL_CAUSE[c] ?? c;
    let k = c.match(/^stumbled (\d+) times$/);
    if (k) why = `tropeçou ${k[1]} vezes`;
    k = c.match(/^was boxed in for ([\d.]+) s$/);
    if (k) why = `ficou encaixotado por ${k[1]} s`;
    return `${m[1]} chegou em ${m[2]}º de ${m[3]} na ${cond(m[4])}, ${m[5] ? `${m[5]} s atrás` : "sem completar"} — ${why}.`;
  }
  m = text.match(/^From meeting (\d+) of season (\d+), official results are decided by the race itself\.$/);
  if (m) return `A partir da reunião ${m[1]} da temporada ${m[2]}, os resultados oficiais são decididos pela própria corrida: ritmo, fôlego, tráfego e a forma do dia.`;
  m = text.match(/^From meeting (\d+) of season (\d+), official results are decided by the form score again\.$/);
  if (m) return `A partir da reunião ${m[1]} da temporada ${m[2]}, os resultados oficiais voltam a ser decididos pela nota de forma.`;
  m = text.match(/^(.+) finished (\d+) of (\d+) in the (\w+), ([\d.]+) behind — lost it on ([a-z -]+?)(?:, and (push|steady|hold) was the wrong instruction for a (\w+))?\.$/);
  if (m) return `${m[1]} chegou em ${m[2]}º de ${m[3]} na ${cond(m[4])}, ${m[5]} atrás — perdeu em ${LOST_ON[m[6]] ?? m[6]}${m[7] ? `, e ${TACTIC_PT[m[7]]} foi a instrução errada para ${cond(m[8])}` : ""}.`;
  m = text.match(/^(\w+) meeting: (.+) wins a pot of ([\d,.]+) GNS from (\d+) runners\.$/);
  if (m) return `Reunião de ${cond(m[1])}: ${m[2]} leva o prêmio de ${m[3]} GNS entre ${m[4]} corredores.`;
  m = text.match(/^(.+) is in foal to (.+) — due next season\.$/);
  if (m) return `${m[1]} está prenha de ${m[2]} — o potro nasce na próxima temporada.`;
  m = text.match(/^(.+) covered by (.+) \(vintage (\d+)\)\.$/);
  if (m) return `${m[1]} coberta por ${m[2]} (safra ${m[3]}).`;
  m = text.match(/^Season (\d+) opens\. Condition: (\w+)\.$/);
  if (m) return `Temporada ${m[1]} aberta. Condição: ${cond(m[2])}.`;
  m = text.match(/^(.+) was bought in at the house floor for ([\d,.]+) GNS\.$/);
  if (m) return `${m[1]} foi recomprado pela casa no preço mínimo de ${m[2]} GNS.`;
  m = text.match(/^(.+)'s barn was full: (\d+) coverings? went to the market at ([\d,.]+) GNS(?: and (\d+) were culled)?\.$/);
  if (m) return `O depósito de ${m[1]} lotou: ${plural(m[2], "cobertura foi", "coberturas foram")} ao mercado por ${m[3]} GNS${m[4] ? ` e ${m[4]} foram descartadas` : ""}.`;

  // the horse card
  m = text.match(/^₲ ([\d,.]+) a season$/);
  if (m) return `₲ ${m[1]} por temporada`;
  m = text.match(/^(\d+) runs · (\d+) won · (\d+) placed$/);
  if (m) return `${plural(m[1], "corrida", "corridas")} · ${plural(m[2], "vitória", "vitórias")} · ${plural(m[3], "colocação", "colocações")}`;

  // racing screen
  m = text.match(/^checkpoint (\d+) of (\d+) — (.+) leads$/);
  if (m) return `parcial ${m[1]} de ${m[2]} — ${m[3]} na frente`;
  m = text.match(/^finish — (.+) wins$/);
  if (m) return `chegada — ${m[1]} vence`;
  m = text.match(/^Run meeting (\d+) of (\d+)\. A season is four, and the purse funds the yard\.$/);
  if (m) return `Dispute a reunião ${m[1]} de ${m[2]}. A temporada tem quatro, e os prêmios sustentam o estábulo.`;
  m = text.match(/^Run meeting (\d+) of (\d+)$/);
  if (m) return `Disputar reunião ${m[1]} de ${m[2]}`;
  m = text.match(/^took the (\w+) — pot ([\d,.]+) ₲ from (\d+) runners$/);
  if (m) return `venceu a ${cond(m[1])} — prêmio de ${m[2]} ₲ entre ${m[3]} corredores`;
  m = text.match(/^won by (.+) clear of the runner-up$/);
  if (m) return `venceu por ${margin(m[1])} à frente do segundo`;
  m = text.match(/^(\d+)(?:st|nd|rd|th) · (.+) — beaten ([\d.]+), won ([\d,.]+) ₲ · ran (push|steady|hold)$/);
  if (m) return `${m[1]}º · ${m[2]} — atrás ${m[3]}, ganhou ${m[4]} ₲ · ${TACTIC_PT[m[5]]}`;
  m = text.match(/^(\d+) runs? · (\d+) wins? · (\d+) placings? · ₲ ([\d,.]+) earned(?: · best: (\d+) of (\d+), season (\d+))?$/);
  if (m) return `${plural(m[1], "corrida", "corridas")} · ${plural(m[2], "vitória", "vitórias")} · ${plural(m[3], "colocação", "colocações")} · ₲ ${m[4]} em prêmios${m[5] ? ` · melhor: ${m[5]}º de ${m[6]}, temporada ${m[7]}` : ""}`;

  // the season's close and the stable
  m = text.match(/^Season (\d+) closed$/);
  if (m) return `Temporada ${m[1]} encerrada`;
  m = text.match(/^the yard finished ₲ ([\d,.]+) (down|up) · (\d+) runs?, (\d+) won, (\d+) placed, ₲ ([\d,.]+) in prizes$/);
  if (m) return `o estábulo fechou com ₲ ${m[1]} a ${m[2] === "down" ? "menos" : "mais"} · ${plural(m[3], "corrida", "corridas")}, ${plural(m[4], "vitória", "vitórias")}, ${plural(m[5], "colocação", "colocações")}, ₲ ${m[6]} em prêmios`;
  m = text.match(/^(buying blood|short of a stallion|short of mares|short of coin|short of coverings) · (\d+) runs?, (\d+) won, ₲ ([\d,.]+) (down|up) last season$/);
  if (m) return `${translate(m[1])} · ${plural(m[2], "corrida", "corridas")}, ${plural(m[3], "vitória", "vitórias")}, ₲ ${m[4]} a ${m[5] === "down" ? "menos" : "mais"} na última temporada`;
  m = text.match(/^· ₲ ([\d,.]+) · (\d+) won$/);
  if (m) return `· ₲ ${m[1]} · ${plural(m[2], "vitória", "vitórias")}`;

  // the foal
  m = text.match(/^A (colt|filly) is born$/);
  if (m) return m[1] === "colt" ? "Nasce um potro" : "Nasce uma potra";
  m = text.match(/^out of (.+) by (.+)$/);
  if (m) return `filho de ${m[2]} e ${m[1]}`;
  m = text.match(/^(.+) out of (.+), with (plain|prepared|stud) care\.$/);
  if (m) return `${m[1]} × ${m[2]}, com ${careWord(m[3])}.`;
  m = text.match(/^(.+) was covered by (.+) and did not catch — the chance was (\d+)%\. The straw and the care are spent either way\.$/);
  if (m) return `${m[1]} foi coberta por ${m[2]} e não pegou — a chance era de ${m[3]}%. A cobertura e o cuidado foram gastos de qualquer forma.`;
  m = text.match(/^(\d+) of (\d+) living horses$/);
  if (m) return `${m[1]}º de ${m[2]} cavalos vivos`;
  m = text.match(/^([\d.]+) short of (ordinary|promising|excellent|exceptional|stakes class)$/);
  if (m) return `faltam ${m[1]} para ${TIER_PT[m[2]]}`;
  m = text.match(/^(.+) · value ([\d.]+) · (stakes|near elite|above the field|below the field)$/);
  if (m) return `${m[1]} · valor ${m[2]} · ${BAND_PT[m[3]]}`;
  m = text.match(/^(\d+) foals? due when the season turns\.$/);
  if (m) return `${plural(m[1], "potro previsto", "potros previstos")} para a virada da temporada.`;

  // coverings and the market
  m = text.match(/^(?:(.+) · )?collected in season (\d+)$/);
  if (m) return `${m[1] ? `${m[1]} · ` : ""}coletada na temporada ${m[2]}`;
  m = text.match(/^in foal to (.+?)( — due next season)?$/);
  if (m) return `prenha de ${m[1]}${m[2] ? " — nasce na próxima temporada" : ""}`;
  m = text.match(/^due season (\d+)$/);
  if (m) return `nasce na temporada ${m[1]}`;
  m = text.match(/^(.+) · (horse lot|season (\d+)) · price cut each season it sits$/);
  if (m) return `${m[1]} · ${m[3] ? `temporada ${m[3]}` : "lote de cavalo"} · o preço cai a cada temporada`;
  m = text.match(/^(.+) out of (.+) · S(\d+)$/);
  if (m) return `${m[1]} × ${m[2]} · T${m[3]}`;
  m = text.match(/^(.+) · (\w+) (?:card|meeting)$/);
  if (m && COND_PT[m[2]]) return `${m[1]} · ${cond(m[2])}`;
  return null;
}

const PATTERNS = [
  [/^\+(\d+)% catch · \+(\d+)% value$/i, "+$1% prenhez · +$2% valor"],
  [/^Entries are open for meeting (\d+) of (\d+)\..*$/i, "Inscrições abertas para a reunião $1 de $2. Troque corredores antes do prazo; a reunião roda sozinha."],
  [/^age (\d+)$/i, "idade $1"],
  [/^same lineage$/, "mesma linhagem"],
  [/^Stable album · (\d+) of 32$/, "Álbum do haras · $1 de 32"],
  [/^Stable album ·$/, "Álbum do haras ·"],
  [/^of 32$/, "de 32"],
  [/^Achievements ·$/, "Conquistas ·"],
  [/^(\d+\+?) to 1$/, "$1 para 1"],
  [/^1 to (\d+)$/, "1 para $1"],
  [/^(\d+)% to win$/, "$1% de chance"],
  [/^expected prize ₲ ([\d.,]+) · entry ₲ ([\d.,]+)$/, "prêmio esperado ₲ $1 · inscrição ₲ $2"],
  [/^room ([A-Z0-9]{4,8})$/, "sala $1"],
  [/^· (\d+) seats? · meeting (\d+) closes in$/, (m, n, k) => `· ${n} ${n === "1" ? "lugar" : "lugares"} · a reunião ${k} fecha em`],
  [/^· check (\S+@\S+) for a six-digit code$/, "· veja o código de seis dígitos enviado para $1"],
  [/^Room “(.+)”\. Anyone opening the link below joins this table\.$/, "Sala “$1”. Quem abrir o link abaixo entra nesta mesa."],
  [/^Offer her in the ring for ₲ ([\d.,]+)\.$/, "Oferecer no recinto por ₲ $1."],
  [/^This is your last horse: sell or breed another before consigning her\.$/, "Este é seu último cavalo: venda ou crie outro antes de consigná-lo."],
  [/^Costs ₲ ([\d.,]+) and you hold ₲ ([\d.,]+)\.$/, "Custa ₲ $1 e você tem ₲ $2."],
  [/^Revealing a genotype costs ₲ ([\d.,]+)\.$/, "Revelar um genótipo custa ₲ $1."],
  [/^Could not read your tokens: (.+)$/, "Não foi possível ler seus tokens: $1"],
  [/^Your yard has no horse left to race or breed\. (.+) is in the ring for ₲ ([\d.,]+) — buy (her|him) to start again\.$/, (m, n, p, w) => `Seu estábulo não tem mais cavalos para correr ou criar. ${n} está à venda por ₲ ${p}: compre ${w === "her" ? "a égua" : "o cavalo"} para recomeçar.`],
  [/^confirm sale · ₲ ([\d.,]+)$/, "confirmar venda · ₲ $1"],
  [/^Press again to sell (.+) to the house for ₲ ([\d.,]+)\.$/, "Toque de novo para vender $1 à casa por ₲ $2."],
  [/^(\d+) wins?$/, "$1 vitórias"],
  [/^best ([\d.,]+)$/, "melhor $1"],
  [/^start over · ([\d.,]+) ₲$/, "recomeçar · $1 ₲"],
  [/^standard ([\d.,]+) ₲$/, "padrão $1 ₲"],
  [/^age (\d+) · value ([\d.,]+) · (.+)$/, (m, a, v, b) => `idade ${a} · valor ${v} · ${BAND_PT[b] ?? b}`],
  [/^\+(\d+)% vigour$/, "+$1% vigor"],
  [/^inbreeding ([\d.]+)$/, "endogamia $1"],
  [/^(\d+) foals? left$/, "$1 potros restantes"],
  [/^collected in season (\d+)( · retired)?$/, (m, n, r) => `coletada na temporada ${n}${r ? " · aposentado" : ""}`],
  [/^(.+) is stakes class$/, "$1 agora é classe stakes"],
  [/^(.+) is near elite$/, "$1 agora está perto da elite"],
  [/^(\d+) in training$/i, "$1 em treinamento"],
  [/^season (\d+)$/i, "temporada $1"],
  [/^buy (?:horse )?([\d.,]+)\s*₲$/i, "comprar $1 ₲"],
  [/^buy · ([\d.,]+)\s*₲$/i, "comprar · $1 ₲"],
  [/^([\d.,]+) of ([\d.,]+)$/i, "$1 de $2"],
  [/^(.+) · age (\d+)$/i, "$1 · $2 anos"],
  [/^(.+) · season (\d+)$/i, "$1 · temporada $2"],
  [/^(.+) · (\d+) lots?$/i, "$1 · $2 lotes"],
  [/^(.+) · (\d+) horses?$/i, "$1 · $2 cavalos"],
  [/^(.+) · (\d+) in training$/i, "$1 · $2 em treinamento"],
  [/^Showing (\d+) of (\d+)$/i, "Mostrando $1 de $2"],
  [/^(\d+) entry fees?$/i, "$1 inscrições"],
  [/^S(\d+) · Season (\d+) opens\. Sales catalogues are live\.$/i, "T$1 · Temporada $2 aberta. Catálogos de venda disponíveis."],
  [/^S(\d+) · The house offers (.+) at ([\d.,]+) GNS\.$/i, "T$1 · A casa oferece $2 por $3 GNS."],
  [/^(.+) · unraced · runs (push|steady|hold)$/i, "$1 · sem corridas · tática $2"],
  [/^(.+) · ([\d.]+)x the field · unraced · runs (push|steady|hold)$/i, "$1 · $2x o campo · sem corridas · tática $3"]
];

const POST = [
  [/tática push\b/g, "tática atacar"],
  [/tática steady\b/g, "tática manter"],
  [/tática hold\b/g, "tática poupar"],
  [/\bx the field\b/g, "x o campo"],
  [/\bunraced\b/gi, "sem corridas"]
];

const whitespace = (value) => [value.match(/^\s*/)?.[0] ?? "", value.match(/\s*$/)?.[0] ?? ""];
const squash = (value) => value.replace(/\s+/g, " ").trim();
const NORMALISED = new Map([...DICT].map(([key, value]) => [squash(key), value]));

export function translate(value) {
  if (typeof value !== "string" || !value.trim()) return value;
  const trimmed = value.trim();
  const compact = squash(trimmed);
  const direct = DICT.get(trimmed) ?? NORMALISED.get(compact);
  if (direct) {
    const [lead, tail] = whitespace(value);
    return lead + direct + tail;
  }
  const [lead, tail] = whitespace(value);
  const built = composite(compact);
  if (built) return lead + built + tail;
  for (const [pattern, replacement] of PATTERNS) {
    if (pattern.test(compact)) return lead + compact.replace(pattern, replacement).replace(/\b1 anos\b/g, "1 ano") + tail;
  }
  let output = compact;
  for (const [pattern, replacement] of POST) output = output.replace(pattern, replacement);
  output = output
    .replaceAll("x the field", "x o campo")
    .replaceAll("runs push", "tática atacar")
    .replaceAll("runs steady", "tática manter")
    .replaceAll("runs hold", "tática poupar")
    .replaceAll("sem corridas · sem corridas", "sem corridas");
  output = output.replaceAll("upkeep", "manutenção");
  output = output.replace(/^value /, "valor ");
  if (/^Five goings, three meetings a season/.test(output)) {
    output = "Cinco pistas e três reuniões por temporada: o calendário não repete a mesma ficha em sequência. Os pesos vêm das regras do motor, e a ficha marcada como";
  }
  if (output !== compact) return lead + output + tail;
  return value;
}

const ERROR_MAP = new Map(Object.entries({
  "wrong email or password": "E-mail ou senha incorretos.",
  "this email already has a stable": "Este e-mail já tem um estábulo.",
  "a password is at least 8 characters": "A senha precisa ter pelo menos 8 caracteres.",
  "that is not an email address": "Informe um e-mail válido.",
  "sign in again": "Entre novamente.",
  "that session expired — sign in again": "Sua sessão expirou. Entre novamente.",
  "the meeting closes on the clock — enter your runners and wait": "A reunião fecha no relógio: inscreva seus corredores e aguarde.",
  "the entries window is still open": "A janela de inscrições ainda está aberta.",
  "too many actions: wait a moment": "Muitas ações em pouco tempo. Aguarde um instante.",
  "too many attempts: try again later": "Muitas tentativas. Tente novamente mais tarde.",
  "offline demo — sign in to use your online stable": "Demonstração offline: entre na conta para usar o estábulo online.",
  "invalid action": "Ação inválida.",
  "not your turn": "Não é a sua vez.",
  "spectators cannot act": "Espectadores não podem agir.",
  "spectators cannot reset": "Espectadores não podem reiniciar.",
  "Only the host can start from the lobby.": "Só o anfitrião pode iniciar a sala.",
  "Only the host can reset the room.": "Só o anfitrião pode reiniciar a sala.",
  "Join a new room to race.": "Entre em uma nova sala para correr.",
  "That action is not allowed.": "Essa ação não é permitida.",
  "select a horse in the lobby before starting": "Escolha um cavalo no lobby antes de iniciar.",
  "Invalid action": "Ação inválida.",
  "declare at least two runners first": "Ainda não há dois corredores declarados para esta reunião.",
  "the stable is still loading": "O estábulo ainda está carregando."
}));

export function translateError(message) {
  if (typeof message !== "string") return message;
  const exact = ERROR_MAP.get(message);
  if (exact) return exact;
  if (/^no such (room|endpoint)/i.test(message)) return "Não encontrado.";
  if (/^that is not a valid address/i.test(message)) return "Endereço de carteira inválido.";
  if (/^the chain relayer is not wired yet/i.test(message)) return "O relayer da rede ainda não está conectado.";
  return message;
}

function translateAttributes(element) {
  for (const name of ["placeholder", "title", "aria-label"]) {
    const value = element.getAttribute?.(name);
    if (!value) continue;
    const next = translate(value);
    if (next !== value) element.setAttribute(name, next);
  }
}

function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const next = translate(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node;
  if (["SCRIPT", "STYLE", "TEXTAREA"].includes(element.tagName)) return;
  if (element.id === "embedded-model" || element.closest?.("[data-no-i18n]")) return;
  translateAttributes(element);
  for (const child of element.childNodes) translateNode(child);
}

let queued = false;
function sweep() {
  queued = false;
  translateNode(document.body);
}
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(sweep);
}

const ua = typeof window !== "undefined" ? window.navigator?.userAgent ?? "" : "";
const isJsdom = /jsdom/i.test(ua);
if (!isJsdom && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

if (typeof window !== "undefined") {
  window.__studbookI18n = { translate, translateError };
}
