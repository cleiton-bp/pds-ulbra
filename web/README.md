# Painel — PDS

Frontend da plataforma. React 19, TypeScript, Vite, Tailwind 4.

> **Roda inteiro com dados de demonstração**, sem API e sem credencial nenhuma —
> dá para abrir, clicar e avaliar sem pedir `.env` a ninguém. A implementação que
> fala com a API em C# **já está escrita** e ligada por variável de ambiente.

Implementação do design **`Painel de relato de bugs`** (Claude Design). As
divergências entre a prancheta e o código estão no fim deste arquivo.

---

## Rodar

Precisa de **Node 22 ou mais novo**.

```bash
cd web
npm install
npm run dev
```

Abre em **`http://localhost:5173`**. A tela de entrada tem um botão, e ele funciona.

---

## Os três modos

O modo ativo aparece escrito no rodapé da tela de entrada — painel com dado de
demonstração que não se anuncia acaba confundido com sistema pronto.

| Modo | Configuração | O que acontece no login |
|---|---|---|
| **Demonstração** | nada configurado (padrão) | Sessão local. Sem rede, sem Google, sem API. |
| **Google real** | só `VITE_GOOGLE_CLIENT_ID` | Sign-In de verdade; seu nome e sua foto aparecem. A sessão continua local. |
| **API real** | `VITE_USE_API=true` + as duas variáveis | O token vai para `POST /auth/google`, que confere a assinatura. |

```bash
cp .env.example .env.local
```

| Variável | Para quê |
|---|---|
| `VITE_USE_API` | `true` liga a API real |
| `VITE_API_URL` | Endereço da API. Padrão `http://localhost:5080` |
| `VITE_GOOGLE_CLIENT_ID` | ID do cliente OAuth, do Google Cloud |

> ⚠️ **O modo "Google real" não confere o token.** Lê o nome e a foto de dentro do
> `id_token` para preencher a tela, e mais nada. Quem confere assinatura é
> servidor. Serve para desenvolver e demonstrar; nunca para valer.

Duas coisas que travam quem liga pela primeira vez: `http://localhost:5173`
precisa estar nas **Origens JavaScript autorizadas** do cliente OAuth, e
`CORS_ALLOWED_ORIGINS` no `.env.local` **da API** precisa incluir a mesma origem
(lista vazia lá significa nenhuma origem liberada, e não todas).

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe em `http://localhost:5173` |
| `npm test` | Camada de dados, lógica pura, arquitetura, sistema visual, um hook e uma tela |
| `npm run typecheck` | `tsc --noEmit`, com `strict` ligado |
| `npm run lint` | Biome: linter e formatador |
| `npm run format` | Aplica as correções do Biome |
| `npm run build` | Checa os tipos e gera `dist/` |

---

## As telas

```
/projects ........................ hub — saudação, criar projeto, busca, lista
/projects/:publicId/start ........ console — "Comece por aqui", 3 passos
/projects/:publicId/keys ......... console — chaves e integração
/projects/:publicId/settings ..... console — nome, identificador, arquivar
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
│   ├── index.ts    ← o ÚNICO lugar que escolhe entre mock e API
│   ├── mock/       memória, 200 ms de latência, mesmas regras da API
│   └── api/        fetch, envelope, token
├── features/     um assunto por pasta: auth, projects, projectKeys, onboarding
├── shared/       componentes, hooks e utilitários sem dono
└── styles/       o sistema de cor, em duas camadas de token
```

```
   app  →  features  →  data · shared  →  contracts
```

As setas são de mão única, e três regras sustentam isso: nenhuma tela alcança
`data/mock` ou `data/api`, nenhuma tela importa de `app/`, e nenhuma feature
importa de outra. Não fica só escrito aqui —
[`src/test/architecture.test.ts`](src/test/architecture.test.ts) percorre os
arquivos e reprova o `npm test` com o nome do import que quebrou a regra, e traz
o motivo de cada uma.

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

Esta é a **etapa 1 — Fundação**: entrar, criar projeto, listar, buscar, renomear,
arquivar, ver as chaves, copiar o script de integração e regenerar a secreta.

Fora do corte, de propósito: domínios permitidos, limites de envio, plano, widget,
relato, etapas públicas e a ferramenta própria.

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
primeiro relato ter chegado — só existe a partir da etapa 2.

**A marca é "PDS", e não "Rastro".** O nome é provisório até sair o domínio, e
vive em um arquivo só (`shared/components/Brand.tsx`).

**A chave pública tem o formato da API** (`pk_` + base64), e não o `pk_live_…`
ilustrativo do design. O prefixo da secreta tem 11 caracteres, como em
`ProjectKeyGenerator.cs`.
