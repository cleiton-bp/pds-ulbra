# Modelagem de dados

As modelagens do PDS, uma por etapa. Cada `.yaml` guarda entidades, campos, relações e as notas de explicação.

Editadas pelo canvas do [editor](../) (`npm run dev`) ou direto no editor de texto — os dois escrevem no mesmo arquivo, e o editor avisa quando o arquivo muda por fora.

| Arquivo | Cobre |
|---|---|
| `example.yaml` | ponto de partida: `Account` e `User`, uma relação presa aos campos e duas notas com seta |
| `stage-1.yaml` | etapa 1 — conta, usuário, projeto e chaves |
| `stage-2.yaml` | etapa 2 — o mesmo da etapa 1, sem alteração, mais domínios autorizados, relato, contexto e evento |
| `stage-3.yaml` | etapa 3 — os estados do projeto, onde cada tipo de relato entra, os dois comentários em tabelas separadas, e as duas colunas que `reports` e `events` ganham |
| `stage-4.yaml` | etapa 4 — as etapas públicas que o relator vê, o mapeamento versionado que liga os estados a elas, e as duas colunas que `projects` e `reports` ganham |

O `example.yaml` existe para conhecer o editor.

O `stage-4.yaml` é o primeiro em que aparecem duas tabelas que só existem por causa da camada pública: a jornada e o mapa que leva até ela.

O `stage-3.yaml` corrige uma defasagem: `project_widget_settings` já existe no banco e não estava em modelagem nenhuma, então ele aparece ali como herdado.

Nomes seguem o [glossário](../../../local/decisoes-de-projeto.md): entidade e campo em inglês, `label` e `note` em português.

O formato está documentado no [README do editor](../README.md#o-formato-do-arquivo).
