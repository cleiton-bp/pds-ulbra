# Painel — PDS

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

Nenhuma das duas é segredo: o Vite injeta toda `VITE_*` no bundle, então quem
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
/projects ........................ hub — saudação, criar projeto, busca, lista por conta
/projects/:publicId .............. a porta — Instalação para quem configura, Relatos para o membro
/projects/:publicId/start ........ console — Instalação, 3 passos
/projects/:publicId/keys ......... console — chaves e integração
/projects/:publicId/states ....... console — a fila de trabalho do time
/projects/:publicId/priorities ... console — as prioridades do projeto
/projects/:publicId/labels ....... console — organizar as etiquetas que o time criou
/projects/:publicId/public-stages  console — a jornada que quem relatou acompanha
/projects/:publicId/cycle ........ console — como o relato fecha e reabre
/projects/:publicId/identity ..... console — quem relata e quem pode ver
/projects/:publicId/media ........ console — o que dá para anexar
/projects/:publicId/moderation ... console — o que vira público
/projects/:publicId/members ...... console — o time, e os convites para quem administra
/projects/:publicId/settings ..... console — nome, identificador, arquivar
/projects/:publicId/reports ...... console — Trabalho: os relatos do site e os cards do time
/projects/:publicId/tool ......... console — como a ferramenta aparece no site
/invite#t=... .................... o link do e-mail do convite — abrir e aceitar
```

Dois níveis, como um console de nuvem. **Não existe rota `/login`**: quem abre
uma URL sem sessão vê a entrada naquele mesmo endereço e cai direto onde queria.

**O papel decide a porta.** `/projects/:publicId` leva quem configura — o dono e o
administrador — à **Instalação**, e quem é só membro ao **Trabalho**. O membro não vê
o grupo **Configuração** no menu, e o endereço de uma seção dele, digitado ou num link
antigo, o manda para o Trabalho. A regra mora na API, que recusa com 403 o que o
membro tentar mudar; aqui só se decide o que mostrar. O hub e o seletor do topo agrupam
os projetos pela conta dona quando há mais de uma — "Seus projetos" primeiro —, e no
hub o projeto de outra conta mostra o papel da pessoa nele.

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
│                 publicStages, cycle, identity, media, moderation, onboarding,
│                 reports, widgetSettings
├── shared/       componentes, hooks e utilitários sem dono
└── styles/       o sistema de cor, em duas camadas de token
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
   <script src=...>    →    /v1/pds.js                 POST /public/reports
        │                        │                            ↑
        │  cria o iframe         │                            │
        └───────────────→   /embed.html  ───────────────────────┘
                  postMessage         o relato, com a chave pública
                                 │
                                 │  a confirmação entrega um link
                                 ↓
                            /tracking.html            POST /public/reports/tracking
                                                      o protocolo e o token do link
```

