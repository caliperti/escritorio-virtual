# Escritório Virtual — um "Gather" caseiro, em Python puro

Escritório 2D onde cada pessoa é um avatar que anda pelo mapa. **Chegou perto de
alguém, a câmera e o microfone abrem sozinhos**; afastou, a conversa fecha. As
salas fechadas (🔒) são bolhas: quem está dentro só fala com quem está dentro.
Dá para **compartilhar a tela** a qualquer momento: ela entra no lugar da sua
câmera (`replaceTrack`), sem derrubar nenhuma conversa em andamento — e quem
chegar perto no meio da apresentação já pega a tela em vez da câmera.

É o mesmo modelo do Gather/Kumospace, sem serviço externo e sem Node — roda no
mesmo Python 3.9 dos outros apps.

## Stack
- **Backend:** FastAPI + WebSocket. Quem está na sala fica em memória (é efêmero);
  o mapa do escritório é gravado em `backend/mapa.json`. Porta 8400.
- **Frontend:** canvas 2D em JavaScript puro, sem libs nem build.
- **Áudio/vídeo:** WebRTC direto entre os navegadores. O servidor só encaminha
  os sinais de conexão — a mídia **não** passa por ele.

## Como rodar

```bash
cd escritorio-virtual
./iniciar.sh          # cria a .venv na primeira vez
```

Abra **http://localhost:8400**. Para testar sozinho, abra em duas abas anônimas
com nomes diferentes.

## Controles

| Tecla | O quê |
|---|---|
| `W A S D` / setas | andar |
| clique no chão | caminha até lá contornando os móveis (segurar o botão anda na direção do cursor) |
| `Enter` | escrever no chat · `Esc` sai do campo |
| `M` | liga/desliga o microfone · `V` a câmera · `R` reagir |
| `T` | compartilhar a tela (ou o botão 🖥️) · `Esc` fecha o vídeo aberto |
| `B` | editar seu boneco sem sair da sala |
| `E` | abrir o editor do escritório · `Delete` remove o móvel selecionado |
| `+` `−` `0` | aproximar, afastar e voltar ao zoom padrão (a roda do mouse também) |

**Clique num móvel** (mesmo sem abrir o editor) e abre o menu dele: ✋ mover,
🔁 trocar por outra peça que caiba, 🗑️ remover. **Clique na plaquinha da sala**
e abre o menu dela: renomear, trocar a cor, ligar o áudio fechado, redesenhar a
área ou remover. Tapete não abre menu — senão não daria para andar em cima.

Clique em qualquer miniatura de vídeo para abrir em tela cheia — é assim que se
assiste à apresentação de alguém.

**Microfone e câmera ligam e desligam a qualquer momento**, sem sair da sala.
Desligar não é só silenciar: a faixa é encerrada e o **equipamento é liberado**
(a luz da câmera apaga). Ligar de novo devolve a imagem nas conversas que já
estavam abertas, sem reconectar ninguém — e quem entrou em "só olhando" pode
ligar **só o microfone**, sem acender a câmera junto.

## O visual

O cenário segue a linguagem do Gather, que resolvi copiar em três decisões:

- **paredes claras com profundidade** — topo iluminado, rodapé e sombra caindo
  no chão, em vez do bloco escuro chapado de antes;
- **a área do time é o carpete**, não um retângulo tingido por cima de tudo: cada
  sala tem seu piso (lilás, azul, menta, rosa, madeira) e se anuncia por uma
  plaquinha flutuante com o pontinho da cor;
- **baias densas**: mesa geminada com monitor e teclado por posto, caneca,
  papéis, divisória de vidro fosco entre blocos e uma cadeira por lugar.

A paleta é clara e fixa (bege/branco no mobiliário, cor forte só nos carpetes e
nas telas), e toda peça é desenhada em 3/4 — tampo mais uma faixa da frente —
com luz no topo e contorno tingido pela própria cor.

## Sentar e computadores

**Pisar numa cadeira senta a pessoa** — cadeira, poltrona, banqueta ou sofá. O LPC
tem folha própria de sentado (3 poses × 4 direções), então é a pose de verdade, não
o boneco em pé em cima do assento. Quem decide é o cliente, olhando o que existe no
tile: não precisou de nada no protocolo.

