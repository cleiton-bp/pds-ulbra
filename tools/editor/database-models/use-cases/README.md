# Casos de uso

Os diagramas de casos de uso do PDS: quem usa o sistema e o que cada ator pode fazer. Cada `.yaml` é um diagrama — atores, casos de uso com a especificação de cada um, as ligações entre eles e as notas de explicação.

Editados pelo ambiente **Casos de uso** do [editor](../../) (`npm run dev`) ou direto no editor de texto — os dois escrevem no mesmo arquivo. O editor recarrega sozinho quando o arquivo muda por fora e, se houver edição na tela ainda não gravada, pergunta em vez de sobrescrever.

## Como ler

Comece pelo `01-overview`. Ele é o mapa: mostra todos os atores e o que cada um faz, sem detalhe. Cada caso de uso dali diz, na descrição, em qual arquivo ele está aberto em detalhe.

Os arquivos de `02` a `12` são o detalhe, um assunto por arquivo. Neles cada caso de uso tem a especificação — pré-condições, fluxo principal, fluxos alternativos e pós-condições —, que aparece no painel da direita ao clicar na elipse.

Os diagramas mapeiam o sistema inteiro, e não só o que já funciona. O que ainda não foi construído diz isso no começo da descrição:

| Marca | O que quer dizer |
|---|---|
| *(sem marca)* | já funciona |
| **Planejado** | vai ser construído |
| **Adiado** | começou a ser construído e ficou para depois, por decisão |
| **Continuidade** | o que o produto pode vir a ter, fora do escopo atual; está mapeado para não se perder |

No que ainda não foi construído, a especificação diz só o que está decidido. Onde ainda há só proposta, uma nota diz **a decidir**, em vez de inventar a regra.

| Arquivo | Cobre |
|---|---|
| `01-overview.yaml` | a visão geral: os cinco atores e os dezoito casos de uso principais |
| `02-project-setup.yaml` | o dono põe o projeto no ar — entrar com Google, criar o projeto, as chaves, instalar a ferramenta no site, os domínios, a aparência, arquivar |
| `03-project-rules.yaml` | o dono define as regras — estados internos, etapas públicas e o mapa entre eles, o ciclo, a identidade e a mídia; por quanto tempo a mídia fica é adiado |
| `04-reporting.yaml` | o relator na ferramenta — abrir relato, anexar imagens e arquivos, capturar uma área da página e marcar a imagem, informar o nome, ver e reencontrar os próprios relatos; relatar já identificado pelo site é adiado |
| `05-team-work.yaml` | o time no painel — ler, comentar, pedir informação, mover, encerrar — e o que o sistema faz sozinho em volta disso; apagar a mídia vencida é adiado |
| `06-tracking.yaml` | o relator na página de acompanhamento — acompanhar, responder ao time e reabrir, anexando nos dois, confirmar com nota |
| `07-moderation.yaml` | o que vira público — moderar, apontar dado sensível, tirar do público, a lista pública; a lista com imagens é adiada |
| `08-customization.yaml` | **Planejado.** Tipos de relato e o que cada um pergunta, textos com variáveis, capturas automáticas e como a ferramenta abre no site |
| `09-research.yaml` | **Planejado.** As métricas do projeto e a resposta à pergunta de pesquisa |
| `10-communication.yaml` | **Planejado.** Os avisos por e-mail — etapa que mudou, pedido de informação, código perdido — e o contato que os torna possíveis |
| `11-account.yaml` | Convidar para o projeto, como administrador ou membro, aceitar pelo link do e-mail e cuidar do time; e, **Planejado**, excluir a conta com prazo de arrependimento e apagar os dados |
| `12-continuity.yaml` | **Continuidade.** Ferramenta do time, áudio e voz, planos, armazenamento do cliente, voto e estimativa — e, já marcados **Planejado**, o quadro arrastável, as sprints, os relatórios e os duplicados |
| `example.yaml` | ponto de partida para conhecer o editor: os quatro tipos de ligação e a especificação completa de um caso de uso |

## Os atores

| Ator | Quem é | Onde aparece |
|---|---|---|
| **Relator** | quem encontrou o problema e relatou; não tem conta, volta pelo link | 01, 04, 06, 08, 10, 12 |
| **Visitante do site** | qualquer pessoa na página do cliente; o relator é um tipo de visitante | 01, 07, 08, 12 |
| **Membro do time** | trabalha os relatos pelo painel, com a conta Google | 01, 05, 07, 11, 12 |
| **Dono do projeto** | põe o projeto no ar e decide como ele se comporta; é administrador de todos os projetos da conta | 01, 02, 03, 08 a 12 |
| **Administrador do projeto** | configura um projeto e decide quem entra nele; pode haver mais de um | 11 |
| **Pesquisador** | quem estuda o efeito da ferramenta; lê os dados de todos os projetos, sem identificação | 01, 09 |
| **Google** «sistema» | confirma quem entra no painel | 02, 11 |
| **Armazenamento de arquivos** «sistema» | guarda imagens e arquivos (e os vídeos antigos), privado, servidos só por link assinado | 04, 05, 06 |
| **Agendador** «sistema» | a fila que segura a espera e os prazos, e age quando a hora chega | 05, 10 |
| **Sistema do cliente** «sistema» | o servidor do site do cliente, que assina a identidade herdada | 04 |
| **Serviço de e-mail** «sistema» | entrega os avisos | 10 |
| **Ferramenta do time** «sistema» | Jira, Trello ou outra, para quem não quer sair dela | 12 |
| **Armazenamento do cliente** «sistema» | o armazenamento de arquivos do próprio cliente | 12 |

O papel no projeto já existe: o administrador configura e decide quem entra, o membro trabalha nos relatos e não vê a **Configuração**, e o dono da conta é administrador de todos os projetos dela. A mesma pessoa pode estar em projetos de várias contas. O convite — a porta para alguém entrar num projeto — está em `11-account`: o administrador convida por e-mail, e a pessoa aceita entrando com o Google do mesmo endereço. Os diagramas mais antigos ainda chamam de **Dono do projeto** quem configura; o **Administrador do projeto** faz o mesmo, e o dono é um caso dele.

## O que não vira caso de uso

Nem tudo o que está planejado é ação de alguém. A robustez — limite de envio por visitante, bloqueio no navegador de onde a ferramenta pode abrir, carregador com versão imutável — e as regras que valem para tudo, como o isolamento entre contas, estão nas notas dos diagramas e no planejamento, e não numa elipse.

## Convenções

O nome do arquivo segue o [glossário](../../../../local/decisoes-de-projeto.md), em inglês, com o número na frente para a lista sair na ordem de leitura. O conteúdo — nome de ator, de caso de uso, especificação e notas — é em português.

O código do caso de uso (`UC01`) é o que as ligações citam, e vale dentro do arquivo: o `UC01` do `04-reporting` não é o `UC01` do `05-team-work`. Para citar um caso de uso de outro arquivo, escreve-se o nome do arquivo junto — "detalhe em 04-reporting".

O formato está documentado no [README do editor](../../README.md#o-arquivo-de-casos-de-uso).
