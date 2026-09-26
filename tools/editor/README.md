# Editor de modelagem

Uma ferramenta para documentar o desenho do PDS sem montar diagrama à mão:

| Ambiente | O que responde | Arquivos |
|---|---|---|
| **Modelagem** | as tabelas, os campos e as relações do banco — uma modelagem por etapa | [`database-models/modeling/`](database-models/modeling/) |

Os arquivos ficam em [`database-models/`](database-models/), uma pasta por ambiente: o que é de modelagem em `database-models/modeling/`. O código fica à parte, em `src/`.

Não tem banco: **o arquivo `.yaml` é o dado**. O mesmo arquivo abre no VSCode e é editado pela IA — o editor recarrega sozinho quando o arquivo muda por fora e, se houver edição da tela ainda não gravada, para e pergunta em vez de sobrescrever.

```
npm install
npm run dev        # http://localhost:5180
```

`npm test` · `npm run typecheck` · `npm run build`

## Entrar e voltar

A tela de início responde, sem clique nenhum, o que se precisa ao chegar:

- **onde eu parei** — o botão **continuar em…** de cada ambiente abre o último arquivo usado nele;
- **o que existe** — a lista inteira de arquivos, pelo título de cada um (“Mídia”, e não só `07-media-attachments`), com a data da última mexida;
- **como começo algo novo** — **+ nova modelagem** entra no ambiente com o campo de nome pronto para digitar.

A tecla `1` entra sem mouse. Se o servidor não responder, a tela diz e oferece **tentar de novo**.

Dentro de um ambiente, o caminho de volta está sempre à vista:

| | |
|---|---|
| Voltar ao início | **‹ início** no alto da lista de arquivos · **⌂** na barra de cima · `Alt+0` · o voltar do navegador |
| Achar um arquivo | a lista mostra o nome e, embaixo, o título de dentro dele |
| Guardar o lugar | o endereço acompanha o arquivo aberto (`#/modeling/07-media-attachments.yaml`): recarregar a página volta nele, e dá para guardar o link |

Ao entrar num ambiente sem arquivo no endereço, abre o último usado nele.

**Sair nunca perde edição.** Voltar ao início (por qualquer um dos caminhos acima, inclusive o voltar do navegador) ou trocar de arquivo grava antes o que estava pendente; quando não dá para gravar (um conflito sem escolha feita, por exemplo), a tela fica onde está e diz por quê. Fechar ou recarregar a aba com edição pendente pede confirmação ao navegador — e, confirmando, o editor ainda tenta gravar na saída.

## O que vale em qualquer ambiente

| | |
|---|---|
| Gravar | sozinho, 800ms após parar de mexer · `⌘S` grava na hora |
| Esconder laterais | `Alt+1` lista de arquivos · `Alt+2` painel |
| Editar | clique no elemento e edite no painel da direita |

O editor para e pergunta — em vez de gravar — quando gravar apagaria algo:

- **o arquivo mudou no disco** enquanto havia edição na tela: escolha entre recarregar do disco e manter o que está na tela;
- **o YAML tem erro de sintaxe**: a edição fica bloqueada até o arquivo ser corrigido no editor de texto;
- **o arquivo tem comentários (`# …`)**: o editor não sabe guardá-los, então nada é gravado até alguém escolher **gravar sem os comentários** — passe o que eles dizem para uma nota ou uma descrição;
- **o arquivo sumiu do disco** (apagado ou renomeado por fora): dá para gravá-lo de novo com o que está na tela, ou fechar. Se ele voltar por outro caminho nesse meio-tempo, vira conflito — nunca é sobrescrito.

## Modelagem

| | |
|---|---|
| Criar | `+ entidade` / `+ nota` na barra de cima |
| Editar | clique numa linha da tabela ou no texto da nota — edita ali mesmo |
| Ligar | arraste de um ponto até outro: da **borda** da caixa, ou da **linha de um campo** (aparece no hover) |
| Mover | arraste a caixa pelo cabeçalho |
| Reordenar campo | arraste pelo `⠿` no painel da direita |
| O que aparece | menu **o que aparece** na barra: mostrar as notas, só as desta modelagem, realçar as da tabela escolhida, realçar as tabelas novas · `Alt+3` mostra e esconde as notas |

O lado em que a linha encosta se reajusta sozinho quando você move as caixas.

### O arquivo de modelagem

```yaml
meta:
  title: Exemplo — conta e usuário

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
| `entities[].name` | em inglês — é o que as relações referenciam |
| `entities[].label` | opcional, em português |
| `relations[].fromField` / `toField` | opcionais: a linha gruda na altura desse campo |
| `relations[].kind` | `one-to-one` · `one-to-many` · `many-to-many` |
| `notes[].anchor` / `anchorField` | opcionais: desenha uma seta até a entidade, ou até o campo |

Campo vazio não é escrito e o lado da linha nunca é gravado — o diff do git mostra só o que mudou. Editar à mão é seguro: falta de `position` vira grade, cardinalidade desconhecida vira `one-to-many`, e referência para algo que não existe vira aviso no painel — nunca exclusão silenciosa.

## Organização

```
database-models/ os arquivos .yaml — database-models/modeling/, uma pasta por ambiente
server/          API de arquivos (Vite serve tudo na mesma porta) — uma rota por pasta, só atende localhost
src/shell/       a tela de início e a escolha do ambiente pelo endereço
src/shared/      o que os ambientes dividem: arquivo aberto, autosave, conflito, lista de arquivos, faixas, navegação
src/modeling/    o ambiente de modelagem — model/ (YAML ↔ estado), hooks/, components/
tests/           camada de modelo da modelagem, e o que os ambientes dividem
```

O `model/` de cada ambiente não sabe que React existe. O CSS de cada ambiente vale só dentro dele (`.app--modeling`); o comum mora em `src/shared/base.css`.