A categoria **Computadores** tem 17 peças para montar o posto de cada um: monitor,
dois monitores, ultrawide curvo, setup gamer com gabinete, all-in-one, notebook,
tablet, headset, teclado e mouse. Cada tela desenha um conteúdo diferente (código,
planilha, gráfico, jogo, vídeo, chat, terminal, linha do tempo de edição, mapa), que é o que faz o computador parecer ligado.

## Os personagens

Sprites do **LPC (Universal LPC Spritesheet)**: 64×64 por quadro, 4 direções e
9 quadros de caminhada, em **camadas separadas** — corpo, cabeça, olhos,
sobrancelha, calça, sapato, camisa e cabelo. São 4× mais pixels que os 16×16 de
antes, que era de onde vinha o aspecto quadriculado.

Cada camada vem numa cor só, então a personalização é feita **recolorindo em
tempo de execução**: as cores de cada camada são ordenadas por luminância e
mapeadas numa rampa criada a partir da cor escolhida. Assim o sombreado original
é preservado e só o matiz muda — e sobra: 2 corpos × 6 peles × **10 cortes de
cabelo** (bagunçado, repartido, militar, espetado, raspado, franjão, chanel,
black power, longo, tranças) × 8 cores de cabelo × **5 barbas** × 10 camisas ×
5 calças. O resultado fica em cache por
combinação.

Uma pegadinha do formato, que custou tempo: no LPC o **corpo vem sem cabeça** e
sem rosto — cabeça, olhos e sobrancelha são camadas próprias. Sem elas o
personagem fica com o pescoço para cima vazio.

**Licença da arte** (`backend/static/assets/LICENCA-lpc.txt`): CC-BY-SA 3.0 /
GPL 3.0 — exige crédito aos autores do LPC e que modificações da arte sejam
compartilhadas sob a mesma licença. Não afeta o código do projeto. Os móveis
continuam desenhados aqui (`objetos.js`), sem restrição.

## A planta do escritório

O formato é **uma sala por pessoa**, não open space:

- **10 salas individuais** em volta (Recepção, Diretoria, Comercial, Marketing,
  Financeiro, Tráfego, Design, Suporte, TI e Conteúdo), cada uma com porta,
  piso próprio e **uma única mesa ampla (6×2)** — é sala de uma pessoa, não
  precisa de mais. O que muda de sala para sala é o **posto de trabalho**:
  atendimento com duas telas e impressora, ultrawide da diretoria, três telas do
  comercial, setup gamer com monitor em pé, edição de vídeo com microfone,
  all-in-one com mesa digitalizadora, e por aí;
- **uma sala de reunião grande** no meio à direita, com mesa comprida, 48
  lugares, quadro, TV e um canto de espera;
- **circulação** ligando tudo, com **café** e **convivência** (sofás, pebolim,
  TV) — áreas abertas, onde a conversa é por proximidade;
- **jardim** na entrada, com árvores, arbustos e bancos.

São 64×40 tiles e 14 áreas. A planta **se confere sozinha ao ser montada**:
se um enfeite fechar um canto e deixar parte da sala inalcançável a pé, ele é
removido automaticamente (`_desobstruir`) — mesas e cadeiras nunca. Os nomes são só o ponto de partida: clique na
plaquinha de qualquer sala para renomear (o nome da pessoa, por exemplo), trocar
a cor, ligar o áudio fechado ou redesenhar a área.

| Sala | Áudio |
|---|---|
| 🔒 as 10 individuais e a de reunião | fechado — só quem está dentro se ouve |
| Circulação, Café, Convivência | aberto — vale o raio de proximidade |

## Editar o escritório (o "Mapmaker")

Botão **🏗️** ou tecla **`E`**. Todo mundo pode editar, e a mudança aparece na
hora para quem está na sala.

