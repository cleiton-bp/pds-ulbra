# Editor de modelagem e casos de uso

Uma ferramenta só, com dois ambientes, para documentar o desenho do PDS sem montar diagrama à mão:

| Ambiente | O que responde | Arquivos |
|---|---|---|
| **Modelagem** | as tabelas, os campos e as relações do banco, uma modelagem por assunto, cada uma somando as anteriores | [`database-models/modeling/`](database-models/modeling/) |
| **Casos de uso** | quem usa o sistema e o que cada ator pode fazer | [`database-models/use-cases/`](database-models/use-cases/) |

Os arquivos ficam todos em [`database-models/`](database-models/), uma pasta por ambiente: o que é de modelagem em `database-models/modeling/`, o que é de caso de uso em `database-models/use-cases/`. O código fica à parte, em `src/`.

Não tem banco: **o arquivo `.yaml` é o dado**. O mesmo arquivo abre no VSCode e é editado pela IA: o editor recarrega sozinho quando o arquivo muda por fora e, se houver edição da tela ainda não gravada, para e pergunta em vez de sobrescrever.

```
npm install
npm run dev        # http://localhost:5180
```

`npm test`, `npm run typecheck` e `npm run build`

## Entrar e voltar

A tela de início responde, sem clique nenhum, o que se precisa ao chegar:

- **onde eu parei**: o botão **continuar em…** de cada ambiente abre o último arquivo usado nele;
- **o que existe**: a lista inteira de arquivos, pelo título de cada um (“Mídia”, e não só `07-media-attachments`), com a data da última mexida;
- **como começo algo novo**: **+ nova modelagem** / **+ novo arquivo** entra no ambiente com o campo de nome pronto para digitar.

As teclas `1` e `2` entram sem mouse. Se o servidor não responder, a tela diz e oferece **tentar de novo**.

Dentro de um ambiente, o caminho de volta está sempre à vista:

| | |
|---|---|
| Voltar ao início | **‹ Início** no alto da lista de arquivos, o botão da casa na barra de cima, `Alt+0` ou o voltar do navegador |
| Trocar de ambiente | as abas **Modelagem** e **Casos de uso** no alto da lista de arquivos |
| Achar um arquivo | a lista mostra o número e o título de dentro do arquivo; o nome do arquivo aparece na dica e embaixo do título, na barra de cima |
| Guardar o lugar | o endereço acompanha o arquivo aberto (`#/modeling/07-media-attachments.yaml`): recarregar a página volta nele, e dá para guardar o link |

Ao entrar num ambiente sem arquivo no endereço, abre o último usado nele.

**Sair nunca perde edição.** Voltar ao início (por qualquer um dos caminhos acima, inclusive o voltar do navegador), trocar de ambiente ou trocar de arquivo grava antes o que estava pendente; quando não dá para gravar (um conflito sem escolha feita, por exemplo), a tela fica onde está e diz por quê. Fechar ou recarregar a aba com edição pendente pede confirmação ao navegador, e, confirmando, o editor ainda tenta gravar na saída.

## O que vale nos dois ambientes