**O carregador (`src/loader/`) quase não desenha na página.** Ele cria o `iframe`
e cuida de posição e tamanho. O gatilho, o formulário e as cores moram dentro do
quadro — é o que mantém o site do cliente livre do nosso CSS, e o nosso livre do
dele. Ele sai em IIFE, tem cerca de 3,5 kB comprimido e não carrega React.

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
dono liga na tela de Mídia e da qual marca os formatos (o catálogo e a conferência dos
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

**A configuração vive em `contracts/widgetSettings.ts`** — onze campos que decidem
textos, cores, tema, posição, quais tipos aparecem e como a pergunta do título é feita. A tela **Ferramenta** os
edita, a API os guarda, e o quadro os lê pela chave pública antes de desenhar
qualquer coisa. Projeto que nunca salvou nada recebe os padrões de
`embed/settings.ts`, na mesma forma — e quem lê não distingue os dois casos.

**O quadro nasce invisível, e é o primeiro pedido de tamanho que o revela.** Ele
só o manda depois de ter a configuração em mãos, e uma regra resolve quatro
coisas: o gatilho aparece já no canto certo; a ferramenta desligada nunca pede e
nunca aparece; o rótulo do cliente não pisca, porque nada é desenhado com os
padrões para ser trocado na frente de quem já estava lendo; e um quadro que não
carregou some, em vez de deixar uma pílula vazia parada no site. O preço é uma ida
à rede antes do gatilho — e se ela falhar, valem os padrões: "não consegui saber"
não pode virar "não apareço".

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
nenhum, e quem não declara passa. O que falha é a chamada, antes disso.

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

**Conta, projetos e chaves.** Entrar, criar projeto, listar, buscar, renomear,
arquivar, ver as chaves, copiar o script de integração e regenerar a secreta. E a
**lista de endereços autorizados**, conferida nas rotas públicas: vazia abre em
qualquer lugar, e o primeiro endereço declarado liga a conferência.

**O time, por projeto.** Cada projeto chega com a conta dona e o papel da pessoa nele:
o dono e o administrador configuram; o membro trabalha nos relatos e não vê a
Configuração. A tela de **Membros** é de todos: o membro vê o time; quem administra
muda o papel, tira do time e convida por e-mail, e cada convite mostra onde está o
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
cada um e a visualização registrada como evento. A aparência e os textos da
ferramenta saem de **Ferramenta**. A confirmação entrega um link, e `tracking.html`
mostra a quem relatou o próprio relato — o token viaja no fragmento do link, a parte
que o navegador nunca envia a servidor nenhum.

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
do texto, "em poucas palavras, o que aconteceu?" — opcional, obrigatória ou escondida, na
**Ferramenta** —, e a resposta vira o título do card. O time reescreve (`ReportTitle`), e o
que a pessoa escreveu fica guardado: é o único título que volta para ela, no acompanhamento
e em "meus relatos". No card aberto, `CardFields` dá o **responsável** (um só; quem sai do
time continua marcado), a **prioridade** (as do projeto, de fábrica Baixa, Média, Alta e
Urgente — o card nasce sem), as **etiquetas** (escrever o nome que não existe cria a
etiqueta) e o **prazo** (só a data). A linha da lista mostra tudo isso numa faixa. As cores
de etiqueta e prioridade são a paleta de dado de `tokens.css`, com o par certo nos dois
temas e o nome sempre escrito junto. **Prioridades** e **Etiquetas**, na Configuração, são
de quem administra.

**O time trabalha o relato.** A tela **Estados** é onde o cliente cria a própria fila
de trabalho, com os nomes que a equipe usa, e reordena, renomeia e aposenta cada um.
Estado não se apaga — não há botão de remover em lugar nenhum —, porque relato antigo
aponta para ele e o histórico precisa continuar legível. Projeto novo nasce com uma
área de análise, e a mesma tela escolhe, por tipo, onde cada relato cai; a opção
"primeira coluna da fila" **apaga** a escolha em vez de gravar uma vazia — é o que
mantém "não configurei" como um estado possível do projeto.

A lista de relatos **filtra por coluna**, com a contagem de cada uma na barra de cima.
A contagem vem de uma chamada própria: contar as linhas da página daria um número
errado assim que o projeto passasse de vinte relatos. Coluna vazia continua na barra
— some só a aposentada que não segura mais nada.

Cada relato tem **endereço próprio**: `/projects/:id/reports/:reportId`. Ele é rota
**filha** da lista, e não uma tela no lugar dela — assim a lista fica montada atrás,
com o recorte e a rolagem onde estavam, e o botão voltar do navegador fecha o relato
em vez da tela inteira.

O time **move o relato de coluna**, pela tela do relato aberto. Cada mudança grava um
evento imutável, e **o evento entra antes do cache**: a coluna guardada no relato é
conveniência para a lista; a verdade é a sequência de eventos. Movido para fora do
recorte ativo, o relato sai da lista na hora — deixá-lo ali mostraria, debaixo do nome
de uma coluna, um relato que não está mais nela.

O time **comenta** em duas caixas distintas: o que fica entre a equipe e o que é
escrito para quem relatou. A separação é **estrutural** — duas rotas, duas tabelas,
dois tipos de evento —, e o destaque visual fica na caixa que sai para fora, porque é
lá que o erro custa caro. Ela diz onde a pessoa lê: na página de acompanhamento, junto
das próprias respostas. E cada relato tem uma **linha do tempo**, montada a partir dos
eventos, com os nomes de coluna que valiam na época de cada mudança.

**A jornada pública.** O cliente desenha os passos que quem relatou vê, cada um com
rótulo, a frase que explica e, se quiser, o que vem depois. **Não é a tela de Estados
com outro título** — lá estão as faixas em que o time trabalha, aqui está a história
que a pessoa de fora lê, e ela é mais curta de propósito. Entre três e sete, com o
motivo de cada limite escrito na tela; projeto novo nasce com o conjunto padrão e quem
foi criado antes preenche com um clique. A etapa em que o relato termina carrega o
**desfecho**, de uma lista curta e nossa — foi feito, não será feito, sem retorno, já
existia.

O cliente **liga as duas listas**: cada estado da fila aponta para um passo da
jornada, escolhendo numa lista. Vários estados no mesmo passo é o caminho normal. O
mapa se grava **inteiro**, e cada gravação cria uma versão: alterar hoje não reescreve
o passado, porque são as versões antigas que explicam por onde um relato de três meses
atrás passou. É a única tela do painel com botão de salvar, e é por isso.

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
mudar, que é a janela para desfazer um movimento errado.

**Identidade e visibilidade.** A tela **Identidade** escolhe como quem relata é
reconhecido — pelo protocolo, ou por um código pessoal que traz a lista "os meus
relatos" na ferramenta — e se o projeto é privado, público anônimo ou público
identificado. Público, todo relato passa pela **Moderação** antes de aparecer na
vitrine, "o que já foi relatado", dentro da ferramenta.

**Mídia.** A tela **Mídia** liga o anexo e as duas categorias — imagem e arquivo, cada
uma com quantidade e tamanho por envio; o arquivo com os formatos do catálogo —, a
captura, e o anexo na resposta e na reabertura. Os arquivos aparecem no lugar de onde
vieram — embaixo do relato, da resposta ou da reabertura —, no acompanhamento (pelo
link e pelo código pessoal) e no painel. Os endereços vencem em minutos: a galeria
pede a lista de novo antes do vencimento, e quando um arquivo falha; o que não carrega
diz isso, com "Tentar de novo". O arquivo que não é imagem é sempre baixado, e os
vídeos de antes de o vídeo sair do produto continuam tocando.

| o que falta | onde dói |
|---|---|
| a página não é renderizada no servidor (**Planejado**) | ela baixa **uns 86 kB comprimidos** de JavaScript, uns 60 deles o próprio React, para desenhar uma tela quase sem interação. A tela branca acabou — `tracking.html` desenha um esqueleto antes de qualquer script —, mas o peso continua |
| o limite de envio em `public/reports` | é a rota que qualquer visitante de qualquer site alcança; hoje têm limitador o login e as duas rotas de envio de arquivo. **Planejado** |

Fora do corte, de propósito: o plano de cobrança (**Continuidade**); o quadro de cards
arrastável, com sprint e relatório (**Planejado**); a lista pública com imagens e a página pública
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

**As dicas dos itens bloqueados usam Radix Tooltip.** No design aparecem no
`hover`; assim aparecem também no foco do teclado e são lidas por leitor de tela.

**O progresso da Instalação fica no navegador.** Não é dado de domínio: é
a lembrança de que este navegador já copiou a chave. O sinal de verdade — o
primeiro relato ter chegado — passou a existir com a tela de relatos (hoje **Trabalho**), e o passo
continua sem lê-lo: ler significa uma chamada a mais em toda visita à instalação,
e a troca é decisão de produto, não conserto de texto.

**A marca é "PDS", e não "Rastro".** O nome é provisório até sair o domínio, e
vive em um arquivo só (`shared/components/Brand.tsx`).

**A chave pública tem o formato da API** (`pk_` + base64), e não o `pk_live_…`
ilustrativo do design. O prefixo da secreta tem 11 caracteres, como em
`ProjectKeyGenerator.cs`.
