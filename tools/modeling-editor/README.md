# Editor de modelagem

Canvas para desenhar a modelagem de dados do PDS, em vez de escrever tabela markdown na mão.

Não tem banco: **o arquivo `.yaml` é o dado**, e fica em [`database-models/`](database-models/). O mesmo arquivo abre no VSCode e é editado pela IA — se mudar por fora enquanto está aberto, o editor avisa em vez de sobrescrever.

```
npm install
npm run dev        # http://localhost:5180
```

`npm test` · `npm run typecheck` · `npm run build`

## Como usar

| | |
|---|---|
| Criar | `+ entidade` / `+ nota` na barra de cima |
| Editar | clique numa linha da tabela ou no texto da nota — edita ali mesmo |
| Ligar | arraste de um ponto até outro: da **borda** da caixa, ou da **linha de um campo** (aparece no hover) |
| Mover | arraste a caixa pelo cabeçalho |
| Reordenar campo | arraste pelo `⠿` no painel da direita |
| Esconder laterais | `Alt+1` arquivos · `Alt+2` painel |
| Gravar | sozinho, 800ms após parar · `⌘S` força |

O lado em que a linha encosta se reajusta sozinho quando você move as caixas.

## O arquivo

```yaml
meta:
  title: Exemplo — conta e usuário

entities:
  - name: Account              # em inglês — é o que as relações referenciam
    label: Conta               # opcional, em português
    position: { x: 80, y: 140 }
    fields:
      - { name: id, type: int, pk: true, note: nunca exposto }

relations:
  - from: Account
    fromField: id              # opcional: gruda na altura desse campo
    to: User
    toField: account_id        # opcional
    kind: one-to-many          # one-to-one | one-to-many | many-to-many

notes:
  - text: Texto livre no canvas.
    anchor: User               # opcional: desenha uma seta até a entidade
    anchorField: email         # opcional: até o campo
    position: { x: 80, y: 420 }
```

Campo vazio não é escrito e o lado da linha nunca é gravado — o diff do git mostra só o que mudou.

Editar à mão é seguro: falta de `position` vira grade, cardinalidade desconhecida vira `one-to-many`, e referência para algo que não existe vira aviso no painel — nunca exclusão silenciosa.

## Organização

```
server/       API de arquivos (Vite serve tudo na mesma porta)
src/model/    YAML ↔ estado — não sabe que React existe
src/hooks/    documento aberto, autosave, conflito, ações
src/components/  canvas/ (React Flow) · inspector/ (painel)
tests/        camada de modelo
```