| | |
|---|---|
| Leitura e edição | abre em **Leitura**: nada se arrasta nem se edita, no desenho e no painel, para entender o arquivo sem o risco de mexer nele. **Leitura/Editando** na barra, ou `Alt+E`, troca, e a escolha fica lembrada |
| Gravar | sozinho, 800ms após parar de mexer, e `⌘S` grava na hora |
| Laterais | o botão `«`/`»` no topo de cada uma recolhe; recolhida, ela vira uma faixa na borda com o nome (**Arquivos**, **Detalhes**), e clicar na faixa abre de novo. `Alt+1` abre e fecha a lista de arquivos, e `Alt+2`, o painel. Arraste a borda para alargar, e o clique duplo na borda volta à largura de fábrica. O desenho guarda sempre 40% da janela (nunca menos de 520px): a borda para nesse limite, e a janela que estreita encolhe as laterais até o mínimo delas, sem nada rolar para o lado; a largura escolhida volta quando a janela alarga |
| Buscar | `⌘K` ou `Ctrl+K` (ou **Buscar** na barra): digite parte do nome e Enter leva até ele |
| Zoom | os botões no canto do desenho: −, a porcentagem (clique volta a 100%), + e **Tudo** |
| De longe | abaixo de 45% de zoom, na modelagem, o nome de cada tabela aparece grande por cima dela e as colunas esmaecem, mas a caixa não muda de tamanho, então nada pula; passar o mouse numa tabela mostra um cartão com o resumo (o que mudou, colunas, notas) e acende as ligações dela |
| O desenho só se mexe quando você mexe | clicar numa tabela só escolhe; para chegar perto, a roda, o `+` (que aproxima mantendo a tabela escolhida no lugar) ou **Aproximar**, que aparece sobre ela. A busca, a lista de mudanças e o percurso deslizam até a tabela no zoom em que você está, sem aproximar |
| Movimento | as laterais deslizam ao abrir e fechar, o desenho surge aos poucos ao trocar de arquivo, e seleção, realce, menus e painel mudam com transição curta, e tudo fica desligado quando o sistema pede menos movimento |
| Rolagem | as barras são finas e sem trilho, e só aparecem com o mouse sobre a área que rola |
| Tour | ao abrir um arquivo, cada ambiente pergunta **Primeira vez na modelagem?** (ou **nos casos de uso?**), e **Sim, me mostre** abre o tour ali mesmo. A pergunta volta a cada entrada no ambiente, pelo início ou pela aba do outro, até alguém marcar a caixinha **Não perguntar de novo** daquele ambiente (fica guardada no navegador, uma para cada); trocar de arquivo dentro do ambiente não pergunta. O **?** no canto da barra abre o tour quando quiser. Ele começa direto pelo arquivo aberto e apresenta o editor em um minuto: cada passo acende uma parte da tela e diz para que ela serve, e no painel da direita uma explicação do arquivo aberto: do que ele trata, o que traz e como ler uma tabela dele (ou cada forma do desenho, nos casos de uso). **Próximo** e **Voltar**, ou `←` e `→`, andam, e `Esc` ou **Sair** fecham. Enquanto ele está aberto, o resto da tela não responde, e ao sair tudo volta como estava, sem mudar nada no arquivo |
| Dicas | parar o mouse sobre um botão mostra o que ele faz e o atalho, sem esperar a dica do navegador; clicar ou teclar esconde |
| Editar | em **Editando**, clique no elemento e edite no painel da direita |
| Apagar | sempre pergunta antes, num diálogo da tela: o foco começa em **Cancelar**, e `Esc` ou clicar fora também cancelam |

O editor para e pergunta, em vez de gravar, quando gravar apagaria algo:

- **o arquivo mudou no disco** enquanto havia edição na tela: escolha entre recarregar do disco e manter o que está na tela;
- **o YAML tem erro de sintaxe**: a edição fica bloqueada até o arquivo ser corrigido no editor de texto;
- **o arquivo tem comentários (`# …`)**: o editor não sabe guardá-los, então nada é gravado até alguém escolher **gravar sem os comentários** (passe o que eles dizem para uma nota ou uma descrição);
- **o arquivo sumiu do disco** (apagado ou renomeado por fora): dá para gravá-lo de novo com o que está na tela, ou fechar. Se ele voltar por outro caminho nesse meio-tempo, vira conflito e nunca é sobrescrito.

## Modelagem

| | |
|---|---|
| Criar | em **Editando**, `+ Tabela` / `+ Nota` na barra de cima |
| Editar | clicar numa coluna, numa nota ou numa ligação mostra ela no painel (e abre o painel, se estava recolhido). Em **Editando**: o **clique duplo** edita no próprio desenho o nome e o tipo da coluna, ou o texto inteiro da nota (Enter ou Esc fecham), e o painel edita o resto: as bandeiras como interruptores, a observação inteira, sobre o que a nota fala. Em **Leitura**, o clique duplo avisa e oferece **Editar** |
| Ligar | arraste de um ponto até outro: da **borda** da caixa, ou da **linha de um campo** (aparece no hover) |
| Mover | arraste a caixa pelo cabeçalho |
| Reordenar coluna | arraste pelo `⠿` na lista de colunas do painel |
| Notas | menu **Notas** na barra: **resumidas** (a nota de uma tabela vira o marcador no cabeçalho dela, e o texto abre no painel), **inteiras** (em caixa, como no arquivo) ou **ocultas**, e `Alt+3` esconde e mostra |

O lado em que a linha encosta se reajusta sozinho quando você move as caixas. Com uma tabela escolhida, só as ligações dela ficam acesas, com o `1:N` escrito.

