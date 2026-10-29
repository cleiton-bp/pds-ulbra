# Painel do Relato Fácil

Frontend da plataforma. React 19, TypeScript, Vite, Tailwind 4.

> **Todo dado vem da API.** Consultar, cadastrar e alterar passam por
> `api/`, que lê e grava no PostgreSQL. Não há mais camada de demonstração: para
> abrir o painel é preciso a API no ar e um client id do Google.

Implementação do design **`Painel de relato de bugs`** (Claude Design). As
divergências entre a prancheta e o código estão no fim deste arquivo.

---

## Rodar

Precisa de **Node 22 ou mais novo**.

```bash
cd web
cp .env.example .env.local   # e preencha as duas variáveis
npm install
npm run dev
```

Abre em **`http://localhost:5173`**, e precisa da API rodando em
`http://localhost:5080` (veja [`../api`](../api)).

| Variável | Para quê |
|---|---|
| `VITE_API_URL` | Endereço da API. Padrão `http://localhost:5080` |
| `VITE_GOOGLE_CLIENT_ID` | ID do cliente OAuth, do Google Cloud |
| `VITE_LOADER_URL` | Opcional. De onde o carregador da ferramenta é servido, no trecho que o cliente cola no sistema dele. Padrão: a origem do painel, `/v1/pds.js` |

Nenhuma delas é segredo: o Vite injeta toda `VITE_*` no bundle, então quem
abre o devtools as lê. O segredo mora na API — chave de assinatura do JWT e
string de conexão nunca chegam ao navegador.

Três coisas travam quem liga pela primeira vez, e todas dão erro silencioso:

- `http://localhost:5173` precisa estar nas **Origens JavaScript autorizadas** do
  cliente OAuth, no Google Cloud. Sem isso o Google recusa antes de desenhar o
  botão, e o erro sai no console do navegador.
- `CORS_ALLOWED_ORIGINS` no `.env.local` **da API** precisa incluir a mesma
  origem. Lista vazia lá significa nenhuma origem liberada, e não todas.
- O `GOOGLE_CLIENT_ID` da API precisa ser **o mesmo** do painel: ele é conferido
  como `aud` do token, e um token emitido para outra aplicação é recusado.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe em `http://localhost:5173` |
| `npm test` | Lógica, arquitetura, sistema visual, os ganchos e as telas (Vitest; as telas em jsdom) |
| `npm run typecheck` | `tsc --noEmit`, com `strict` ligado |
| `npm run lint` | Biome: linter e formatador |
| `npm run format` | Aplica as correções do Biome |
| `npm run build` | Checa os tipos, gera o carregador e depois `dist/` |
| `npm run build:loader` | Só o carregador e o arquivo da captura, em `public/v1/pds.js` e `public/v1/pds-captura.js` |

---

## As telas

```
/projects ........................ hub — saudação, criar projeto, busca (atalho /), abertos recentemente, ordem, lista por conta, arquivados recolhidos
/projects/:publicId .............. a porta — Trabalho para todos; Configurar o projeto para quem administra, enquanto o sistema do cliente não mandou relato
/projects/:publicId/reports ...... console — Trabalho: os relatos e os cards do time, em lista, quadro e backlog
/projects/:publicId/members ...... console — Membros: o time, sair dele, e os convites para quem administra
/projects/:publicId/moderation ... console — Moderação: o que vira público
/projects/:publicId/configure .... console — Configurar o projeto: primeiros passos, busca e as cinco áreas
/projects/:publicId/start ........ O seu sistema — Instalação: 3 passos, e se já está funcionando; o próprio botão e as chaves em "Avançado"
/projects/:publicId/keys ......... O seu sistema — Chaves: a pública e, sob pedido, a secreta (aberta pela Instalação)
/projects/:publicId/tool ......... O seu sistema — O botão: se aparece, como é e onde fica
/projects/:publicId/domains ...... O seu sistema — Domínios: aguardando, autorizados, bloqueados e o histórico; os limites de relato na aba Proteção
/projects/:publicId/report-types . O formulário — Tipos de relato: o que quem relata escolhe, o que cada um pergunta e onde entra
/projects/:publicId/form-texts ... O formulário — Formulário: título, enviar, tema, pergunta do título, seletor de tipo, pergunta do nome
/projects/:publicId/media ........ O formulário — Anexos: o que dá para anexar
/projects/:publicId/public-stages  O acompanhamento — Andamento público: a jornada que quem relatou acompanha
/projects/:publicId/cycle ........ O acompanhamento — Ciclo: como o relato fecha e reabre
/projects/:publicId/identity ..... O acompanhamento — Quem relata: como é reconhecido, quem pode ver, o que lê depois de enviar
/projects/:publicId/states ....... O quadro — Colunas: as colunas, o que quem relatou vê em cada uma; o fim e os prazos num grupo próprio
/projects/:publicId/priorities ... O quadro — Prioridades: as do projeto
/projects/:publicId/labels ....... O quadro — Etiquetas: criar e organizar
/projects/:publicId/sprints ...... O quadro — Sprints: ligar e a duração de cada uma
/projects/:publicId/settings ..... O time — Projeto: o nome, o identificador e arquivar, nada recolhido
/invite#t=... .................... o link do e-mail do convite — abrir e aceitar
/profile ......................... endereço antigo do perfil: abre o diálogo sobre o hub (`#sons` vai aos sons)
```

**Cada tela é um pedaço próprio do pacote** (`sobDemanda`, em `app/routes.tsx`): as cascas, a sessão e o roteador
ficam no pacote de entrada, e a tela pedida chega na partida. A intenção de abrir já busca a tela — o ponteiro sobre
um link, o dedo encostando nele ou o foco do teclado —, e nada é baixado para uma tela que ninguém abre.

Dois níveis, como um console de nuvem. **Não existe rota `/login`**: quem abre
uma URL sem sessão vê a entrada naquele mesmo endereço e cai direto onde queria.

**A porta é o Trabalho.** `/projects/:publicId` (`ProjectHome`) leva todo mundo ao
**Trabalho**; quem administra vai a **Configurar o projeto**, com os primeiros passos no topo, só enquanto o sistema do cliente não mandou
relato nenhum — `LastReportReceivedAt` nulo, no projeto que a API devolve; o card do time não
conta. **O seletor do topo mantém a tela**: de Colunas num projeto para Colunas no outro;
a tela de configuração num projeto que a pessoa não administra vira o Trabalho, e o card
aberto vira a lista do outro projeto.

**A lateral** (`app/navigation.ts`) tem o trabalho em cima, sem rótulo — Trabalho, Membros,
Moderação — e **Configurar o projeto** embaixo, um item só, que leva à página central
(`app/configure/`): os primeiros passos conferidos pelos dados, a busca sobre o índice de
todas as opções (`settingsIndex.ts`, que leva a `tela#campo`, abre o grupo em volta e acende o
campo) e as cinco áreas, cada uma com o resumo do que está configurado. Dentro da
configuração, as áreas aparecem na lateral: **O seu sistema** (Instalação · O botão ·
Domínios), **O formulário** (Tipos de relato · Formulário · Anexos), **O
acompanhamento** (Andamento público · Ciclo · Quem relata), **O quadro** (Colunas ·
Prioridades · Etiquetas · Sprints) e **O time** (Membros · Projeto). Chaves não tem item: abre
pela Instalação.
Os nomes são os do time, e os endereços, os de antes — já foram copiados para conversas. O
campo que mudou de tela leva o endereço antigo junto: `tool#confirmacao` abre Quem relata,
`identity#limites` abre Domínios (`MovedAnchors`).

**Cada tela diz em uma linha para que serve, e os assuntos dela ficam em grupos**
(`SettingsGroup`, em acordeão): fechado, cada grupo já diz o que está escolhido, com uma amostra
em palavras, e o que mudou do padrão de fábrica, com o próprio "Voltar ao padrão", que troca só
aqueles campos no rascunho; a explicação longa espera no "Como funciona". Já houve um "Mais
opções" em cada tela, e ele misturava assuntos: hoje só a Instalação guarda um recolhido, o
"Avançado" (`MoreOptions`), e o endereço antigo `#mais-opcoes` cai onde aquilo mora agora. Os padrões que a API não devolve (Ciclo, Anexos) têm a segunda cópia em
`shared/lib/factoryDefaults.ts`, conferida contra o C# por `test/factoryDefaults.test.ts`.
No computador, "Recolher menu" deixa só os glifos; no celular, a gaveta rola, e o Esc a
fecha. O primeiro Tab é "Pular para o conteúdo", e o título da aba diz a tela e o projeto.

