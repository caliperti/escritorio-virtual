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
| `W A S D` / setas | andar (segurar o clique no chão também anda) |
| `Enter` | escrever no chat · `Esc` sai do campo |
| `M` | microfone · `V` câmera · `R` reagir |
| `T` | compartilhar a tela (ou o botão 🖥️) · `Esc` fecha o vídeo aberto |
| `B` | editar seu boneco sem sair da sala |
| `E` | abrir o editor do escritório · `Delete` remove o móvel selecionado |

Clique em qualquer miniatura de vídeo para abrir em tela cheia — é assim que se
assiste à apresentação de alguém.

## Os bonequinhos e os móveis

A arte vem de dois pacotes do **Kenney** em **domínio público (CC0)** — sem
obrigação de licença, uso comercial liberado (`backend/static/assets/LICENCA-*.txt`):

- **RPG Urban Pack** — os personagens: 6 pessoas, cada uma com **4 direções e 3
  quadros de caminhada**;
- **Roguelike Indoors** — mesas, cadeiras, sofás, balcões, tapetes, plantas,
  quadros e afins.

Para não perder a personalização com sprites prontos, `boneco.js` **recolore a
camisa e o cabelo em tempo de execução**: as cores originais de cada personagem
estão mapeadas e são trocadas pixel a pixel por tons da cor escolhida, com o
resultado em cache. São 6 personagens × 10 cores de camisa × 8 de cabelo.

Alguns itens não existem num pacote medieval — monitor, notebook, TV, quadro
branco, narguilé, pebolim — e continuam desenhados em `objetos.js`, na paleta
dos tiles e com as coordenadas presas à grade de 2px para não destoar.

De qual tile sai cada móvel está em `objetos.js:MAPA`; o que ele ocupa e bloqueia,
em `mapa.py:CATALOGO`.

## A planta do escritório

O escritório vem com nove salas — Recepção, Sala de Reunião, Sala de Foco,
Diretoria, Coworking, Café, Lounge, Auditório e Sala de Jogos — e ~236 móveis
já posicionados.

| Sala | Áudio |
|---|---|
| Recepção, Coworking, Lounge | aberto — você ouve quem está no raio de ~5 tiles |
| 🔒 Reunião, Foco, Diretoria, Café, Auditório, Jogos | fechado — só quem está dentro |

Quando duas salas se sobrepõem, **vence a menor**: dá para desenhar uma salinha
fechada no meio do coworking que ela passa a valer ali dentro. (A regra está em
`mapa.py:zona_de` e em `app.js:zonaDe` — mudou uma, mude a outra.)

## Editar o escritório (o "Mapmaker")

Botão **🏗️** ou tecla **`E`**. Todo mundo pode editar, e a mudança aparece na
hora para quem está na sala.

| Ferramenta | O que faz |
|---|---|
| 🪑 **Móveis** | clique para colocar; arraste para mudar de lugar; botão direito remove. Tem mesa, mesa de reunião, balcão, cadeira, sofá, poltrona, estante, armário, quadro branco, TV, tapete, planta, luminária, palco, pebolim, narguilé, cafeteira, geladeira, pia — e o que vai **em cima da mesa**: monitor, notebook, caneca, papéis, telefone, livros, vasinho, bolo |
| 🎨 **Piso** | pinta madeira, carpete, azulejo, concreto ou grama |
| 🧱 **Parede** | arraste para levantar; `Alt` (ou botão direito) derruba — é assim que se abre uma porta ou se fecha um canto novo |
| 🚪 **Salas** | arraste para criar; **📐 redesenha a área** de uma sala existente (é como se aumenta uma sala); clique no nome para renomear e trocar a cor; 🔒 liga/desliga o áudio fechado |
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

### Senha da sala

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

**Permanente e de graça** — tem `Dockerfile` e `render.yaml` prontos:

1. suba a pasta para um repositório no GitHub;
2. em [render.com](https://render.com): *New → Blueprint* → aponte para o repositório;
3. defina a variável `SENHA` (ou deixe em branco para sala aberta).

O plano gratuito do Render dorme depois de 15 min sem ninguém — a primeira visita
depois disso demora ~30 s. O mesmo `Dockerfile` serve para Fly.io, Koyeb ou
Hugging Face Spaces. **Atenção:** nesses serviços o disco é efêmero, então o
`mapa.json` volta à planta padrão a cada reinício — se o escritório editado
importa, comite o `mapa.json` no repositório.

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