### O que cada arquivo muda

Cada arquivo de modelagem repete as tabelas de antes para dar contexto. O editor compara o arquivo aberto com o **anterior da sequência** (o `13-…` com o `12-…`) e marca o que ele acrescenta, calculado na tela, sem gravar nada no arquivo:

| | |
|---|---|
| **nova** (verde) | tabela que o anterior não tinha |
| **alterada** (âmbar) | coluna nova (`+`), removida (`−`, riscada no fim da caixa) ou com tipo ou bandeira mudados (`~`) |
| **só texto** (azul) | só a descrição, o rótulo ou a observação de uma coluna mudou (`✎`) |
| sem mudança | igual ao anterior |

- **Mudanças** e **Tudo**, na barra: em **Mudanças** a tabela sem mudança fica recolhida no cabeçalho e só as notas novas aparecem; **Tudo** mostra cada tabela inteira e todas as notas.
- O arquivo abre com o desenho inteiro enquadrado. **Percorrer mudanças**, no canto do desenho, liga o percurso: ele desliza de tabela em tabela (as novas, depois as alteradas), com **Anterior**, **Próxima** e **Sair** numa barra, e `←` e `→` também andam, enquanto `Esc` sai. Trocar entre **Mudanças** e **Tudo** não move o desenho.
- O painel, com nada escolhido, abre com uma frase que resume o arquivo e lista as mudanças em grupos (tabelas novas, alteradas coluna por coluna, só de texto, ligações e notas novas, e o que saiu); os de leitura menos urgente (só texto, ligações, o que saiu) vêm fechados, e cada item leva até ele. As observações só reescritas viram uma linha, **e mais N observações reescritas**, que abre a lista no painel da tabela. **Comparado com** troca o arquivo-base, ou desliga a comparação.
- Escolhida uma tabela, o painel mostra no topo o que mudou nela, depois as colunas e as notas dela.

### O arquivo de modelagem

```yaml
meta:
  title: Exemplo, conta e usuário

entities:
  - name: Account
    label: Conta
    position: { x: 80, y: 140 }
    fields:
      - { name: id, type: int, pk: true, note: nunca exposto }

relations:
  - from: Account
    fromField: id
    to: User
    toField: account_id
    kind: one-to-many

notes:
  - text: Texto livre no canvas.
    anchor: User
    anchorField: email
    position: { x: 80, y: 420 }
```

| Chave | |
|---|---|
| `entities[].name` | em inglês; é o que as relações referenciam |
| `entities[].label` | opcional, em português |
| `relations[].fromField` / `toField` | opcionais: a linha gruda na altura desse campo |
| `relations[].kind` | `one-to-one`, `one-to-many` ou `many-to-many` |
| `notes[].anchor` / `anchorField` | opcionais: desenha uma seta até a entidade, ou até o campo |

Campo vazio não é escrito e o lado da linha nunca é gravado, então o diff do git mostra só o que mudou. Editar à mão é seguro: falta de `position` vira grade, cardinalidade desconhecida vira `one-to-many`, e referência para algo que não existe vira aviso no painel, e nunca exclusão silenciosa.

## Casos de uso

| | |
|---|---|
| Criar | em **Editando**, `+ Ator` / `+ Caso de uso` / `+ Nota` na barra de cima |
| Editar | em **Editando**, clique no elemento e edite no painel da direita, ou dê clique duplo para editar o nome ali mesmo |
| Ligar | passe o mouse no elemento e arraste de um dos pontos da borda até outro elemento, e dá para soltar em qualquer parte dele |
| Mover | arraste o elemento |
| O que aparece | menu **Ver** na barra: notas (`Alt+3`), fronteira do sistema, e o realce de quem faz o quê (`Alt+4`) |

O tipo da ligação sai das pontas, e dá para trocar no painel:

| Puxou de… até… | Vira | Desenho |
|---|---|---|
| ator → caso de uso | associação: o ator realiza | linha cheia, sem seta |
| caso de uso → caso de uso | inclusão: o de origem sempre executa o de destino | tracejada, `«include»` |
| | extensão: o de origem acrescenta ao de destino, sob uma condição | tracejada, `«extend»` |
| ator → ator | generalização: o de origem é um tipo do de destino | triângulo vazado no mais geral |