O membro não vê **Configurar o projeto**, e o endereço de uma seção dele, digitado ou num
link antigo, o manda para o Trabalho. A regra mora na API, que recusa com 403 o que o
membro tentar mudar; aqui só se decide o que mostrar. O hub e o seletor do topo agrupam
os projetos pela conta dona quando há mais de uma — "Seus projetos" primeiro —, e no
hub o projeto de outra conta mostra o papel da pessoa nele.

**O hub com muitos projetos se organiza, e não se pagina.** Projeto não é item de feed: a
pessoa quer ver todos e achar o dela. A partir de cinco projetos aparecem a busca (atalho
`/`, Esc limpa), os **abertos recentemente** (os últimos que a pessoa abriu neste navegador,
guardados por `shared/lib/recentProjects.ts` quando a casca do projeto abre — histórico, como
o do navegador, e por isso local), a **ordem** (último movimento, o padrão, ou nome; a
escolha fica no navegador) e os **arquivados recolhidos** no fim. Buscando, a lista é uma
só, com os arquivados juntos. Com menos de cinco, a lista simples de sempre.

**Um jeito de salvar por tela.** As listas (Colunas, Prioridades, Etiquetas, Tipos de
relato, Andamento público, Domínios, Membros) gravam na hora, item a item — e o que nelas é
um pequeno formulário (as regras do quadro em Colunas, os limites em Domínios) abre como um
item, com Salvar e Cancelar. Os formulários (O botão, Formulário, Anexos,
Ciclo, Sprints, Quem relata, Projeto) salvam pelo cabeçalho `SettingsHeader` — o título
com "Descartar · Salvar" ("Publicar" no que aparece no sistema do cliente) ao lado, preso no
topo ao rolar, sem cobrir o conteúdo. Sem mudança ele diz "Tudo salvo" ("Tudo publicado") e os
botões ficam desligados; com mudança, diz quantas são. Nunca os dois na mesma tela. Sair com mudança não salva, por outra tela, pelo navegador ou trocando de projeto,
pergunta "Sair sem salvar?". **Três registros da API aparecem em mais de uma tela** (a
configuração da ferramenta, a de quem relata e as regras do ciclo): cada tela relê antes de
gravar e manda o registro inteiro com só os campos dela mudados (`useSettingsDraft`); se outra
pessoa mudou os mesmos campos nesse meio tempo, nada é gravado e a tela avisa. A rota que quebra mostra
`RouteErrorScreen`, com "Recarregar a página" e "Voltar aos projetos", em vez do rastro de
pilha; e `describeError` diz a falha na língua do time — sem conexão, servidor fora — e
acentua no caminho as mensagens da API, que vêm sem acento.

---

## As pastas

```
src/
├── app/          a casca: rotas, cascas visuais, tema, sessão
├── contracts/    os view models da API, em PascalCase
├── data/         de onde vêm os dados
│   ├── index.ts        ← ponto de acesso do PAINEL (arrasta a sessão junto)
│   ├── publicIndex.ts  ← ponto de acesso do QUADRO (sem sessão nenhuma)
│   └── api/            fetch, envelope, token, 401
├── embed/        a ferramenta de relato: o que roda no site do cliente
├── tracking/     a página pública: onde quem relatou vê o próprio relato
├── loader/       o <script> que o cliente cola; roda no documento DELE
├── capture/      o que redesenha a página como imagem (pds-captura.js, baixado no clique)
├── editor/       o editor da imagem: marcar e esconder antes de anexar (baixado ao abrir)
├── features/     um assunto por pasta: auth, projects, projectKeys, projectStates,
│                 priorities, labels, reportTypes, publicStages, cycle (Ciclo e Sprints),
│                 identity, media, moderation, onboarding, reports,
│                 notifications, profile, widgetSettings
├── shared/       componentes, hooks e utilitários sem dono
├── styles/       o sistema de cor, em duas camadas de token
└── test/         o que o npm test cobra do projeto inteiro: arquitetura, sistema visual, e o que existe nas duas linguagens
```

**Por que dois pontos de acesso.** `data/index.ts` liga os serviços do painel, e
junto deles vem `sessionToken`, que lê `localStorage`. Com o quadro importando
aquele arquivo, o pacote que `embed.html` carrega passava a conter a chave
`pds.web.session` — código de sessão do administrador dentro de um documento que
qualquer site do mundo embute. Foi medido no `dist`, não suposto.

Isso valia para **dois** documentos e hoje vale para **três**: `index.html` é o
painel, e `embed.html` e `tracking.html` são abertos por gente que não tem conta
aqui. Os dois últimos passam por `data/publicIndex.ts`, e a medição no `dist`
cobra os dois.

```
   app  →  features  →  data · shared  →  contracts
```

As setas são de mão única, e três regras sustentam isso: nenhuma tela alcança
`data/api`, nenhuma tela importa de `app/`, e nenhuma feature importa de outra.
Não fica só escrito aqui —
[`src/test/architecture.test.ts`](src/test/architecture.test.ts) percorre os
arquivos e reprova o `npm test` com o nome do import que quebrou a regra, e traz
o motivo de cada uma.

---

## A ferramenta de relato

Três peças, em três origens diferentes — e essa separação é o desenho, não um
acidente:

```
   site do cliente          nosso domínio              nossa API
   ──────────────────       ────────────────────       ─────────────────
   <script src=...>    →    /v1/pds.js  ─────────────→ GET /public/widget-launcher
        │                        │                     a aparência do botão
        │  desenha o botão;      │                     POST /public/reports
        │  no clique, o iframe   │                            ↑
        └───────────────→   /embed.html  ───────────────────────┘
                  postMessage         o relato, com a chave pública
                                 │
                                 │  a confirmação entrega um link
                                 ↓
                            /tracking.html            POST /public/reports/tracking
                                                      o protocolo e o token do link
```

**O carregador (`src/loader/`) desenha só o botão, e o resto vem sob pedido.** Ele lê a
aparência do botão numa rota leve (`GET public/widget-launcher`, guardada cinco minutos
pelo navegador) e desenha um `<button>` de verdade dentro de **um** elemento,
`<pds-launcher>`, com sombra fechada: o CSS do cliente não alcança o botão, o nosso não
vaza para a página, e nada mais do documento dele é tocado. As contas (tamanho, cantos,
canto da tela, celular, páginas escondidas) são as de `src/embed/launcher.ts`, e os
desenhos os de `src/embed/launcherIcons.ts` — os mesmos que a prévia do painel usa, com
o mesmo `src/loader/launcherView.ts`. Ele sai em IIFE e não carrega React.

**O quadro só é criado quando alguém pede para abrir.** Passar o mouse, focar ou tocar
no botão já o adianta, escondido; no clique, enquanto ele não responde, o carregador
mostra uma tela de "abrindo" no canto (`role="status"`). O quadro nasce no formulário
(o `init` leva `launcher: 'host'`), avisa com `close` quando a pessoa fecha — o
carregador o esconde e guarda, devolve o botão e o foco — e com `unavailable` quando
não há o que abrir. Projeto desligado, chave recusada, endereço fora da lista ou rede
fora: nenhum botão. As páginas escondidas são conferidas a cada navegação (Navigation
API, `popstate`, `hashchange`) sem mexer no `history` da página.

**O cliente pode usar o próprio botão.** Com `data-button="none"` no script, nada é
desenhado e **nenhuma requisição sai até alguém pedir**. Abre por `Pds.open()` (e
fecha por `Pds.close()`; o objeto é congelado e definido uma vez, e chamar antes de o
carregador terminar fica na fila) ou por qualquer elemento com `data-pds-open`, com um
ouvinte só no documento.

**O crachá da pessoa também vem pelo script, e só por ele.** No projeto que herda a
identidade do sistema do cliente, o servidor dele assina quem está na conta num token curto
— o crachá — e o põe em `data-identity`, ao lado de `data-key`; quem não está na conta fica
sem o atributo. O carregador o lê ao iniciar **e a cada abertura**, e não uma vez: o site pode
renovar a sessão, e a pessoa pode entrar ou sair sem recarregar a página. Ele vai ao quadro
por `postMessage` (`init` e `open`), e nunca na URL do quadro nem em query string. O quadro
não confere nada dele — quem confere a assinatura é a API, com a chave pública do projeto —,
e o atributo acima de 4096 caracteres, o teto da API, é tratado como ausente.

