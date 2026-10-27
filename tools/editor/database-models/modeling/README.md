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
| `08-team-work.yaml` | o time — quem entra em cada projeto e com que papel (administrador ou membro); a mesma pessoa em projetos de várias contas, o dono mandando em todos os projetos da conta sem linha nova, e a conta deixando de ser a fronteira de isolamento; o convite por e-mail, que guarda só o hash do link, e a configuração do time, com o prazo do convite; e o card do time na tabela do relato, com o número curto do projeto, a descrição em Markdown e o arquivamento; e o que o time dá a todo card — o título de quem relatou guardado ao lado do título do time, o responsável, a prioridade, as etiquetas e o prazo, com as prioridades e as etiquetas do projeto; e o quadro — o lugar de cada card na coluna, o topo de quem chega e quando o card entrou na coluna, e as duas regras do quadro no ciclo |
| `09-report-types.yaml` | os tipos de relato — o tipo deixa de ser uma lista fixa e passa a ser do projeto, como as prioridades, com nome, cor, desenho e ordem; o que cada tipo pergunta, em perguntas curtas e/ou na caixa livre com o texto dela, e em que coluna o relato entra; e o relato, que aponta para o tipo e guarda as respostas com a pergunta como ela estava no envio — e a tabela de onde cada tipo entrava sai |
| `10-widget-texts.yaml` | os textos da ferramenta — todo texto que o quadro mostrava fixo passa a ser do projeto, com o de fábrica igual ao que aparecia, e a frase do topo do acompanhamento também; a confirmação e essa frase aceitam variáveis, que a tela troca como texto puro |
| `11-widget-appearance.yaml` | a aparência do botão — o botão parado no site do cliente passa a ser do projeto, com o de fábrica igual ao de sempre: os quatro cantos e a distância dele, ícone, só o ícone, tamanho, formato, cor do texto, sombra e como fica no celular; e as páginas onde ele não aparece, que a ferramenta compara no navegador |
| `12-blocked-origins.yaml` | os domínios bloqueados — a lista à parte da de autorizados, que recusa na hora mesmo com a de autorizados vazia, com quem bloqueou e se vale para os subdomínios; e o relato, que grava o domínio na forma das listas e guarda a decisão de manter o que veio de um domínio bloqueado — a marca em si não é coluna |
| `13-report-limits.yaml` | os limites e os domínios retidos — as camadas de limite da entrada do relato (quem relata, IP, domínio e projeto, e o intervalo mínimo), configuráveis por projeto até um teto do sistema, com as contagens na memória e nenhum IP no banco; o relato de domínio fora da lista de autorizados, recebido e retido até o time permitir ou bloquear; e os dois avisos do projeto no sino, sem card |
| `14-inherited-identity.yaml` | a identidade herdada do sistema do cliente — o servidor do cliente assina quem é a pessoa num crachá curto, e a API confere com a chave pública do projeto, sem chamar o sistema dele; a configuração de identidade ganha a chave pública, o sal, a validade máxima do crachá e a exigência dele; e a tabela do código pessoal, que passa a guardar também a pessoa do modo herdado, só pelo hash — a lista e a leitura pela lista funcionam com o crachá no lugar do código, e leem sem agir |
| `15-performance.yaml` | o desempenho — a coluna que a busca compara, gerada pelo banco a cada gravação, e os eventos sem as chaves estrangeiras da conta e do projeto, que cada evento gravado travava; duas mudanças que nasceram de medir o sistema sob carga, e que não mudam o que ele faz |
| `example.yaml` | ponto de partida: `Account` e `User`, uma relação presa aos campos e duas notas com seta |

**Um arquivo por assunto, e os anteriores não se mexem.** Cada `.yaml` é a modelagem **como ela ficou quando aquele assunto entrou**, e não a modelagem de hoje: tabela ou coluna que muda depois entra no arquivo do assunto que a mudou, marcada ali, e o arquivo antigo continua contando o que era verdade na época. Reescrever o passado apagaria justamente a informação que a sequência de arquivos existe para guardar. A exceção é o vocabulário: a nota que citava a ordem em que o trabalho foi feito foi reescrita, sem mudar o que ela conta.

O `example.yaml` existe para conhecer o editor.

O `04-public-journey.yaml` é o primeiro em que aparecem duas tabelas que só existem por causa da camada pública: a jornada e o mapa que leva até ela.

O `03-team-workflow.yaml` corrige uma defasagem: `project_widget_settings` já existe no banco e não estava em modelagem nenhuma, então ele aparece ali como herdado.

O `08-team-work.yaml` é o primeiro que muda o sentido de uma coluna sem mudar a forma dela: `account_id` de `users` passa a ser a conta própria da pessoa, e não mais a única conta que ela enxerga. A nota da coluna começa com "sentido novo —", do mesmo jeito que coluna acrescentada começa com "coluna nova —".

O `06-reporter-identity.yaml` corrige outra, do mesmo tipo: cinco colunas existiam no banco sem estar em desenho nenhum — `avatar_url` e `last_login_at` em `users`, `last_used_at` em `project_keys`, e o `public_id` de `project_initial_states` e de `report_contexts`. Aparecem ali como herdadas, e os arquivos anteriores continuam como estavam.

O `09-report-types.yaml` é o primeiro em que algo sai do banco: a tabela `project_initial_states` sai, porque a coluna de entrada passou a ser um campo do tipo, e saem três colunas — `type` de `reports`, `placeholder` e `default_report_type` de `project_widget_settings`. O que saiu não aparece no desenho, e a descrição do arquivo diz o que saiu e por quê; o `08-team-work.yaml` continua mostrando tudo como era.

O `12-blocked-origins.yaml` é o primeiro em que uma marca da tela não vira coluna: "origem bloqueada" sai de comparar `reports.origin` com a lista de bloqueados de agora, e o que o banco guarda é só a decisão de manter (`blocked_origin_kept_at`). A outra decisão, apagar de vez, é exclusão real e não deixa linha — os eventos ficam, sem o relato.

O `13-report-limits.yaml` é o primeiro em que uma tabela muda de sentido sem mudar de forma: `project_origins` deixa de ser "quem pode abrir" e passa a ser "o que entra direto no Trabalho" — fora dela, o relato fica retido em vez de recusado. A descrição da tabela começa com "Sentido novo —". E é o primeiro em que uma configuração guarda números de uma contagem que o banco nunca vê: as janelas dos limites moram na memória do processo.

O `14-inherited-identity.yaml` é o primeiro em que uma tabela guarda duas coisas diferentes sem coluna de tipo: em `reporter_codes`, a linha do código pessoal e a da pessoa do sistema do cliente, separadas só por `subject_hash` preenchido ou nulo — ao contrário de `reports`, onde o relato e o card do time têm `kind`. E é o primeiro em que o banco guarda uma chave de outro sistema — só a pública, que nunca é segredo — e um sal que nunca sai na leitura.

O `15-performance.yaml` é o primeiro em que uma ligação sai sem a coluna sair: `events.account_id` e `events.project_id` continuam, com os índices da pesquisa, mas sem chave estrangeira. E é o primeiro com uma coluna que a aplicação nunca escreve: `reports.searchable_text` é gerada pelo banco.

Nomes seguem o [glossário](../../../../local/decisoes-de-projeto.md): entidade e campo em inglês, `label` e `note` em português. O nome do arquivo também é em inglês, com um número de ordem na frente — é ele que põe a lista na ordem —, e o título de dentro do arquivo é o nome curto do assunto, em português. O mesmo padrão dos [casos de uso](../use-cases/).

O formato está documentado no [README do editor](../../README.md#o-arquivo-de-modelagem).
