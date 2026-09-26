# Modelagem de dados

As modelagens do PDS, uma por etapa. Cada `.yaml` guarda entidades, campos, relações e as notas de explicação.

Editadas pelo ambiente **Modelagem** do [editor](../../) (`npm run dev`) ou direto no editor de texto — os dois escrevem no mesmo arquivo. O editor recarrega sozinho quando o arquivo muda por fora e, se houver edição na tela ainda não gravada, pergunta em vez de sobrescrever.

| Arquivo | Cobre |
|---|---|
| `01-foundation.yaml` | etapa 1 — conta, usuário, projeto e chaves |
| `02-report-intake.yaml` | etapa 2 — o mesmo da etapa 1, sem alteração, mais domínios autorizados, relato, contexto e evento |
| `03-team-workflow.yaml` | etapa 3 — os estados do projeto, onde cada tipo de relato entra, os dois comentários em tabelas separadas, e as duas colunas que `reports` e `events` ganham |
| `04-public-journey.yaml` | etapa 4 — as etapas públicas que o relator vê, o mapeamento versionado que liga os estados a elas, e as duas colunas que `projects` e `reports` ganham |
| `05-closing-cycle.yaml` | etapa 5 — o encerramento com motivo, a resposta de quem relatou, e as regras do ciclo que cada projeto configura |
| `06-reporter-identity.yaml` | etapa 6 — quem é quem num projeto, quem pode ver o que, o código que quem relata guarda, e a fila de moderação por onde todo relato passa antes de virar público |
| `07-media-attachments.yaml` | etapa 7 — o que cada projeto aceita receber junto do relato, os limites de cada tipo de mídia numa linha por tipo, e o registro do anexo cujo arquivo mora fora do banco |
| `example.yaml` | ponto de partida: `Account` e `User`, uma relação presa aos campos e duas notas com seta |

**Um arquivo por etapa, e os anteriores não se mexem.** Cada `.yaml` é a modelagem **como ela ficou ao fim daquela etapa**, e não a modelagem de hoje: tabela ou coluna que muda depois entra no arquivo da etapa que mudou, marcada ali, e o arquivo antigo continua contando o que era verdade na época. Reescrever o passado apagaria justamente a informação que a sequência de arquivos existe para guardar.

O `example.yaml` existe para conhecer o editor.

O `04-public-journey.yaml` é o primeiro em que aparecem duas tabelas que só existem por causa da camada pública: a jornada e o mapa que leva até ela.

O `03-team-workflow.yaml` corrige uma defasagem: `project_widget_settings` já existe no banco e não estava em modelagem nenhuma, então ele aparece ali como herdado.

O `06-reporter-identity.yaml` corrige outra, do mesmo tipo: cinco colunas existiam no banco sem estar em desenho nenhum — `avatar_url` e `last_login_at` em `users`, `last_used_at` em `project_keys`, e o `public_id` de `project_initial_states` e de `report_contexts`. Aparecem ali como herdadas, e os arquivos anteriores continuam como estavam.

Nomes seguem o [glossário](../../../../local/decisoes-de-projeto.md): entidade e campo em inglês, `label` e `note` em português. O nome do arquivo também é em inglês, com o número da etapa na frente — é ele que põe a lista na ordem —, e o título de dentro do arquivo é o nome curto da etapa, em português.

O formato está documentado no [README do editor](../../README.md#o-arquivo-de-modelagem).