**O peso, medido no `dist` (gzip, como o Vite informa):**

| | Antes | Agora |
|---|---|---|
| Toda visita, sem clique | `pds.js` (~3,5 kB) **e** o quadro inteiro (~108 kB: ~95 kB de JS, ~13 kB de CSS) | `pds.js` (8,8 kB) e a aparência do botão (menos de 1 kB, em cache por 5 min) |
| Com `data-button="none"` | o mesmo | `pds.js` (8,8 kB) e mais nada |
| No primeiro clique | — | o quadro: `embed.html` (0,6 kB), JS (~95 kB, ~62 deles o React) e CSS (~13 kB) |

O carregador cresceu (o botão, os ícones e a tela de "abrindo" moram nele agora), e a
visita que não clica deixou de baixar cerca de 108 kB.

**A exceção é a captura, e só quando a pessoa pede.** Código dentro de um quadro
de outra origem não alcança a página, então quem captura é o carregador: ele
esconde o quadro, desenha a camada de marcar a área (numa sombra, com estilo
próprio) e baixa `pds-captura.js` — a biblioteca que redesenha a página como
imagem (`@zumer/snapdom`), com uns 50 kB comprimidos — só nesse clique. A imagem
volta para o quadro pela mesma conversa e abre no editor; concluída, entra na lista
como um arquivo escolhido. Ver `src/loader/captureFlow.ts` e `src/capture/`.

**O editor da imagem (`src/editor/`) é onde a pessoa esconde o que não quer
mostrar** — a captura não esconde nada sozinha. Toda imagem da lista abre nele: a
capturada, a escolhida e a colada. As marcas ficam numa lista à parte e o original
não muda, então reabrir traz as marcas editáveis; o arquivo que sobe é desenhado de
novo, e o que a tarja cobriu não existe nele — nem na miniatura, que sai dele. O
editor chega por import dinâmico, só quando alguém o abre (uns 20 kB comprimidos, com o
diálogo que ele usa), e no quadro pede à página um tamanho maior enquanto está aberto.

**A imagem entra no relato logo abaixo do texto, no tamanho que a pessoa escolhe** —
um terço da linha, meia, três quartos ou a linha inteira, que é o padrão. O tamanho e
a posição vão com o arquivo, e o relato aparece do mesmo jeito no acompanhamento, na
resposta, na reabertura e no painel: a mesma grade de doze colunas
(`src/shared/lib/displaySize.ts`), que no quadro estreito e na página larga põe as
mesmas imagens lado a lado. O que aparece é o arquivo, e não a miniatura, e ele só
baixa quando chega perto da tela.

**O arquivo que não é imagem — PDF, log, planilha; zip não — é categoria própria**, que o
dono liga na tela Anexos e da qual marca os formatos (o catálogo e a conferência dos
bytes são da API). No quadro ele tem botão próprio e entra numa lista logo abaixo das
imagens; é reconhecido pela extensão, e sobe com o tipo que a API dá a ela, e não com
o que o navegador deduziu. Do lado de lá, é sempre baixado: o endereço assinado já
manda o arquivo como anexo, e nada dele abre na página.

**A conversa entre os dois passa por três conferências**, iguais nas duas pontas:
a origem esperada, a janela exata (`event.source`), e o carimbo `source: 'pds'`.
A segunda é a que costuma faltar — sem ela, outro quadro da **mesma** origem se
passa pelo nosso. Nenhuma resposta sai para `'*'`.
[`src/embed/hostBridge.test.ts`](src/embed/hostBridge.test.ts) exercita cada uma
pelo caminho em que ela falha: remover qualquer guarda reprova três testes.

**A configuração vive em `contracts/widgetSettings.ts`** — os campos que decidem
textos, cores, tema, a aparência do botão, as páginas onde ele não aparece, se o seletor de tipo
aparece, qual tipo vem marcado e como a pergunta do título é feita. Três telas os editam, cada
uma com os do seu assunto — **O botão** (o botão em si), **Formulário** (os textos e
as perguntas fixas) e **Quem relata** (o que a pessoa lê depois de enviar) —, a API os guarda, e o quadro os lê pela chave
pública antes de desenhar qualquer coisa. Projeto que nunca salvou nada recebe os padrões de
`embed/settings.ts`, na mesma forma — e quem lê não distingue os dois casos.

**Os tipos de relato vêm junto, e são do projeto.** A mesma leitura traz `Types`: os tipos ativos,
na ordem do projeto, cada um com o desenho, o nome e **o jeito de perguntar** — até quatro
perguntas curtas, a caixa de texto livre com o texto cinza dela, ou os dois. O quadro desenha os
botões de tipo a partir dela (o seletor escondido manda o pré-marcado), e o tipo escolhido desenha
as perguntas, cada uma num campo pequeno, e a caixa; o envio pede ao menos uma resposta, ou a
caixa, e manda `TypeId`, `Answers` (uma por pergunta, a pulada em branco) e `Text` (a caixa).
Trocar de tipo no meio não apaga o que foi escrito no outro. Os tipos são relidos a cada vez que o
quadro abre: a API recusa a resposta a perguntas que mudaram e pede para fechar e abrir de novo.
Com a leitura falhando, o quadro desenha os três tipos de fábrica (`FALLBACK_REPORT_TYPES`), que
não têm identificador de verdade — e, ao enviar, lê de novo e procura o tipo com o mesmo nome e as
mesmas perguntas; sem achar, diz que o relato não saiu, com o texto ainda na tela.

**O quadro nasce invisível, e só aparece quando alguém pediu e ele já respondeu.** O
carregador o cria escondido, e o próprio quadro só se revela (`show`) depois de ler a
configuração: o formulário chega já com os textos e o tema do projeto, em vez de um
rótulo de fábrica trocando na frente de quem já estava lendo (`embed/main.tsx`,
`draw.tsx`). O botão é outra conversa: quem o desenha é o carregador, pela rota leve,
e ali **qualquer falha é "sem botão"** — chave que não vale, endereço fora da lista,
ferramenta desligada, rede fora: adivinhar um botão poderia colocá-lo onde o projeto
não quer.

**O botão parado na página mora em `embed/launcher.ts`**, sem React e sem dependência: o canto
(um dos quatro) e a distância dele, o tamanho do quadro recolhido — a largura acompanha o texto,
medido pelo quadro, e nunca fica abaixo da de sempre —, o arredondamento, a sombra, o modo do
celular (janela com menos de 640 pixels) e a regra das páginas escondidas (`isHiddenPage`). O
quadro diz tudo isso no pedido de tamanho (`place`, antes de `show`); o carregador confere
(`readResize`) e posiciona com `placeFrame`. Numa página da lista, ou no celular com o botão
escondido, o quadro nunca pede para aparecer. É também onde o carregador vai buscar a regra
quando passar a desenhar o botão.

**A prévia é o mesmo quadro**, aberto em `embed.html?preview` (`shared/components/WidgetPreview`),
em O botão, Tipos de relato (com o tipo aberto no editor), Formulário e Anexos
(com a área de anexar do rascunho, em `PreviewMessage.media`): o painel manda o
rascunho por `postMessage` a cada mudança, e faz o papel do carregador numa página de mentira, com
a mesma `placeFrame` — computador ou celular. Só a janela de cima e só da mesma origem: o quadro em
prévia ignora o resto, e nunca envia nada.

**O quadro manda três dados que ninguém digitou** — navegador, idioma e o tamanho
da janela da página ([`src/embed/reportContext.ts`](src/embed/reportContext.ts)).
Os dois primeiros ele lê de si mesmo; o terceiro **não dá para medir de dentro**,
porque ali `innerWidth` é a largura do próprio quadro — ele chega no `init`, e é
conferido de novo do lado de cá como tudo que atravessa o `postMessage`. Nada
disso identifica alguém: é o que responde "só quebra no Safari" e "só quebra em
tela estreita" sem precisar perguntar de volta.

A cor do gatilho é do cliente, então **a tinta por cima dela é derivada da
luminância**, nunca escolhida: quem escolher amarelo não deveria descobrir que o
rótulo sumiu pela reclamação de outra pessoa.

### Demonstrar em localhost

Precisa de três coisas no ar, em portas fixas:

```bash
# 1. a API
cd api/Pds.WebApi && dotnet run          # :5080

# 2. o painel, que também serve /v1/pds.js e /embed.html
cd web && npm run build && npx vite preview --port 5173

# 3. uma página de teste, em OUTRA origem
mkdir -p /tmp/loja && cd /tmp/loja && python3 -m http.server 3000
```

