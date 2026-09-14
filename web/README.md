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
| `npm test` | Lógica pura, arquitetura, sistema visual, um hook e uma tela |
| `npm run typecheck` | `tsc --noEmit`, com `strict` ligado |
| `npm run lint` | Biome: linter e formatador |
| `npm run format` | Aplica as correções do Biome |
| `npm run build` | Checa os tipos, gera o carregador e depois `dist/` |
| `npm run build:loader` | Só o carregador, em `public/v1/pds.js` |

---

## As telas

```
/projects ........................ hub — saudação, criar projeto, busca, lista
/projects/:publicId/start ........ console — "Comece por aqui", 3 passos
/projects/:publicId/keys ......... console — chaves e integração
/projects/:publicId/settings ..... console — nome, identificador, arquivar
/projects/:publicId/reports ...... console — os relatos que chegaram do site
/projects/:publicId/tool ......... console — como a ferramenta aparece no site
```

Dois níveis, como um console de nuvem. **Não existe rota `/login`**: quem abre
uma URL sem sessão vê a entrada naquele mesmo endereço e cai direto onde queria.

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
├── features/     um assunto por pasta: auth, projects, projectKeys, projectStates,
│                 onboarding, reports, widgetSettings
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

**O carregador (`src/loader/`) não desenha nada na página.** Ele cria o `iframe`,
cuida de posição e tamanho, e mais nada. O gatilho, o formulário e as cores moram
dentro do quadro — é o que mantém o site do cliente livre do nosso CSS, e o nosso
livre do dele. Ele sai em IIFE, tem 1,6 kB e não carrega React.

**A conversa entre os dois passa por três conferências**, iguais nas duas pontas:
a origem esperada, a janela exata (`event.source`), e o carimbo `source: 'pds'`.
A segunda é a que costuma faltar — sem ela, outro quadro da **mesma** origem se
passa pelo nosso. Nenhuma resposta sai para `'*'`.
[`src/embed/hostBridge.test.ts`](src/embed/hostBridge.test.ts) exercita cada uma
pelo caminho em que ela falha: remover qualquer guarda reprova três testes.

**A configuração vive em `contracts/widgetSettings.ts`** — dez campos que decidem
textos, cores, tema, posição e quais tipos aparecem. A tela **Ferramenta** os
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

O `index.html` da loja precisa só da linha:

```html
<script src="http://localhost:5173/v1/pds.js" data-key="pk_..." defer></script>
```

Dois tropeços que custam tempo:

**A porta do painel importa.** `CORS_ALLOWED_ORIGINS` na API lista
`http://localhost:5173`, e é o **quadro** que chama a API — então servir o painel
em outra porta faz o envio falhar com "Falha de rede", sem nenhum erro do lado do
servidor. A variável tem nome de painel e hoje decide se o formulário do cliente
consegue enviar, e **separar as duas coisas é tarefa própria, ainda em aberto**.

Esta frase já nomeou um número de etapa, e ele envelheceu sozinho: a ordem mudou e
o número passou a apontar para outra coisa. Referência a trabalho futuro fica pelo
assunto, não pela numeração.

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

A **etapa 1 — Fundação** está inteira: entrar, criar projeto, listar, buscar,
renomear, arquivar, ver as chaves, copiar o script de integração e regenerar a
secreta. Mais a lista de endereços autorizados (pds-011).

A **etapa 2 — O relato entra** fechou o ciclo (pds-014): colar o script numa
página qualquer, escrever, o relato chegar na API com protocolo, rota e origem, e
o time lê na tela **Relatos** — com o contexto de cada um e a visualização
registrada como evento. A aparência e os textos da ferramenta saem de
**Ferramenta** (pds-015), e a **lista de endereços autorizados passou a ser
conferida** (pds-016): lista vazia abre em qualquer lugar, e o primeiro endereço
declarado liga a conferência.

**O caminho de volta existe** (pds-017): a confirmação entrega um link, e
`tracking.html` mostra a quem relatou o próprio relato. O token viaja no fragmento
do link — a parte que o navegador nunca envia a servidor nenhum.

A **etapa 3 — O time trabalha o relato** começou pela peça que sustenta o resto
(pds-018): a tela **Estados**, onde o cliente cria a própria fila de trabalho com
os nomes que a equipe usa, e reordena, renomeia e aposenta cada um. Estado não se
apaga — não há botão de remover em lugar nenhum —, porque relato antigo vai
apontar para ele e o histórico precisa continuar legível. **O relato ainda não
entra nessa fila**: nenhum aponta para um estado hoje, e não existe quadro nem
mudança de estado.

| o que falta | onde dói |
|---|---|
| o relato dentro da fila de trabalho | os estados existem e nada cai neles; sem isso, a tela **Estados** é configuração que ninguém exerce |
| andamento na página de acompanhamento | ela existe e não tem o que mostrar: falta o relato ter estado, e falta traduzi-lo para quem está de fora |
| o limite de envio em `public/reports` | é a rota que qualquer visitante de qualquer site alcança, e a única com limitador é a de login |

Fora do corte, de propósito: plano, etapas públicas, anexo, e o quadro de cards
com board arrastável, sprint e relatório. E o `frame-ancestors` — a conferência de hoje mora no servidor e pega o
caso comum; barrar o quadro no navegador precisa de um servidor servindo
`embed.html`, que é hospedagem que ainda não existe.

---

## Divergências entre o design e o código

Cada uma é de uma linha para reverter se a decisão mudar.

**"Entrar com e-mail" virou "Entrar com Google".** A API só tem
`POST /auth/google`, e login por senha é decisão em aberto (E0-12).

**O identificador é um GUID, não um slug.** O design mostra `loja-ativa-b3f9`; a
API expõe `PublicId` e não tem coluna de slug. Adotar slug é mudança de banco.

**`data-key` no lugar de `data-chave`.** Campo público de integração vai em
inglês, e esse atributo aparece no HTML de todo cliente.

**As dicas dos itens bloqueados usam Radix Tooltip.** No design aparecem no
`hover`; assim aparecem também no foco do teclado e são lidas por leitor de tela.

**O progresso de "Comece por aqui" fica no navegador.** Não é dado de domínio: é
a lembrança de que este navegador já copiou a chave. O sinal de verdade — o
primeiro relato ter chegado — passou a existir com a tela **Relatos**, e o passo
continua sem lê-lo: ler significa uma chamada a mais em toda visita à instalação,
e a troca é decisão de produto, não conserto de texto.

**A marca é "PDS", e não "Rastro".** O nome é provisório até sair o domínio, e
vive em um arquivo só (`shared/components/Brand.tsx`).

**A chave pública tem o formato da API** (`pk_` + base64), e não o `pk_live_…`
ilustrativo do design. O prefixo da secreta tem 11 caracteres, como em
`ProjectKeyGenerator.cs`.