A **fronteira do sistema** se desenha sozinha em volta dos casos de uso, com o nome escrito em **Sistema** no painel do arquivo. Os atores ficam de fora dela.

### Quem faz o quê

É a pergunta que o diagrama responde, e o editor responde por escrito:

- no painel do **arquivo** (nada escolhido), a lista de cada ator com o que ele realiza;
- no painel do **ator**, o que ele pode fazer e por quê: direto, herdado de outro ator (generalização), ou arrastado junto por inclusão, extensão ou especialização;
- no painel do **caso de uso**, quem o realiza.

Sistema externo (`kind: system`) **participa** do caso de uso, em vez de realizá-lo: o banco responde, e quem paga é a pessoa. O editor fala assim nas frases e nos avisos.

Com **realçar quem faz o quê** ligado, escolher um ator apaga o que ele não alcança; escolher um caso de uso apaga quem não o realiza.

### O arquivo de casos de uso

```yaml
meta:
  title: Exemplo, relator e time
  system: PDS
  description: …

actors:
  - name: Relator
    description: Quem encontrou o problema.
    position: { x: 110, y: 250 }
  - name: Google
    kind: system
    position: { x: 900, y: 250 }

useCases:
  - id: UC01
    name: Abrir relato
    description: …
    width: 210
    position: { x: 260, y: 40 }
    preconditions: …
    mainFlow:
      - O relator abre o widget.
      - Descreve o que aconteceu.
    alternativeFlows:
      - title: 2a. A descrição fica em branco
        steps:
          - O formulário pede a descrição.
    postconditions: …

links:
  - from: Relator
    to: UC01
    kind: association
  - from: UC02
    to: UC01
    kind: extend
    note: quando o relator escolhe anexar

notes:
  - text: Texto livre no canvas.
    anchor: Relator
    position: { x: -60, y: 470 }
```

| Chave | |
|---|---|
| `meta.system` | o nome no topo da fronteira do sistema |
| `actors[].name` | é o que as ligações citam |
| `actors[].kind` | opcional: `person` (o padrão, desenhado como boneco) ou `system` (caixa com «sistema») |
| `useCases[].id` | código curto; é o que as ligações citam |
| `useCases[].width` | opcional: a largura da elipse |
| `preconditions` … `postconditions` | a especificação, toda opcional; **um passo é uma linha** |
| `links[].kind` | `association`, `include`, `extend` ou `generalization` |
| `links[].note` | observação livre; na extensão, a condição |
| `notes[].anchor` | opcional: liga a nota a um ator ou caso de uso |

**O sentido da ligação importa** em três dos quatro tipos: na inclusão, `from` inclui `to`; na extensão, `from` estende `to`; na generalização, `from` é um tipo de `to`. Na associação o sentido não diz nada, e o editor grava o ator em `from`.

Campo vazio não é escrito, então o diff do git mostra só o que mudou. Editar à mão é seguro, porque gravar pelo editor nunca apaga o que ele não entende:

- falta de `position` vira um arranjo de diagrama: atores à esquerda, casos de uso ao lado, notas à direita;
- caso de uso sem `id` ganha o próximo código livre, com o mesmo número de dígitos que o arquivo já usa;
- ligação sem `kind` ganha o tipo que as pontas permitem; `extends`, `extensão`, `«include»` e afins são entendidos; tipo que o editor não conhece volta para o arquivo como estava, com aviso;
- dá para rascunhar na forma curta: `actors: [Relator]`, `useCases: [Abrir relato]`, e um fluxo como bloco de texto, um passo por linha;
- seção com um item só, sem ser lista (`links:` com um mapa), vira uma lista de um;
- código e nome continuam texto como foram escritos: `id: 1.10` não vira o número `1.1`;
- chave que o editor não conhece (`descripton`, `priority`) volta para o arquivo como estava e vira aviso;
- item que não tem formato de nada (uma ligação escrita como texto solto) volta para o arquivo como estava e vira aviso;
- referência para algo que não existe vira aviso no painel e continua no arquivo, e nunca há exclusão silenciosa.

### Avisos

O painel do arquivo lista o que está quebrado ou esquisito, sem bloquear nada: nome ou código repetido (deixa o arquivo ambíguo), chave, item ou tipo que o editor não conhece, ligação para quem não existe, ligação repetida, tipo que não combina com as pontas (associação entre dois atores, `«include»` com ator na ponta), inclusão ou generalização em círculo, ator desenhado dentro da fronteira do sistema, caso de uso que nenhum ator alcança, e ator que não realiza nada. Não entram o ator pai que só agrupa os filhos, nem o caso de uso geral que só existe pelas variações.