| Ferramenta | O que faz |
|---|---|
| 🪑 **Móveis** | clique num espaço vazio para colocar. **Clique num móvel e abre o menu dele**: ✋ Mover (ele fica na mão até você clicar no destino), 🔁 Trocar (por qualquer peça que caiba no mesmo espaço, mantendo o lugar) e 🗑️ Remover. Arrastar continua movendo direto, e botão direito remove. Tem mesa, mesa de reunião, balcão, cadeira, sofá, poltrona, estante, armário, quadro branco, TV, tapete, planta, luminária, palco, pebolim, narguilé, cafeteira, geladeira, pia — e o que vai **em cima da mesa**: monitor, notebook, caneca, papéis, telefone, livros, vasinho, bolo |
| 🎨 **Piso** | madeira, carpete, azulejo, concreto, grama e os **carpetes de time** (lilás, azul, menta, rosa). `Shift` preenche um retângulo |
| 🧱 **Parede** | arraste para levantar; `Alt` (ou botão direito) derruba. **`Shift` preenche um retângulo inteiro** — é assim que se fecha um bloco novo de uma vez |
| 🚪 **Salas** | o jeito rápido é clicar na plaquinha da sala no mapa. Aqui, arraste para desenhar: sai uma **sala pronta** — parede em volta, porta de 2 tiles no lado que você escolher e o piso que escolher. Desmarque "levantar parede" para só marcar uma área. **📐 redesenha a área** de uma sala existente; clique no nome para renomear e trocar a cor; 🔒 liga/desliga o áudio fechado |
| 📍 **Entrada** | onde quem chega aparece |
| 🗑️ **Apagar** | remove móvel |

No rodapé: **Desfazer** (o servidor guarda os últimos 40 passos), **Ampliar**
(+6 colunas e +4 linhas, para caber sala nova) e **♻︎** (volta à planta original).

Como funciona por baixo: cada edição vira uma mensagem
`{tipo:'editar', acao:{…}}`. Quem valida, aplica, grava em **`backend/mapa.json`**
e devolve o mapa inteiro para todo mundo é o servidor — o cliente nunca edita
o próprio mapa sozinho. São ~20 KB por edição e elas são esporádicas (arrastar
só envia quando você solta), então não vale a pena sincronizar diferença por
diferença e arriscar as duas pontas divergirem.

Os móveis usam a **mesma linguagem visual dos bonecos**: contorno escuro tingido
pela cor da própria peça (o desenho é pintado cinco vezes, quatro deslocadas e
escuras — igual em `boneco.js`), luz vindo de cima e um naco da frente aparecendo
sob o tampo, que é o que dá volume numa vista de cima.

O que cada móvel **ocupa e bloqueia** está em `mapa.py:CATALOGO`; como ele é
**desenhado**, em `static/objetos.js`. É de propósito: o servidor precisa saber
o que ocupa espaço, não o que é bonito. Para inventar um móvel novo, acrescente
uma linha `_item(...)` no catálogo e um desenho com o mesmo id em `DESENHOS`.

A planta de fábrica (usada no primeiro boot e no botão ♻︎) está em
`backend/planta_padrao.py`.

## Colocar no ar

**Agora, sem conta em lugar nenhum** — túnel rápido da Cloudflare (o https é o
que libera câmera e microfone fora do localhost):

```bash
./iniciar.sh &     # o escritório na porta 8400
./publicar.sh      # imprime um endereço https://…trycloudflare.com
```

O link vale enquanto o processo estiver de pé e a máquina ligada.

### Deixar de pé sozinho

```bash
launchctl load ~/Library/LaunchAgents/com.escritorio.servidor.plist
launchctl load ~/Library/LaunchAgents/com.escritorio.tunel.plist
./endereco.sh          # mostra o endereço de agora e se responde
```

Os dois agentes sobem no login e são reiniciados se caírem. O `tunel.sh` não é
só "rodar o cloudflared": ele confere o endereço de fora em fora e, se parar de
responder três vezes seguidas, se mata para o launchd subir outro — foi
exatamente esse o caso que tirou o sistema do ar (o processo continuou vivo
tentando reconectar para sempre, então nada percebia a queda).

**O endereço muda a cada reinício do túnel** — é a limitação do túnel rápido, e o
motivo de valer a pena o deploy fixo. `endereco.txt` guarda o atual e
`endereco.log`, o histórico.

Para desligar: `launchctl unload ~/Library/LaunchAgents/com.escritorio.*.plist`

### Contas

Cada pessoa **se cadastra uma vez** com o **código de convite** (a variável
`SENHA`), escolhe o personagem e pronto: nas próximas vezes entra com nome e
senha, e o boneco volta como ficou. A sessão fica guardada no navegador, então
na prática é só abrir o link.