A `5080` é a porta do `launchSettings.json` e o padrão de `VITE_API_URL`. A que a API
precisa autorizar é **só a 5173**, pelo motivo que está logo abaixo.

Para anexar, o armazenamento também precisa estar no ar — o MinIO do
`docker-compose` da API, com as variáveis `MEDIA_STORAGE_*` no `.env.local` dela (ver
[`api/README.md`](../api/README.md)). Sem ele, tudo funciona, e só o anexo fica
desligado.

O `index.html` da loja precisa só da linha:

```html
<script src="http://localhost:5173/v1/pds.js" data-key="pk_..." defer></script>
```

Dois tropeços que custam tempo:

**A porta do painel importa.** `CORS_ALLOWED_ORIGINS` na API lista
`http://localhost:5173`, e é o **quadro** que chama a API — então servir o painel
em outra porta faz o envio falhar com "Falha de rede", sem nenhum erro do lado do
servidor. A variável tem nome de painel e hoje decide se o formulário do cliente
consegue enviar, e **separar as duas coisas é Planejado**.

**A página de teste não pode ser `file://`.** A origem vira `null`, e `null` não
entra numa lista de CORS — nem no `frame-ancestors` quando ele entrar. Quem não
barra aqui é a lista de endereços autorizados: `file://` não declara endereço
nenhum, e o relato dele ficaria retido esperando liberação. O que falha é a chamada,
antes disso.

---

## O sistema visual

Dois eixos com a mesma disciplina — **cor** e **tamanho de texto**. Nos dois, o
componente nunca vê um valor: vê um nome que diz o papel (`bg-surface`,
`text-detail`), e o valor mora num arquivo só. A escala do Tailwind é apagada de
propósito, para não conviverem duas formas de dizer a mesma coisa.

- [`styles/tokens.css`](src/styles/tokens.css) — a cor, em duas camadas, com a
  proporção 60/30/10 e o mapa de significados documentados lá dentro.
- [`styles/index.css`](src/styles/index.css) — a escala de texto e as camadas de
  empilhamento (`z-dialog`, `z-toast`…).
- [`shared/lib/cn.ts`](src/shared/lib/cn.ts) — declara essa escala ao
  `tailwind-merge`; sem isso ele descarta a cor do botão achando que é tamanho.

Três decisões do design que surpreendem quem chega, e o motivo está no
`tokens.css`: **o acento é monocromático**, **vermelho não é botão** (fica
reservado a campo inválido) e **cor nunca informa sozinha**.

[`src/test/designSystem.test.ts`](src/test/designSystem.test.ts) cobra tudo isso:
varre o `src` atrás de valor cru, mede o contraste de cada par nos dois temas e
trava o número, e reprova token publicado sem consumidor.

---

## O que está aqui, e o que não está

**Conta, projetos e chaves.** Entrar, criar projeto — o diálogo pede o nome e **como o time
trabalha**: Quadro simples (A fazer, Fazendo e Feito, já marcado), Suporte, Kanban ou Scrum, em
cartões de escolha com as colunas escritas (`CreateProjectDialog`); o projeto nasce com as colunas
do modelo já ligadas ao andamento público, os tipos de relato dele e, no Scrum, as sprints de duas
semanas; o modelo só vale na criação —, listar, buscar, renomear, arquivar, ver
as chaves, copiar o script de integração, e gerar a secreta só quando a integração pede (e
trocá-la depois). E a
**área Domínios**: o relato de um endereço fora da lista de autorizados chega, mas
fica em "Aguardando liberação" até alguém permitir (entra no topo do quadro) ou
bloquear (sai de vez) — o sino avisa quem administra uma vez por endereço novo; e o
bloqueado é recusado na hora, mesmo com a lista de autorizados vazia. A mesma área lista
os domínios que já mandaram relatos (quantos, o último), cada um com Permitir e Bloquear;
o coberto pelo bloqueio de outra linha (`app.loja.com` com `*.loja.com` bloqueado) não tem
Permitir — o botão é "Desbloquear *.loja.com", com a mesma confirmação da lista de bloqueados.
Bloquear, de uma linha ou do campo, sempre confirma antes: os retidos saem de vez.
O card que veio de um domínio bloqueado depois fica marcado **Origem bloqueada**, com um
atalho no filtro do Trabalho, e quem administra decide no lote: **Manter** (a marca sai)
ou **Apagar de vez**, que pede o domínio digitado e não tem volta
(`BlockedOriginActions`, `DeleteBlockedOriginDialog`). Na aba **Proteção** de **Domínios**, os **Limites de relatos**: quantos relatos
o projeto aceita por pessoa, IP, domínio e no projeto inteiro, e o intervalo mínimo
entre dois. Passado um limite, o quadro resolve sozinho o desafio invisível
("Conferindo…", `embed/challenge.ts`); no dobro, os envios pausam e o sino avisa.

**O time, por projeto.** Cada projeto chega com a conta dona e o papel da pessoa nele:
o dono e o administrador configuram; o membro trabalha nos relatos e não vê a
configuração. A tela de **Membros** é de todos: o membro vê o time e pode sair dele; quem
administra muda o papel — rebaixar a si mesmo pergunta antes —, tira do time e convida por
e-mail, e cada convite mostra onde está o
e-mail dele — na fila, enviado, ou que não saiu, com **Reenviar**. O link nunca
aparece na tela: ele só existe no e-mail.

**O convite, do outro lado.** O link do e-mail abre `/invite`, com o link depois do
`#` — essa parte nunca vai a servidor nenhum ao abrir a página. Sem sessão, a entrada
aparece no mesmo endereço, com um aviso de que há um convite, e o `#` sobrevive ao
login. Com a conta Google do endereço convidado, a pessoa vê o projeto, quem convidou
e o papel, e aceita; com outra conta, vê só a pista do endereço e o caminho para
trocar de conta.

**O relato entra.** Colar o script numa página qualquer, escrever, e o relato chegar
na API com protocolo, rota e origem; o time lê na tela **Trabalho**, com o contexto de
cada um e a visualização registrada como evento. O botão sai de **O botão**, os
textos do formulário de **Formulário**, e a confirmação de **Quem relata**. A confirmação entrega um link, e `tracking.html`
mostra a quem relatou o próprio relato — o token viaja no fragmento do link, a parte
que o navegador nunca envia a servidor nenhum.

**Três credenciais levam a `tracking.html`, e elas não valem o mesmo** (`shared/lib/tracking.ts`,
`TrackingPage`). O token do link, em `#t=`, veio da confirmação e dá poder sobre o relato. O
código pessoal, em `#p=`, e o crachá do sistema do cliente, em `#i=`, vêm da lista "os meus
relatos" — com a chave pública em `k=`, na query, porque ela já é pública — e só provam que o
relato é da pessoa: a página abre e lê, e confirmar, reabrir, responder e anexar chegam
desligados, porque essas rotas só aceitam o token do link. Os três vão no fragmento, a parte
que nunca chega a servidor nenhum, e a API é consultada por `POST` com a credencial no corpo
— `tracking`, `by-code/open` ou `by-identity/open` — e, nas duas credenciais pessoais, os
arquivos por `by-code/attachments` ou `by-identity/attachments`. O link pelo crachá vale
enquanto o crachá valer — é para abrir agora, e não para guardar —, e link pela metade não
vai à rede.

