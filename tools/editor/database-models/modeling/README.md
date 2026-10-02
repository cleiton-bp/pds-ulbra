# Modelagem de dados

As modelagens do PDS, uma por assunto, na ordem em que cada um entrou no banco. Cada `.yaml` guarda entidades, campos, relações e as notas de explicação.

Editadas pelo ambiente **Modelagem** do [editor](../../) (`npm run dev`) ou direto no editor de texto — os dois escrevem no mesmo arquivo. O editor recarrega sozinho quando o arquivo muda por fora e, se houver edição na tela ainda não gravada, pergunta em vez de sobrescrever.

| Arquivo | Cobre |
|---|---|
| `01-foundation.yaml` | fundação — conta, usuário, projeto e chaves |
| `02-report-intake.yaml` | o relato entrando — o mesmo da fundação, sem alteração, mais domínios autorizados, relato, contexto e evento |
| `03-team-workflow.yaml` | o time trabalha o relato — os estados do projeto, onde cada tipo de relato entra, os dois comentários em tabelas separadas, e as duas colunas que `reports` e `events` ganham |
| `04-public-journey.yaml` | a jornada pública — as etapas públicas que o relator vê, o mapeamento versionado que liga os estados a elas, e as duas colunas que `projects` e `reports` ganham |
| `05-closing-cycle.yaml` | o ciclo fecha — o encerramento com motivo, a resposta de quem relatou, e as regras do ciclo que cada projeto configura |
| `06-reporter-identity.yaml` | identidade e visibilidade — quem é quem num projeto, quem pode ver o que, o código que quem relata guarda, e a fila de moderação por onde todo relato passa antes de virar público |
| `07-media-attachments.yaml` | mídia — o que cada projeto aceita receber (imagem e arquivo), os limites de cada categoria numa linha por categoria, e o registro do anexo cujo arquivo mora fora do banco: de que envio veio e como aparece |
| `08-team-work.yaml` | o time — quem entra em cada projeto e com que papel (administrador ou membro); a mesma pessoa em projetos de várias contas, o dono mandando em todos os projetos da conta sem linha nova, e a conta deixando de ser a fronteira de isolamento |
| `example.yaml` | ponto de partida: `Account` e `User`, uma relação presa aos campos e duas notas com seta |

**Um arquivo por assunto, e os anteriores não se mexem.** Cada `.yaml` é a modelagem **como ela ficou quando aquele assunto entrou**, e não a modelagem de hoje: tabela ou coluna que muda depois entra no arquivo do assunto que a mudou, marcada ali, e o arquivo antigo continua contando o que era verdade na época. Reescrever o passado apagaria justamente a informação que a sequência de arquivos existe para guardar. A exceção é o vocabulário: a nota que citava a ordem em que o trabalho foi feito foi reescrita, sem mudar o que ela conta.

O `example.yaml` existe para conhecer o editor.

O `04-public-journey.yaml` é o primeiro em que aparecem duas tabelas que só existem por causa da camada pública: a jornada e o mapa que leva até ela.

O `03-team-workflow.yaml` corrige uma defasagem: `project_widget_settings` já existe no banco e não estava em modelagem nenhuma, então ele aparece ali como herdado.

O `08-team-work.yaml` é o primeiro que muda o sentido de uma coluna sem mudar a forma dela: `account_id` de `users` passa a ser a conta própria da pessoa, e não mais a única conta que ela enxerga. A nota da coluna começa com "sentido novo —", do mesmo jeito que coluna acrescentada começa com "coluna nova —".

O `06-reporter-identity.yaml` corrige outra, do mesmo tipo: cinco colunas existiam no banco sem estar em desenho nenhum — `avatar_url` e `last_login_at` em `users`, `last_used_at` em `project_keys`, e o `public_id` de `project_initial_states` e de `report_contexts`. Aparecem ali como herdadas, e os arquivos anteriores continuam como estavam.

Nomes seguem o [glossário](../../../../local/decisoes-de-projeto.md): entidade e campo em inglês, `label` e `note` em português. O nome do arquivo também é em inglês, com um número de ordem na frente — é ele que põe a lista na ordem —, e o título de dentro do arquivo é o nome curto do assunto, em português. O mesmo padrão dos [casos de uso](../use-cases/).

O formato está documentado no [README do editor](../../README.md#o-arquivo-de-modelagem).