- senha nunca é guardada: só o hash PBKDF2 com sal por conta (`contas.py`);
- trocar o personagem dentro da sala (tecla `B`) salva na conta;
- `contas.json` fica fora do git.

### Onde o estado sobrevive

O disco do Render gratuito é apagado toda vez que o serviço hiberna — o que
apagaria contas e escritório editado. Então, quando existem as variáveis
`GITHUB_TOKEN` e `GITHUB_REPO`, `nuvem.py` **espelha o estado no próprio
repositório**: baixa na subida e sobe as mudanças agrupadas a cada 20s.

Como o repositório é público, `contas.json` vai **cifrado** (Fernet, chave em
`ESTADO_CHAVE`) — hash de senha e token de sessão não podem ficar legíveis. O
`mapa.json` sobe em claro, que não tem nada sigiloso.

Sem essas variáveis nada disso acontece e valem os arquivos locais, que é o
certo para rodar na sua máquina.

### Senha da sala (código de convite)

A senha fica no arquivo **`.env`** (fora do git), e o `iniciar.sh` a carrega
sozinho — sem isso, cada reinício subiria a sala aberta de novo:

```bash
SENHA=escritorio2026
```

Todo mundo usa a **mesma senha** e cada um digita o **próprio nome**: o campo de
senha só aparece na entrada quando o servidor está protegido (o cliente pergunta
em `/config`). Não há conta individual — quem tem link e senha entra com o nome
que quiser. Para identidade de verdade (cada funcionário com login próprio), o
caminho é plugar na área de membros, que já tem usuários.

Sem `.env`, ou com `SENHA` em branco, a sala fica aberta para quem tiver o link.

### No ar em endereço fixo

**https://escritorio-virtual-3al4.onrender.com** — plano gratuito do Render,
a partir do repositório <https://github.com/caliperti/escritorio-virtual>.

Para publicar mudanças: `git push github main` **e disparar o deploy** —
serviço criado a partir de repositório público não tem webhook do GitHub, então
o Render não fica sabendo do push sozinho:

```bash
curl -X POST -H "Authorization: Bearer $RENDER_KEY" \
  https://api.render.com/v1/services/srv-da87vhajnfac73d383u0/deploys -d '{}'
```

(ou *Manual Deploy → Deploy latest commit* no painel do Render). Para recriar o serviço do zero em outra conta:
`RENDER_KEY=rnd_xxx SENHA=xxx REPO=https://github.com/... ./deploy-render.sh`.

O que esperar do plano gratuito:

- **dorme após 15 min sem ninguém** e leva ~1 min para voltar; no meio do
  despertar algumas requisições respondem 404 (é o roteador do Render, não o
  app) — basta recarregar;
- **disco efêmero**: edições feitas no escritório pelo editor 🏗️ se perdem
  quando ele reinicia, voltando ao `mapa.json` do repositório. Para fixar um
  layout novo, comite o `mapa.json`;
- a senha fica na variável de ambiente `SENHA` do serviço, não no código.

O mesmo `Dockerfile` serve para Fly.io, Koyeb ou uma VPS, onde nada disso
acontece. **Hugging Face Spaces não serve mais**: Docker lá virou plano PRO.

## Abrir para outras pessoas na rede local

Navegador só libera câmera/microfone em `localhost` ou em **https**. Para a equipe
entrar de outra máquina:

```bash
./gerar-certificado.sh
PORTA=8400 ./iniciar.sh --ssl-keyfile backend/certificado/chave.pem \
                        --ssl-certfile backend/certificado/certificado.pem
```

Cada um abre `https://SEU_IP:8400` e aceita o aviso de certificado. Fora da rede
local (internet), o WebRTC ainda precisa de um servidor TURN quando as duas pontas
estão atrás de NAT fechado — os STUN públicos do Google já vêm configurados e
resolvem a maioria dos casos.

## Limites conhecidos
- **Mesh P2P:** cada pessoa conecta com cada vizinho. Ótimo até ~6 pessoas juntas
  no mesmo círculo; acima disso a CPU/upload começam a pesar. Para grupos maiores
  o caminho é uma SFU (mediasoup, LiveKit) — aí sim entra outra stack.
- Sem login e sem histórico: quem tem o link entra, e o chat morre com a sessão.