**O trabalho que não veio de fora.** A tela **Trabalho** junta os relatos e os cards
do time — **Novo card** cria um, com título e descrição em Markdown: a barra escreve
as marcas, "Visualizar" mostra o que o card vai mostrar, e o painel desenha o texto sem
HTML nenhum (`shared/lib/markdown.ts`). Todo card tem um número curto no projeto
(#42), o mesmo para relato e card do time. O card do time não tem protocolo, caixa
para quem relatou nem encerramento: mover para a última coluna é só mover. **Arquivar**
tira o card da tela — o do time sempre; o relato só com a regra do Ciclo, e o relato
aberto encerra junto, com o motivo que quem relatou lê. O filtro **Arquivados** mostra
o que saiu, para ler, comentar ou desarquivar.

**O card diz quem, o quê, o quanto importa e para quando.** A ferramenta pergunta, antes
do texto, "em poucas palavras, o que aconteceu?" — opcional, obrigatória ou escondida, em
**Formulário** —, e a resposta vira o título do card. O time reescreve (`ReportTitle`), e o
que a pessoa escreveu fica guardado: é o único título que volta para ela, no acompanhamento
e em "meus relatos". No card aberto, `CardFields` dá o **responsável** (um só; quem sai do
time continua marcado), a **prioridade** (as do projeto, de fábrica Baixa, Média, Alta e
Urgente — o card nasce sem), as **etiquetas** (escrever o nome que não existe cria a
etiqueta) e o **prazo** (só a data). A tabela da lista mostra cada um numa coluna própria — e,
na tela estreita, as colunas de apoio saem antes do título. As cores
de etiqueta e prioridade são a paleta de dado de `tokens.css`, com o par certo nos dois
temas e o nome sempre escrito junto. **Prioridades** e **Etiquetas**, em Configurar o
projeto, são de quem administra.

**Novo card** (ou a tecla "c") cria com título, descrição, coluna, responsável e prioridade
— e, com as sprints ligadas, "Entra em" (`NewCardDialog`); Enter no título cria, e
Ctrl+Enter cria de qualquer campo. O aviso diz onde o card foi parar, com "Abrir", e a lista
com filtro é relida: só a API decide se o card novo passa neles.

**O card aberto** (`ReportDialog`, `TeamCardBody`) tem altura fixa no computador, "Copiar
link", "Card anterior" e "Próximo card" (K e J) na ordem da tela de onde se veio — a tela de
Trabalho passa a `ordem` pelo contexto da rota —, e fecha voltando no histórico. Cada caixa
registra o próprio rascunho (`cardDrafts.tsx`): o Esc sai por camadas, e fechar com texto
escrito pergunta "Descartar o que você escreveu?". Os campos mostram o valor escolhido na
hora, com "Salvando…", e voltam com o erro embaixo se falhar; os avisos nascem dentro do
diálogo (`Modal` se registra como lugar deles). O card do time edita ao lado do título, e a
edição manda `Base`: se outra pessoa salvou no meio — o 409, ou a versão nova chegando ao
vivo —, a tela oferece "Usar a versão nova" e "Manter a minha". O comentário interno se
corrige e se apaga por quem escreveu (`IsYours`, "· editado"); a resposta a quem relatou
espera cinco segundos, com "Desfazer". "Encerrar relato…" e "Pedir informação" aparecem em
qualquer coluna, e o histórico vem do mais recente.

**O quadro.** A tela **Trabalho** tem duas vistas, em abas: a lista, uma tabela (`ReportsTable`),
e o **quadro** — uma coluna por
coluna do projeto, cada uma com a própria leitura na ordem do quadro, cinquenta de cada vez, e
"Mostrar mais N" logo depois do último card, continuando dele (`after`), e não pela página
seguinte —, e o navegador lembra a escolhida, por projeto. **O quadro ocupa a altura da
janela**: cada coluna rola por dentro, com o cabeçalho preso, a barra de rolar para os lados
fica no pé da tela, e a coluna escondida à direita ganha um botão com o nome dela ("Feito ›");
no celular, uma fila de colunas acima do quadro leva a cada uma. Cada vista lê só o que é dela: a lista não é lida com
o quadro na tela, e é lida de novo ao voltar. A frente do card é um resumo
(`BoardCardFace`): o título primeiro, até três etiquetas e o prazo — vermelho quando venceu,
amarelo quando está perto, sempre com as palavras (`DueChip`) — e, no pé, o tipo, o número, a
prioridade com o nome, quantos comentários e anexos e quem está com ele — a foto do Google,
senão as iniciais. As peças que a lista, o quadro e o card aberto desenham igual ficam em
`cardLook.tsx` — o relato sem título, por exemplo, entre aspas e na cor do título
(`headlineText`). "+ Criar", logo abaixo do cabeçalho de cada coluna que recebe card, abre ali
um campo de uma linha: Enter cria na coluna (com as sprints ligadas, na sprint em andamento), o
card nasce logo abaixo e acende, e o campo fica aberto para o próximo; "Mais detalhes" abre o
`NewCardDialog` com a coluna e o título. Com filtro, o cabeçalho diz "1 de 8". O
detalhe só abre no clique, no mesmo diálogo da lista, em duas colunas (`CardDetailLayout`): o
card e a atividade à esquerda; a coluna, as ações e os detalhes à direita, cada lado com a
própria rolagem — e, no celular, uma coluna só. Arrastar usa `@dnd-kit`: o mouse pega depois de
andar uns pixels, o toque depois de segurar 450 ms (deslizar continua rolando; na borda, o quadro
anda uma coluna por vez), e o teclado com espaço, setas, espaço ou Enter para soltar, e Esc,
anunciando cada passo ao leitor de tela. **O quadro é uma parada só do Tab**: dentro dele as
setas andam entre os cards, Home e End vão às pontas da coluna e Enter abre; no arraste, a seta
para o lado leva à coluna vizinha na altura do card (`boardKeyboard`), e o próprio card, com
contorno tracejado, marca o lugar. O alvo é o que está debaixo do
ponteiro (`boardCollision`): a coluna inteira recebe, o cabeçalho também, e soltar fora das colunas
que recebem devolve o card; um movimento por quadro desenhado (`ReportsBoard.aoPassar`) impede
o card de ir e voltar sem parar. A ordem é do time inteiro e mora na API; o que
chega — relato novo, card novo, movido pelo seletor, reaberto — entra no topo. Soltar um
relato aberto na coluna que encerra pede o desfecho antes de mover, e **tirar dela um relato
encerrado pergunta antes de reabrir** ("Reabrir o relato #N?"); a falha devolve o card e diz
para onde. A última coluna mostra
só o que entrou nela nos últimos dias — com mais de uma coluna ativa: com uma só, ela é a entrada da
fila —, e diz quantos ficaram na lista, com o caminho até eles. "Sem coluna" e a
coluna desativada aparecem só enquanto seguram card, e não recebem nenhum. A dica do quadro tem
✕, lembrado no navegador. O código fica em `features/reports/board/`.

**O clique do soltar é barrado na janela.** A biblioteca engole, antes do React, o clique
que o navegador dispara junto do soltar, mas não impede o link de ser seguido: segurar o
card no celular e soltar sem andar recarregava a página inteira no endereço do card. A
guarda, em `ReportsBoard`, fica na janela e vale do pegar até um instante depois de soltar
— menos no teclado, que não clica ao soltar, e onde o Enter logo depois continua abrindo o
card.

**Filtros e busca.** A barra logo abaixo das abas (`WorkFilterBar`) tem a busca — título,
texto, descrição, número (`42` ou `#42`) e protocolo, sem diferenciar maiúscula nem acento; "/"
põe o foco nela —, os atalhos "Meus cards", "Vencidos" e "Em aberto" (`open=true`) e os menus de
marcar de responsável, etiqueta, prioridade e tipo. O responsável e a busca trazem também o pai
pela subtarefa, com a marca (`SubtaskMatchMark`, de `SubtaskMatch`): "1 subtarefa sua", "2
subtarefas de Ana", "na subtarefa". Na lista, também os menus "Coluna" (várias, com a contagem; `column`),
"Sprint" (com as sprints ligadas, as concluídas inclusive) e "Ordem", e "Arquivados". O controle
ligado diz o valor ("Etiqueta: pagamentos"); no celular, os filtros abrem pelo botão "Filtros".
Dentro de um filtro vale ou; entre filtros, e. Os filtros, a coluna e a sprint
(`useWorkFilters`) ficam lembrados na aba, por projeto (`sessionStorage`), e a busca espera 300 ms
depois da última tecla, com "Buscando…" e a tabela esmaecida enquanto a lista nova não chega; a chave deles entra
na leitura da lista, de cada coluna do quadro, da contagem das colunas e das releituras do tempo
real, e trocar de filtro relê tudo **sem esvaziar** a tela. Vencido é o prazo passado no card que
ainda não terminou — quem diz se terminou é a API, em `Finished` —, e o prazo do card que terminou
fica sem vermelho e sem amarelo. Quando nada passa, a tela diz isso, com "Limpar filtros".

**A tabela ordena.** Os cabeçalhos Nº, Coluna, Responsável, Prioridade, Prazo e Criado são
botões (`aria-sort`), e o menu "Ordem" dá o mesmo no celular: a API ordena (`sort`, `dir`), com
o vazio no fim nas duas direções, e a ordem fica lembrada na aba, à parte dos filtros. A lista vem
de cinquenta em cinquenta, a página seguinte chega sozinha perto do fim, e o cabeçalho fica
preso ao rolar. As colunas da tabela saem pela largura da área de trabalho (`@container`), e o
foco da caixa de marcar é visível nos dois temas.

**Subtarefas.** A subtarefa mora dentro do pai: a API a deixa de fora da lista, do quadro, do
backlog, dos arquivados e da contagem, e o tempo real a ignora na tela de Trabalho (o aviso dela
traz `ParentPublicId`, e o pai tem aviso próprio). O card aberto tem a seção Subtarefas
(`CardSubtasks`), onde o time trabalha nelas: o progresso, a lista na ordem em que nasceram —
lida com `parent`, só quando o contador da frente diz que há alguma —, com o círculo que marca
como feita, a coluna e o responsável escolhido na linha (o avatar abre "Ninguém" e o time), as
arquivadas embaixo (`parent` com `archived=true`) e o campo de criar, que manda o pai. A subtarefa
nasce na primeira coluna e sem responsável, e o pai é relido sem gravar leitura. Um nível só: a
subtarefa aberta se chama Subtarefa e mostra o pai (`ParentLink`), sem a seção; o que muda nela
relê o pai na lista e no quadro. Na frente do card e na linha da tabela, o pai mostra o progresso
(`SubtaskProgress`), verde quando todas terminaram.

**Vínculos.** O card aberto tem a seção Vínculos (`CardLinks`): os cards ligados, agrupados pelo
tipo visto dele (duplicado de, duplicados deste, bloqueado por, bloqueia, relacionado a), com a
coluna, o riscado de quem terminou e o "×" que desfaz — inclusive no card arquivado, que é o
caminho de volta do duplicado. "+ Vincular" escolhe o tipo e acha o outro card pela busca da tela
de Trabalho, sem o próprio card nem os já vinculados. Vincular e desfazer releem o card aberto sem
gravar leitura: marcar este card como duplicado o leva para o arquivo. O bloqueado mostra
`BlockedMark` ("Bloqueado por #12") na frente do card e na linha da tabela; o duplicado, no
arquivo, mostra o original (`DuplicateLine`). O diálogo de encerrar o original avisa
quantas pessoas a mais vão ler o motivo (`DuplicateReporters`), e o histórico conta cada vínculo
com o número do outro card.

**Backlog e sprints.** Com `SprintsEnabled` — ligado na tela **Sprints** (`SprintSettingsScreen`,
que grava o mesmo registro do Ciclo só com os campos dela, e avisa quantos cards vão para o
Backlog) —, a tela de Trabalho ganha a aba Backlog
(`SprintBacklog`): a sprint em andamento, as planejadas e o backlog, cada um lido com
`sprint=<id>|backlog` e `order=backlog`; arrastar entre e dentro das listas com `@dnd-kit/sortable`
(mouse, toque segurando, teclado — `backlogKeyboardCoordinates` atravessa as listas, e o anúncio
diz a lista e a posição), e o menu de cada card, cujo mover tem "Desfazer". A linha mostra a
prioridade, o prazo perto ou vencido e os pontos, que se estimam ali mesmo; a busca e "Meus
cards" escondem o que não bate sem mudar a ordem; cada lista recolhe. O quadro lê só
`sprint=active` (as colunas e a contagem), com a `SprintBar` e "Concluir sprint"
(`CloseSprintDialog`, que pergunta o destino do que não terminou, com a próxima planejada já
escolhida, e oferece iniciá-la); sem sprint em andamento, `NoActiveSprint` esconde os filtros
e as raias e leva ao backlog, ou a iniciar a planejada. Iniciar começa hoje (o dia de quem
pede vai em `Today`), com "Usar as datas planejadas". O "Criar" de uma coluna cria na sprint
em andamento, e o `NewCardDialog` tem "Entra em". O card aberto ganha Sprint e Pontos nos
`CardFields` (sem pontos na subtarefa, que vai com o pai), e a frente do card mostra os pontos
(`PointsChip`). As sprints chegam à rota do card pelo contexto. Os dados em
`data/sprintService.ts`.

**Raias.** No quadro, a escolha "Raias" (lembrada por projeto neste navegador, como a vista)
agrupa por responsável ou por prioridade: `boardLanes` monta as raias — todas as prioridades ativas,
e o time inteiro, lido de `projectTeamService` (quem não tem card ganha uma raia compacta no fim);
a prioridade desativada e quem saiu do time não recebem (`accepts`) —, e
`boardCells` divide cada coluna em células (coluna × raia). O arraste passa a ser de célula em
célula — `moveToCell` põe o card na ordem da coluna inteira, logo abaixo do de cima na célula —, e
soltar em outra raia chama `setAssignee` ou `setPriority` depois do movimento (o card fica na raia
nova, `forcadas`, até a API responder). `boardKeyboardCoordinates` atravessa para a raia vizinha na
ponta da célula. Enquanto o card está na mão, cada raia guarda a altura que tinha, e a célula
debaixo do ponteiro ganha a conta (`boardCollision`). A fileira com o nome das colunas fica
presa no alto, com o "Criar" de cada uma, e o "Mostrar mais" embaixo de todas as raias. Sem
raias, o quadro monta o mesmo de antes.

**Ações em lote.** A lista ganha uma caixa por linha (`ReportsTable` com `selecao`; Shift marca
um trecho) e, com cards marcados, a barra `BulkActions`: mover de coluna, responsável,
prioridade, adicionar ou remover etiqueta e, com as sprints ligadas, a sprint. Com a página
inteira marcada, "Selecionar os N que passam nos filtros" lê o resto da lista (`loadAll`). Card por card, pelas rotas de sempre, na ordem da lista; o que
não mudou aparece num diálogo com o porquê. A coluna que encerra pede o desfecho uma vez
(`CloseReportDialog` com `lote`); etiquetas são gravadas sobre o card lido na hora
(`refreshReport`). A barra fica presa embaixo da tela, depois da tabela, e a seleção fica depois de
cada mudança; o que não mudou aparece no `BulkFailures`, na tela. O aviso do fim tem
"Desfazer" por dez segundos (`useBulkUndo`): cada card volta ao valor de antes pelas mesmas
rotas — menos o movido para a coluna que encerra —, e só se, relido na hora, o campo ainda está
como o lote deixou; o que mudou depois fica, e vai para o `BulkFailures`. Tirar relato encerrado
(e não confirmado) da coluna que encerra pergunta antes, como o quadro ("Reabrir 2 relatos?"), e o
reaberto fica fora do "Desfazer", com o aviso dizendo isso. Trocar o filtro, a coluna, a vista
ou o projeto desmarca tudo.

**Menções, o sino e o som.** Na caixa "Entre o time", digitar "@" abre a lista do time
(`MentionTextarea`, lida no primeiro "@"; setas, Enter ou Tab, e o Esc que fecha só a lista — ele é
ouvido na janela, antes do diálogo). No campo fica "@Nome"; no envio, `encodeMentions` troca o
"@Nome" que ficou no texto pela marca `@[Nome](identificador)`, e a leitura mostra a menção
destacada (`CommentBody`). A caixa de quem relatou não menciona. Corrigir o comentário volta as
marcas a "@Nome" (`decodeMentions`). O sino (`NotificationBell`, no topo
do projeto e do hub) mostra o número de não lidos — `useUnreadCount` pergunta a cada troca de tela,
ao voltar para a aba, a cada minuto com a aba à vista e, na tela de Trabalho, na hora em que o
`NotificationArrived` chega pelo tempo real (`announceNotificationArrival`); a resposta atrasada não
passa por cima da de uma ação —, lê a lista ao abrir, em duas abas ("Não lidos (N)", a de
saída, e "Todos"), com o trecho do comentário na menção, os avisos parecidos juntos numa linha
e "Ver os mais antigos" (`before`) até o fim; abrir leva ao card, marca como lido e, na menção,
rola até o comentário e o acende (`revealComment`, pelo `id="comentario-<id>"` de cada um). **Quando o
número sobe, toca o som** do tipo do aviso mais novo, no volume da pessoa (`playNotificationSound`,
em `shared/lib/notificationSounds.ts`: os sons são notas geradas com Web Audio, sem arquivo). As
preferências ficam no **Perfil**, um diálogo central sobre a tela aberta (`ProfileDialog`, montado
nas duas cascas e aberto por `openProfile`, de `shared/lib/profileDialogStore.ts`): o menu da pessoa
o abre sem trocar o endereço, e "Preferências de aviso" no sino o abre já nos sons; fechar (X, Esc)
devolve o foco ao botão que abriu, e no celular ele ocupa a tela inteira. Um som para cada tipo de
aviso, com "Ouvir", e o volume — escolher já toca e grava, sem "Salvar". O endereço antigo
`/profile` (`ProfileRoute`) abre o diálogo sobre o hub, ou sobre a tela de onde se veio. Os dados em
`data/notificationService.ts`.

**O tempo real.** Com a tela de Trabalho aberta, o que outra pessoa do time muda aparece sem
recarregar. A conexão (`realtimeService`, em `data/api/apiRealtimeService.ts`, com a biblioteca
do SignalR carregada só nesta tela) pede um bilhete de um minuto a cada conexão — o token da
sessão nunca vai no endereço —, entra no projeto e reconecta sozinha, para sempre: logo, e
depois esperando 2, 5, 10 e 30 segundos entre uma tentativa e outra; as esperas só voltam ao
começo com a conexão de volta dentro do projeto. De volta — ou aberta só depois de falhar —, a
tela relê tudo. O aviso só traz identificadores, e cada parte relê pela REST o que é dela
(`useWorkRealtime` repassa): o quadro, só as colunas que o card tocou, juntando avisos próximos
e esperando o arraste, a gravação ou o desfecho terminar (`board.hold`); a lista, as páginas da
tela, sem esvaziar; a contagem; e o card aberto, com `refreshReport` — que não grava leitura —,
a conversa, os anexos, a história e, quando a configuração muda, as escolhas dos campos, sem
apagar o que a pessoa está escrevendo. **Leitura atrasada não passa por cima**: a coluna, a
lista ou o card que mudou nesta aba enquanto a releitura estava no ar é lido de novo, e de duas
releituras no ar vale a última. Todo pedido da aba leva o id da conexão
(`X-Realtime-Connection`), e o aviso da própria mudança volta marcado e é ignorado.

Na tela, o card que mudou se acende por dois segundos, com uma faixa à esquerda — quando a
releitura chega, e não o aviso —, e uma região anunciada conta o mesmo a quem usa leitor de tela
(`LiveStatus`) — no quadro, o que aconteceu e onde: "O card #97 foi para Fazendo.". O card com o
foco que outra pessoa move leva o foco junto, e o que sai da tela
deixa o foco no vizinho (`useKeepFocus`). O clique num card nos 0,6 segundo depois de uma
mudança de outra pessoa entrar na tela não abre nada: a linha que estava ali pode ter descido. A
queda que passa de três segundos mostra um selo no fim da área de conteúdo, sem cobrir card —
"Sem atualização ao vivo — reconectando…", ou "… — tentando conectar…" quando a conexão nunca
abriu —, dito também dentro do card aberto. Quem
perde o acesso volta para a lista de projetos, que diz de qual projeto saiu.

**O time trabalha o relato.** A tela **Colunas** é onde o cliente monta as colunas do
quadro, com os nomes que a equipe usa, e reordena, renomeia, desativa e reativa cada uma —
o diálogo de desativar conta os cards que ficam nela. Coluna não se apaga — não há botão de
remover em lugar nenhum —, porque relato antigo aponta para ela e o histórico precisa
continuar legível. Projeto novo nasce com as colunas do modelo escolhido — no Quadro simples,
**A fazer, Fazendo e Feito**; cada coluna diz o que
**quem relatou vê** quando o card está nela, e escolher ali grava o mapa (a coluna nova nasce
ligada à etapa da última de antes) — é o único lugar dessa ligação. No grupo "Fim e prazos no quadro", as regras
do quadro — quantos dias a última coluna mostra e quando o prazo fica em destaque — e a tela
aponta para **Tipos de relato**, onde
cada tipo escolhe a coluna em que o relato entra.

**Os tipos de relato são do projeto.** A tela **Tipos de relato** (`ReportTypesScreen`, de quem
administra) lista os tipos na ordem do formulário — arrastar e setas, como em Colunas —, cria,
edita e desativa. Cada tipo tem nome, cor (a paleta de etiqueta e prioridade), desenho (seis, de
`ReportTypeGlyph`), até quatro perguntas curtas (adicionar, tirar, reordenar, cada uma até 120
caracteres), a caixa de texto livre ligada ou não com o texto dela, e a coluna em que entra — "A
primeira coluna" grava nulo, e acompanha a fila. O projeto nasce com **Defeito** (três perguntas),
**Melhoria** e **Dúvida** (a caixa), que funcionam sem ninguém abrir a tela. Desativar tira o tipo
do formulário e o deixa nos relatos que já o têm, marcado "(desativado)"; o último ativo não se
desativa, e cabem dez ativos. No **Trabalho**, o tipo do card vem com a cor e o desenho que o time
escolheu, o filtro "Tipo" lista os tipos do projeto (os ativos primeiro, os desativados marcados)
e "Card do time", e o card aberto mostra cada resposta embaixo da pergunta, como ela estava no
envio (`ReportAnswers`) — o mesmo que quem relatou vê no acompanhamento. A tela **O botão** escolhe
o tipo pré-marcado entre os ativos, ou "O primeiro da lista".

A lista **filtra por coluna**, no menu "Coluna" da barra, várias de uma vez, com a
contagem em cada opção. A contagem vem de uma chamada própria: contar as linhas da página
daria um número errado assim que o projeto passasse de cinquenta relatos. Coluna vazia continua
entre as opções — some só a desativada que não segura mais nada.

Cada relato tem **endereço próprio**: `/projects/:id/reports/:reportId`. Ele é rota
**filha** da lista, e não uma tela no lugar dela — assim a lista fica montada atrás,
com o recorte e a rolagem onde estavam, e o botão voltar do navegador fecha o relato
em vez da tela inteira.

O time **move o relato de coluna**, pela tela do relato aberto ou arrastando o card no
quadro. Cada mudança grava um evento imutável, e **o evento entra antes do cache**: a coluna
guardada no relato é conveniência para a lista; a verdade é a sequência de eventos. Movido para fora do
recorte ativo, o relato sai da lista na hora — deixá-lo ali mostraria, debaixo do nome
de uma coluna, um relato que não está mais nela.

O time **comenta** em duas caixas distintas: o que fica entre a equipe e o que é
escrito para quem relatou. A separação é **estrutural** — duas rotas, duas tabelas,
dois tipos de evento —, e o destaque visual fica na caixa que sai para fora, porque é
lá que o erro custa caro. Ela diz onde a pessoa lê: na página de acompanhamento, junto
das próprias respostas. E cada relato tem uma **linha do tempo**, montada a partir dos
eventos, com os nomes de coluna que valiam na época de cada mudança.

**A jornada pública.** O cliente desenha os passos que quem relatou vê, cada um com
rótulo, a frase que explica e, se quiser, o que vem depois — a tela **Andamento público**.
**Não é a tela de Colunas com outro título** — lá estão as faixas em que o time trabalha, aqui está a história
que a pessoa de fora lê, e ela é mais curta de propósito. Entre três e sete, com o
motivo de cada limite escrito na tela; projeto novo nasce com a jornada do modelo escolhido
ao criar, e quem foi criado antes de a jornada existir preenche com um clique — sempre com o
conjunto de fábrica, mesmo que o projeto tenha nascido do Suporte, porque o projeto não guarda de
qual modelo veio. A etapa em que o relato termina carrega o
**desfecho**, de uma lista curta e nossa — foi feito, não será feito, sem retorno, já
existia.

O cliente **liga as duas listas** em Colunas: cada coluna do quadro aponta para um passo da
jornada ("Quem relatou vê"), e Andamento público só mostra, em cada etapa, as colunas que caem
nela. Várias colunas no mesmo passo é o caminho normal. O mapa se grava **inteiro**, e cada
gravação cria uma versão — uma por escolha: alterar hoje não reescreve o passado, porque são
as versões antigas que explicam por onde um relato de três meses atrás passou.

E o relato **anda sozinho do lado de fora**. O motor que decide isso vive num projeto
da API que não referencia nada — é o que torna "ele não conhece banco nem HTTP" uma
garantia do compilador. No painel, a caixa do relato diz **onde quem relatou o vê**,
junto do controle que o move: quem decide precisa ver, na hora, o que o movimento
causa lá fora. Essa informação vem da resposta do próprio movimento, e não de uma
busca nova — abrir o detalhe **grava um evento de leitura**, e refazer essa busca a
cada clique mediria o time em vez da leitura.

Quem relatou **vê o andamento**: `tracking.html` desenha a jornada inteira — por onde
o relato passou, onde ele está e o que vem depois. **O que já passou vem das datas, e
não da posição.** Um relato pode pular etapas, e pintar como percorrido tudo que está
antes contaria uma história que não aconteceu. E a tela **não abre em branco**: o
esqueleto é escrito dentro do `tracking.html`, com as cores resolvidas pelo mesmo
script que já decidia o tema antes do primeiro pixel. Ele **não é customizável por
projeto, e não dá para ser**: o arquivo é estático e igual para todos, e qual é o
projeto só se sabe quando o pacote roda e pergunta à API. A versão com a cor do cliente
fica no quadro, onde o carregador conhece a chave pública antes de abrir.

**O ciclo fecha.** O time encerra com motivo, ou pede informação com prazo; quem
relatou responde, confirma que resolveu — com nota, quando o projeto pede — ou reabre,
dizendo por quê. A tela **Ciclo** decide as regras: para onde vai o relato reaberto,
se reabrir pede motivo, os prazos do pedido e quanto o lado público espera antes de
mudar, que é a janela para desfazer um movimento errado. As regras do quadro — quantos dias a
última coluna mostra quando há mais de uma (de fábrica 14; zero mostra tudo) e com quanta
antecedência o prazo fica amarelo — ficam em Colunas, e as das sprints, em Sprints; as três
telas gravam o mesmo registro, cada uma só com os campos dela (`useCycleDraft`). A espera, a
nota e o arquivar são grupos do Ciclo, como o encerramento, a reabertura e o pedido de informação.

**Identidade e visibilidade.** A tela **Quem relata** escolhe como quem relata é
reconhecido — pelo protocolo, por um código pessoal que traz a lista "os meus
relatos" na ferramenta, ou pela identidade do sistema do cliente, que traz a mesma lista
sem a pessoa digitar nada — e se o projeto é privado, público anônimo ou público
identificado, que aceita os dois modos que identificam. Público, todo relato passa pela
**Moderação** antes de aparecer na vitrine, "o que já foi relatado", dentro da ferramenta — e, em projeto privado, a Moderação diz
no topo que nada dali vai a público. A mesma tela tem o que a pessoa lê depois de enviar: a
confirmação, o topo do acompanhamento e o aviso de relato público, cada um no seu grupo. Perguntar
o nome fica em **Formulário**, junto do texto da pergunta.

**A identidade do sistema do cliente é um crachá que o servidor dele assina, e a chave é
assimétrica de propósito.** Escolhido esse modo, o grupo Reconhecimento pede a **chave pública
do sistema** (ECDSA P-256, em PEM ou em base64 numa linha; obrigatória para salvar, porque sem
ela a API não conferiria crachá nenhum), a **validade máxima do crachá** (de 1 a 60 minutos, de
fábrica 15) e a caixa **"Exigir o crachá: sem ele, recusar o relato e pedir para entrar na
conta"**. A chave fica guardada ao trocar de modo. O "Como gerar o crachá", dobrado, traz o caminho
inteiro: o par de chaves com `openssl`, as claims `sub`, `name`, `aud` e `exp`, a linha do script
com `data-identity`, exemplos de servidor em Node (`jose`) e C#
(`System.IdentityModel.Tokens.Jwt`) com "Copiar bloco", e o aviso de nunca usar o token de login
do usuário. A API confere a assinatura com essa chave, sem chamar o sistema do cliente, e guarda
da pessoa só um hash; a secreta do projeto existe só como hash, então assinar com um segredo
compartilhado era inviável — e um vazamento do nosso banco não deixa forjar identidade nenhuma,
nem por nós. A busca da configuração acha "Chave pública do seu sistema", "Validade máxima do
crachá" e "Exigir o crachá para relatar".

**No quadro, o crachá só é carregado de um lado para o outro.** Ele vai no envio
(`IdentityToken`); o campo do nome vem preenchido com o `name` dele, lido sem conferir
assinatura porque é sugestão e não prova — a pessoa apaga ou troca (`embed/identityToken.ts`)
—; e a confirmação diz se o relato ficou ligado à pessoa (`Identified`) ou se "não deu para
reconhecer você pelo site" e o link é a única volta. "Ver os meus relatos" só aparece com
crachá, e a lista (`MyReports`) não tem campo de código: carrega sozinha, pelo crachá, e cada
"Abrir" leva ao acompanhamento com o crachá no fragmento (`#i=`). Crachá que não confere e
pessoa que nunca relatou aqui recebem a mesma lista vazia, de propósito, como o código digitado
errado. Com a exigência ligada e sem crachá, o formulário dá lugar a "entre na sua conta neste
site e abra o formulário de novo": a API avisa em `IdentityRequired`, na mesma leitura da
configuração, para o quadro dizer isso antes de a pessoa escrever. Fora desse modo, o atributo
na página é ignorado, e não recusado como o código pessoal fora do modo dele é: o código é
digitado pela pessoa, e o atributo pode ter ficado na página de uma configuração antiga. Na
prévia do painel não há crachá, e mesmo assim ela mostra o formulário e a entrada da lista.

**Anexos.** A tela **Anexos** liga o anexo, as duas categorias — imagem e arquivo, este com
os formatos do catálogo — e a captura, com a prévia da área de anexar; a quantidade e o
tamanho por envio ficam no grupo de cada categoria, e o anexo na resposta e na reabertura, em "Quando anexar". Os arquivos aparecem no lugar de onde
vieram — embaixo do relato, da resposta ou da reabertura —, no acompanhamento (pelo
link, pelo código pessoal e pelo crachá do sistema do cliente) e no painel. Os endereços vencem em minutos: a galeria
pede a lista de novo antes do vencimento, e quando um arquivo falha; o que não carrega
diz isso, com "Tentar de novo". O arquivo que não é imagem é sempre baixado, e os
vídeos de antes de o vídeo sair do produto continuam tocando.

| o que falta | onde dói |
|---|---|
| a página não é renderizada no servidor (**Planejado**) | ela baixa **uns 86 kB comprimidos** de JavaScript, uns 60 deles o próprio React, para desenhar uma tela quase sem interação. A tela branca acabou — `tracking.html` desenha um esqueleto antes de qualquer script —, mas o peso continua |
| o limite nas leituras públicas (`tracking`, `by-code`, `by-identity`, `published`) | são rotas que qualquer visitante de qualquer site alcança; a entrada do relato já tem as camadas e o desafio, e o login e o envio de arquivo, o limite por minuto. **Planejado** |

Fora do corte, de propósito: o plano de cobrança (**Continuidade**); os relatórios
(**Planejado**); a busca nos comentários e um índice de busca de texto (**Continuidade**); o tempo real com mais de uma instância da API e a página de
acompanhamento ao vivo de quem relatou (**Continuidade**); a lista pública com imagens e a página pública
de um relato aprovado (**Adiado**). E o `frame-ancestors` — a conferência de hoje mora
no servidor e pega o caso comum; barrar o quadro no navegador precisa de um servidor
servindo `embed.html`, que é hospedagem que ainda não existe — **Planejado**.

---

## Divergências entre o design e o código

Cada uma é de uma linha para reverter se a decisão mudar.

**"Entrar com e-mail" virou "Entrar com Google".** A API só tem
`POST /auth/google`, e login por senha é decisão em aberto.

**O identificador é um GUID, não um slug.** O design mostra `loja-ativa-b3f9`; a
API expõe `PublicId` e não tem coluna de slug. Adotar slug é mudança de banco.

**`data-key` no lugar de `data-chave`.** Campo público de integração vai em
inglês, e esse atributo aparece no HTML de todo cliente.

**Addons e Uso não estão na lateral.** O design os mostrava bloqueados, com uma dica no
`hover`; a lateral mostra só o que existe. As dicas que restam, as da lateral recolhida, usam
Radix Tooltip: aparecem também no foco do teclado e são lidas por leitor de tela.

**A Instalação não marca passo como feito.** O design tinha um progresso guardado
no navegador; na tela, cada passo diz "Feito" pelos dados (`shared/lib/installSignals.ts`) — o
relato que chegou do sistema do cliente, o endereço autorizado e o relato de teste —, e o selo
diz se o sistema já está funcionando pelo último relato que chegou, `LastReportReceivedAt`,
que vem no projeto e é o mesmo dado que decide a porta.

**A marca é "Relato Fácil"**, o mesmo nome do domínio `relatofacil.com`, e
vive em um arquivo só (`shared/components/Brand.tsx`).

**A chave pública tem o formato da API** (`pk_` + base64), e não o `pk_live_…`
ilustrativo do design. O prefixo da secreta tem 11 caracteres, como em
`ProjectKeyGenerator.cs`.