Em memória as ligações apontam para o elemento, e não para o nome: renomear um ator ou trocar o código de um caso de uso leva todas as linhas junto, sem risco de uma digitação que passa pelo nome de outro ator roubar as ligações dele.

## Organização

```
database-models/ os arquivos .yaml, em database-models/modeling/ e database-models/use-cases/, uma pasta por ambiente
server/          API de arquivos (Vite serve tudo na mesma porta), uma rota por pasta, só atende localhost
src/shell/       a tela de início e a escolha do ambiente pelo endereço
src/shared/      o que os dois ambientes dividem: arquivo aberto, autosave, conflito, lista de arquivos, faixas, navegação
src/modeling/    o ambiente de modelagem: model/ (YAML ↔ estado), hooks/, components/
src/use-cases/   o ambiente de casos de uso: model/ (YAML ↔ estado, quem faz o quê, avisos), hooks/, components/
src/tour/        o tour do editor: steps.ts (o roteiro), Tour.tsx (destaque, cartão, Próximo/Voltar), targets.ts (as partes da tela que ele acende), ModelingGuide/UseCasesGuide (a explicação no painel) e explain.ts (o texto dela)
tests/           camada de modelo dos dois ambientes, e o que eles dividem
```

O `model/` de cada ambiente não sabe que React existe. O CSS de cada ambiente vale só dentro dele (`.app--modeling`, `.app--use-cases`); o comum mora em `src/shared/base.css`.

Para um terceiro ambiente, o caminho é o mesmo dos dois:

1. a pasta de conteúdo em `database-models/<ambiente>/`, registrada em `COLLECTIONS` (`server/files.ts`);
2. a entrada em `ENVIRONMENTS` (`src/shared/environments.ts`), que é o que aparece no início e nas abas;
3. `src/<ambiente>/`, com o `format.ts` (como o arquivo vira documento e volta) e o `App.tsx`, que usa `useWorkspace`, `FileSidebar` e `Banners` como os outros dois e põe `app--<ambiente>` na raiz;
4. o `App` no `EDITORS` de `src/shell/Shell.tsx`, e o `styles.css` dele importado em `src/main.tsx`, com tudo dentro de `.app--<ambiente>`.

### O tour

O roteiro mora em `src/tour/steps.ts`, um passo por item, e trocar um texto é mexer só ali:

| campo | o que é |
|---|---|
| `target` | a parte da tela que acende (`files`, `canvas`, `panel`, `search`…). Cada uma é marcada no componente com `{...tourTarget('…')}`; um nome errado de qualquer lado não compila. Sem `target`, o cartão fica no meio da tela |
| `title`, `text` | até três palavras no título e até 14 no texto (um teste confere), falando com quem lê, sem termo técnico que a tela não mostre; o texto diz para que a parte serve, e não descreve o botão. Um passo, uma ideia |
| `stage` | como a tela precisa estar no passo (lista de arquivos aberta, painel aberto, a vista **Mudanças**). O que o passo não pede fica como estava antes do tour: por isso **Voltar** desfaz sozinho e sair devolve a tela |
| `stage.explain` | o que o painel da direita mostra no lugar do de sempre: `file` (do que o arquivo trata e o que traz, e nos casos de uso, quem aparece e quanto cada um faz), `read` (como ler o desenho, com um pedaço do próprio arquivo: uma tabela, ou um ator, o caso que ele faz e o «include»/«extend» preso a ele) ou `case`, só nos casos de uso (um caso por dentro: antes de começar, o caminho de sempre, se der diferente, no fim). O que é do conteúdo em si vai para cá, e não para o cartão |
| `when` | só nos arquivos comparados a um anterior (`comparing`), só com tabela nova ou alterada (`has-changes`), ou só com caso de uso de passos escritos (`has-flow`); nos outros o passo fica fora, e a contagem "Passo 3 de 9" sai certa |

O tour só mexe no que é de tela: nunca liga a edição, nunca arrasta, nunca grava. Num ambiente novo, o `App` guarda a tela ao abrir o tour e aplica o `stage` de cada passo, como fazem os dois de hoje (`stageTour`).
