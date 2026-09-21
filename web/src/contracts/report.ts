/** Espelho de `Pds.Domain/Dtos/ReportDto.cs` e `ViewModels/ReportViewModels.cs`. */

import type { SatisfactionStyle } from '@/contracts/cycleSettings'
import type { PublicOutcome } from '@/contracts/projectPublicStage'

/**
 * O que a pessoa esta relatando.
 *
 * Os valores sao os nomes do `ReportTypeEnum` em C#, e nao rotulos: a API
 * serializa enum como texto em PascalCase (`Pds.Shared/Json/PdsJsonOptions.cs`).
 * O que aparece na tela e outra coisa, e mora junto do formulario.
 */
export type ReportType = 'Bug' | 'Improvement' | 'Question'

/**
 * Um relato saindo da ferramenta embutida no site do cliente.
 *
 * Nao ha sessao nesta requisicao: quem diz de qual projeto o relato e, e so, a
 * `Key`. Ela nao autentica ninguem — apenas enderece o relato.
 */
export interface CreateReportRequest {
  /** Chave publica do projeto, a mesma que esta no `data-key` do script. */
  Key: string
  Type: ReportType
  Text: string
  /**
   * Caminho da pagina de onde o relato foi aberto. A API descarta o que vier
   * depois do `?` ou do `#` antes de gravar, mas quem envia ja manda so o
   * caminho: dado que nao sai da maquina nao precisa de confianca no servidor.
   */
  Route: string | null
  /**
   * Dominio da pagina que embutiu a ferramenta, declarado por ela mesma. A API
   * guarda como veio e **nunca** trata como prova de origem.
   */
  Origin: string | null
  /**
   * Quem escreve aceita responder duvidas da equipe sobre este relato.
   *
   * **E escolha dela, e nao do projeto.** Quem relatou um defeito as pressas pode
   * nao querer virar parte da investigacao, e prometer resposta a quem nao vai
   * responder deixa o relato pendurado esperando. O projeto so escolhe como a
   * caixa vem marcada.
   */
  AcceptsQuestions: boolean
  /** O que veio junto sem ninguem digitar: navegador, tamanho da tela. */
  Context: Record<string, string> | null
  /**
   * O codigo pessoal de quem ja relatou antes neste projeto.
   *
   * **Ausente quando este navegador nunca relatou aqui** — e ai a resposta traz um
   * codigo novo. Codigo desconhecido nao e recusado: vira um novo, porque a
   * diferenca entre conhecido e desconhecido e como se enumera codigo alheio.
   *
   * Em projeto que nao usa este modo, mandar um codigo e recusado.
   */
  ReporterCode?: string

  /** Como a pessoa quer ser chamada. Só vai quando o projeto pergunta. */
  ReporterName?: string
  /**
   * Ela quis assinar este relato.
   *
   * **Ausente é "não".** Ao contrário de `AcceptsQuestions`, aqui o silêncio não
   * cai num padrão do projeto: o que está em jogo é o nome dela ao lado de um
   * texto que qualquer um lê.
   */
  ReporterNameIsPublic?: boolean
}

/**
 * O relato recem-criado, como a ferramenta o mostra a quem acabou de escrever.
 * Sai daqui o minimo: nem identificador de projeto, nem de conta.
 */
export interface CreatedReportViewModel {
  /** O protocolo, para anotar e repetir. */
  TrackingCode: string
  /**
   * O que abre o acompanhamento. Vem **uma unica vez**: o banco fica so com o
   * hash, e nenhuma rota consegue revela-lo de novo.
   */
  AccessToken: string
  CreatedAt: string
  /**
   * O codigo pessoal de quem escreveu, quando o projeto usa esse modo; **nulo**
   * nos outros.
   *
   * **Vem em toda confirmacao, e nao so na primeira.** A ferramenta guarda no
   * navegador e manda de volta no relato seguinte — e se o navegador foi limpo,
   * ou se o codigo mandado nao existia mais, o que chega aqui e um novo.
   * Devolver sempre e o que faz a tela mostrar o codigo que **de fato** vale.
   */
  ReporterCode: string | null
}

/** Limite da coluna `text`, declarado em `Report.MaxTextLength`. */
export const MAX_REPORT_TEXT_LENGTH = 5000

/**
 * Quanto cabe no nome de quem relata. Espelho de `Report.MaxReporterNameLength`.
 *
 * Curto de proposito: e um nome, e nao um espaco livre. Sem teto, o campo vira
 * um segundo relato — e num projeto publico identificado ele sai ao lado do
 * texto, onde caberia qualquer coisa que a moderacao teria de ler duas vezes.
 */
export const MAX_REPORTER_NAME_LENGTH = 80

/**
 * Um relato na lista do painel.
 *
 * O `Text` vem inteiro, e nao cortado: quem corta para caber na linha e a tela.
 * Se a API cortasse, ler o resto exigiria uma rota que ainda nao existe.
 */
export interface ReportSummaryViewModel {
  PublicId: string
  /** O protocolo, o mesmo que a pessoa que relatou anotou. */
  TrackingCode: string
  Type: ReportType
  Text: string
  /** So o caminho da pagina: a API descarta query e fragmento antes de gravar. */
  Route: string | null
  /** Dominio informado pela pagina hospedeira. Indicio, nunca prova de origem. */
  Origin: string | null
  /** Onde o relato esta na fila; **nulo** quando o projeto nao tinha coluna ativa quando ele chegou. */
  StatePublicId: string | null
  /** O nome da coluna **agora**: renomear a coluna muda o que a lista mostra. */
  StateName: string | null
  /**
   * O passo da jornada em que quem relatou ve este relato, ou nulo quando ele nao
   * aparece em nenhum.
   *
   * **Viaja na lista sem ser desenhado nela**, de proposito: a lista responde "o
   * que ainda nao tratei", e uma segunda etiqueta em toda linha disputaria essa
   * leitura. Quem le e a tela do relato aberto — inclusive na resposta do proprio
   * movimento, que e como ela sabe o que aquele movimento causou la fora sem buscar
   * o detalhe de novo. Buscar de novo **grava um evento de leitura**, e isso
   * mediria cliques do time em vez de leituras.
   */
  PublicStageLabel: string | null
  /**
   * Quem relatou aceita responder duvidas da equipe.
   *
   * **Sao tres estados, e nao dois.** `true` e o sim, `false` e o nao, e **`null`**
   * e o relato que entrou antes de a pergunta existir — a quem ninguem perguntou
   * nada. Mostrar o nulo como "nao aceita" poria na boca da pessoa uma resposta que
   * ela nunca deu.
   *
   * O efeito de `false` e de `null` e o mesmo: sem um sim, nao se abre pedido de
   * informacao. O que muda e o que a tela diz.
   */
  AcceptsQuestions: boolean | null
  /**
   * Quando o ultimo movimento passa a valer para quem relatou, ou **nulo** quando
   * nao ha espera pendente.
   *
   * **Preenchido, a janela de desfazer esta aberta**: o time moveu e o lado de fora
   * ainda nao sabe. Mostrar isto e o que torna a janela util — sem a data na tela,
   * quem moveu por engano nao tem como saber que ainda da tempo.
   *
   * Desfazer e mover de volta. Nao ha acao propria, e nem precisa: o agendamento e
   * reescrito a cada movimento.
   */
  PublicStageDueAt: string | null
  CreatedAt: string
}

/** Um par do contexto que veio junto com o relato, sem ninguem digitar. */
export interface ReportContextViewModel {
  /** Nome do dado, em ingles e snake_case: `user_agent`, `viewport_width`. */
  Key: string
  Value: string | null
}

/**
 * O fim do relato, como **o time** o le.
 *
 * E o irmao interno de `PublicClosureViewModel`, e nao o mesmo tipo: a diferenca
 * e uma linha — o nome de quem encerrou — e e justamente ela que nao pode vazar.
 */
export interface ReportClosureViewModel {
  Outcome: PublicOutcome
  Reason: string
  ClosedAt: string
  /** Nulo quando foi o **sistema** que encerrou, ou quando a conta do autor foi esvaziada. */
  ClosedByName: string | null
  /**
   * Quando quem relatou confirmou que resolveu.
   *
   * E a metade da metafora que faltava do lado de dentro: ate aqui o painel so
   * sabia o que o time tinha decidido.
   */
  ConfirmedAt: string | null
  Satisfaction: number | null
  /** Separado da nota nula: recusar opinar nao e ausencia de opiniao. */
  SatisfactionDeclined: boolean
}

/**
 * Um relato aberto. O contexto so vem aqui porque e a resposta a uma pergunta que
 * so nasce depois de ler o relato — "em que navegador isso aconteceu?".
 */
/**
 * O pedido de informacao aberto, como **o time** o le.
 */
export interface ReportInfoRequestViewModel {
  /** Quem perguntou. Nulo so quando a conta do autor foi esvaziada. */
  AskedByName: string | null
  AskedAt: string
  /** A partir de quando a pagina publica avisa que vai encerrar. */
  WarnAt: string
  /** Quando encerra como "sem retorno", se ninguem responder. */
  CloseAt: string
}

/** O que falta, escrito para quem relatou. Vira um comentario publico. */
export interface AskInfoRequest {
  Body: string
}

export interface ReportDetailViewModel extends ReportSummaryViewModel {
  /**
   * O fim do relato, ou **nulo** enquanto ele nao acabou.
   *
   * **Vem no detalhe e nao no resumo**, e a diferenca e de custo: a lista carrega
   * dezenas de relatos por pagina e nem mostra isto. Quem precisa e a tela do
   * relato aberto — para mostrar o que foi decidido, e para nao oferecer encerrar
   * o que ja acabou.
   */
  Closure: ReportClosureViewModel | null
  /** O pedido de informacao aberto, ou nulo quando nao ha. */
  InfoRequest: ReportInfoRequestViewModel | null
  /**
   * Da para devolver este relato pedindo informacao, **agora**.
   *
   * **E a conclusao, e nao a configuracao.** Falso pode ser o recurso desligado, o
   * relato ja encerrado, o pedido ja aberto, ou — o caso que importa — quem
   * escreveu nao ter aceitado responder duvidas. A tela diz qual e, lendo o que ja
   * tem em maos.
   */
  CanAskInfo: boolean
  /**
   * Se este relato ja pode ser lido por quem nao o escreveu.
   *
   * **Viaja no detalhe porque e aqui que o time le o relato.** A decisao se toma
   * na fila de moderacao, mas quem abre um relato para responder precisa saber se
   * esta falando em publico — e descobrir isso depois de escrever e descobrir
   * tarde.
   *
   * Liberado **nao quer dizer visivel**: o projeto tambem precisa estar num nivel
   * publico. Sao duas condicoes, e esta e so uma delas.
   */
  ModerationState: ReportModerationState
  /** Em ordem de chave, decidida pela API. */
  Contexts: ReportContextViewModel[]
}

/**
 * O encerramento pedido por um botao, e nao por um movimento.
 *
 * Existe mesmo nos projetos que encerram pela ultima coluna: a configuracao diz
 * por qual gesto o painel **oferece** encerrar, e nao tira do time o direito de
 * encerrar um relato que ja esta parado la desde antes de a regra existir.
 */
export interface CloseReportRequest {
  Outcome: PublicOutcome
  Reason: string
}

/**
 * A consulta do acompanhamento, feita pela pagina publica.
 *
 * Os dois campos vao juntos, e a recusa da API e a mesma para qualquer um dos
 * dois errado: quem sonda a rota nao descobre se um protocolo existe.
 */
export interface OpenReportTrackingRequest {
  TrackingCode: string
  /** O que veio no link, e o unico dos dois que abre alguma coisa. */
  Token: string
}

/**
 * O relato como quem o escreveu o ve.
 *
 * **Nao estende `ReportSummaryViewModel`**, e a diferenca e o ponto: este e o
 * unico contrato que chega a alguem fora do time do cliente, e por heranca o
 * campo que a etapa 3 acrescentar ao painel — comentario, responsavel — passaria
 * a sair aqui sem ninguem decidir isso.
 *
 * Nao ha campo de situacao porque nao ha situacao: estado interno e a etapa 3.
 */
/**
 * Um passo da jornada, como quem relatou o le.
 *
 * **Tudo aqui foi escrito para quem esta de fora.** Nao ha identificador, nao ha
 * posicao e nao ha nenhuma das marcas de configuracao — terminal, permite retorno,
 * aguarda o relator —, porque nenhuma delas significa alguma coisa para quem so
 * quer saber do proprio problema.
 */
export interface PublicStageViewModel {
  Label: string
  Description: string
  NextStep: string | null
  /**
   * Quando o relato chegou a este passo, ou **nulo** se nunca chegou.
   *
   * Vem dos **eventos**, e nao da posicao: um relato pode pular etapas, e marcar
   * como percorrido tudo que esta antes contaria uma historia que nao aconteceu.
   */
  ReachedAt: string | null
  IsCurrent: boolean
}

/**
 * O fim do relato, como quem o escreveu o le.
 *
 * **Tres campos, e nenhum diz quem encerrou.** O nome de quem mexeu e pergunta
 * interna; quem esta de fora quer saber o que aconteceu com o problema dele.
 */
export interface PublicClosureViewModel {
  Outcome: PublicOutcome
  /** Por que acabou, como o time escreveu. **Nunca vazio**: a API recusa antes. */
  Reason: string
  ClosedAt: string
  /** Quando quem relatou confirmou que resolveu, ou nulo enquanto nao respondeu. */
  ConfirmedAt: string | null
  /**
   * A nota de 1 a 5, ou nula.
   *
   * **Nula nao quer dizer insatisfacao**: pode ser que nao tenha respondido, e
   * pode ser que tenha recusado — e a recusa esta no campo ao lado, fora da escala
   * de proposito.
   */
  Satisfaction: number | null
  SatisfactionDeclined: boolean
  Actions: PublicClosureActionsViewModel
}

/**
 * O que quem relatou pode fazer neste relato encerrado.
 *
 * **Nao e a configuracao do projeto.** Cada campo ja e o cruzamento da regra com o
 * estado deste relato — "permite reabrir" ligado num relato ja confirmado chega
 * aqui como `CanReopen` falso, e a pagina nao precisa saber por que. Mandar as
 * regras cruas entregaria a quem esta de fora como o cliente organiza o trabalho.
 *
 * **A pagina nao e a trava**: tudo isto e conferido de novo quando a acao chega.
 * Esconder o botao evita o clique inutil, e nao o pedido malicioso.
 */
export interface PublicClosureActionsViewModel {
  CanConfirm: boolean
  /** Falso quando o projeto nao permite, e falso depois de confirmar. */
  CanReopen: boolean
  AsksSatisfaction: boolean
  SatisfactionStyle: SatisfactionStyle
  /** Mesmo exigindo, "prefiro nao responder" continua existindo — fora da escala. */
  SatisfactionRequired: boolean
  ReopenRequiresComment: boolean
}

/**
 * A resposta de quem relatou: resolveu.
 *
 * Carrega as mesmas duas credenciais da consulta, e pelo mesmo motivo: nao ha
 * sessao aqui, e o token do link e a unica prova de que o relato e de quem o
 * apresenta.
 */
export interface ConfirmReportRequest {
  TrackingCode: string
  Token: string
  /** A nota de 1 a 5, ou nula quando nao houve resposta. */
  Satisfaction: number | null
  /** **Nao e a nota zero, e nao e a sexta estrela.** Fica fora da escala. */
  SatisfactionDeclined: boolean
}

/**
 * A resposta de quem relatou: nao resolveu.
 *
 * **Nao leva nota**, e isso e decisao: quem reabre esta dizendo que o trabalho nao
 * acabou, e avaliar servico inacabado mede outra coisa.
 */
export interface ReopenReportRequest {
  TrackingCode: string
  Token: string
  /** Por que esta voltando. Obrigatorio quando o projeto pede. */
  Comment: string | null
}

/** Limite do comentario de reabertura, em `ReportClosure.MaxReopenCommentLength`. */
export const MAX_REOPEN_COMMENT_LENGTH = 1000

/** A escala da nota, declarada em `ReportClosure.MinSatisfaction`/`MaxSatisfaction`. */
export const SATISFACTION_SCALE = [1, 2, 3, 4, 5] as const

/**
 * Uma fala da conversa, como quem relatou a le.
 *
 * **Uma lista so, com os dois lados.** Separar a resposta dela em outra lista
 * obrigaria a tela a costurar duas em ordem — e a ordem e o que faz um dialogo ser
 * lido como dialogo.
 *
 * **Nao ha nome de ninguem.** Para quem esta de fora, o que importa e se a fala e
 * dela ou da equipe.
 */
export interface PublicMessageViewModel {
  PublicId: string
  /** A fala e de quem relatou. Falso e a equipe. */
  FromReporter: boolean
  Body: string
  CreatedAt: string
}

/**
 * O pedido de informacao aberto, como quem relatou o le.
 *
 * **A tela precisa deixar claro de quem e a vez.** Um relato parado esperando a
 * pessoa e indistinguivel, sem isto, de um relato parado esperando a equipe — e
 * quem acha que a bola esta com o outro lado nao responde.
 */
export interface PublicInfoRequestViewModel {
  AskedAt: string
  /** Quando encerra como "sem retorno". **Encerrado assim continua reabrivel.** */
  CloseAt: string
  /** O primeiro prazo passou, e falta pouco. E estado de tela, e nao um envio. */
  IsWarning: boolean
}

export interface PublicReportViewModel {
  TrackingCode: string
  Type: ReportType
  Text: string
  CreatedAt: string
  /**
   * A jornada do projeto, na ordem. **Vazia** quando o projeto nao tem jornada
   * nenhuma — e a pagina diz isso em vez de prometer.
   */
  Journey: PublicStageViewModel[]
  /**
   * O fim do relato, ou **nulo** enquanto ele nao acabou.
   *
   * **E campo proprio, e nao um passo da jornada.** A jornada conta por onde o
   * relato andou; o fechamento conta o que foi decidido, e traz o texto que
   * explica. Um relato pode estar na etapa terminal sem ter sido encerrado.
   *
   * Nulo tambem no relato reaberto: a linha antiga continua guardada, mas nao e
   * mais o fim de nada.
   */
  Closure: PublicClosureViewModel | null
  /** O que a equipe escreveu e o que ela respondeu, em ordem. Vazia quando ninguem escreveu. */
  Conversation: PublicMessageViewModel[]
  /** O pedido aberto, ou **nulo** quando a bola nao esta com ela. */
  InfoRequest: PublicInfoRequestViewModel | null
  /**
   * Ela pode escrever agora.
   *
   * **So enquanto ha pedido aberto**, e isso e decisao: canal livre viraria uma
   * caixa de entrada sem dono e sem moderacao.
   */
  CanReply: boolean
}

/** A resposta de quem relatou. Leva as mesmas credenciais da consulta. */
export interface ReplyToReportRequest {
  TrackingCode: string
  Token: string
  Body: string
}

/**
 * Quantos relatos ha em cada coluna da fila.
 *
 * Vem uma linha por coluna do projeto, **inclusive as vazias** — a coluna com zero
 * precisa aparecer no filtro, senao ela some da tela no dia em que o ultimo relato
 * dela e movido.
 *
 * A linha com `StatePublicId` nulo sao os que ainda nao tem lugar na fila, e ela
 * so vem quando existe algum.
 */
export interface ReportStateCountViewModel {
  StatePublicId: string | null
  StateName: string | null
  /** Falso quando a coluna foi aposentada. Sempre verdadeiro na linha sem coluna. */
  IsActive: boolean
  /**
   * Mover um relato para esta coluna **encerra** o relato, e por isso a tela pede
   * desfecho e motivo antes de mandar.
   *
   * **Vem da API, e nao e derivado aqui.** Derivar pela ordem da lista obrigaria a
   * tela a repetir a regra de qual coluna encerra — e as duas copias divergiriam no
   * dia em que a regra virar configuracao do projeto. Pior: a lista traz as
   * aposentadas junto, e a ultima delas nao encerra nada.
   *
   * Verdadeiro em **uma** linha, no maximo.
   */
  ClosesReport: boolean
  Total: number
}

/** O valor que a rota aceita no lugar de um identificador, para pedir os sem coluna. */
export const WITHOUT_STATE_FILTER = 'none'

/**
 * Para onde o relato vai na fila — e, quando a coluna encerra, o que ele virou.
 *
 * **Os dois campos andam juntos com `ClosesReport`.** A API os exige na coluna que
 * encerra e os **recusa** fora dela: mandar um desfecho num movimento que nao
 * encerra gravaria um fim que o relato nao teve, e quem mandou continuaria achando
 * que encerrou.
 */
export interface MoveReportRequest {
  StatePublicId: string
  /** Qual dos quatro finais foi este. Ausente fora da coluna que encerra. */
  Outcome?: PublicOutcome
  /**
   * Por que acabou. E este texto que quem relatou le na pagina de acompanhamento —
   * nao ha encerramento sem ele.
   */
  Reason?: string
}

/** Limite da coluna `reason`, declarado em `ReportClosure.MaxReasonLength`. */
export const MAX_CLOSURE_REASON_LENGTH = 2000

/**
 * Um comentario que fica entre o time.
 *
 * E um tipo separado do publico, e nao o mesmo com um campo dizendo qual e qual:
 * uma lista so devolveria o interno para qualquer lugar que esquecesse de
 * filtrar, e esquecer nao da erro nenhum.
 */
export interface InternalCommentViewModel {
  PublicId: string
  AuthorName: string
  Body: string
  CreatedAt: string
}

/** Um comentario escrito para quem relatou. Ainda nao tem leitor. */
export interface PublicCommentViewModel {
  PublicId: string
  /**
   * A fala e de **quem relatou**, respondendo a equipe.
   *
   * **Campo proprio, e nao "nome vazio".** Nome nulo tambem acontece quando a conta
   * do autor interno foi esvaziada, e os dois casos sao opostos.
   */
  FromReporter: boolean
  AuthorName: string | null
  Body: string
  CreatedAt: string
}

/** Os comentarios de um relato, em **duas listas separadas**. */
export interface ReportCommentsViewModel {
  Internal: InternalCommentViewModel[]
  Public: PublicCommentViewModel[]
}

export interface CreateCommentRequest {
  Body: string
}

/** Limite dos dois textos. Separados na API de proposito, iguais hoje. */
export const MAX_COMMENT_LENGTH = 5000

/**
 * O que aconteceu, nos nomes do `EventTypeEnum` em C#.
 *
 * **Os dois ultimos sao os da jornada publica**, e eles chegam ao painel pela
 * mesma rota de historico. Ficaram de fora desta lista quando nasceram, e o
 * efeito nao foi erro nenhum: `descrever` cai no proprio valor quando nao
 * conhece o tipo, entao a linha do tempo mostrava `ReportPublicStageChanged` em
 * tela, em ingles e no meio das frases em portugues. A lista completa e o que faz
 * `Record<ReportEventType, string>` cobrar a frase de cada um.
 */
export const REPORT_EVENT_TYPES = [
  'ReportCreated',
  'ReportViewed',
  'ReportStateChanged',
  'ReportInternalCommented',
  'ReportPublicCommented',
  'ReportPublicStageChanged',
  'ReportPublicStageUnmapped',
  'ReportClosed',
  'ReportConfirmed',
  'ReportReopened',
  'ReportInfoRequested',
  'ReportReplied',
  'ReportClosureCancelled',
  'ReportPublished',
  'ReportModerationRejected',
] as const

/**
 * A lista e um **array**, e o tipo sai dele — e nao o contrario.
 *
 * Uma uniao de literais some na compilacao, e o que some nao da para conferir
 * contra o C# em teste nenhum: foi exatamente assim que dois tipos ficaram de
 * fora sem ninguem perceber. Do array, o tipo continua saindo de graca e a lista
 * continua existindo em tempo de execucao para `eventTypes.test.ts` comparar.
 */
export type ReportEventType = (typeof REPORT_EVENT_TYPES)[number]

/**
 * Uma linha do historico.
 *
 * Os nomes das colunas sao **os que valiam na epoca**, guardados no evento —
 * buscar o nome atual faria uma coluna renomeada reescrever o passado.
 */
export interface ReportHistoryEntryViewModel {
  PublicId: string
  Type: ReportEventType
  AuthorName: string | null
  FromStateName: string | null
  ToStateName: string | null
  OccurredAt: string
}

/**
 * Se o relato ja pode ser lido por quem nao o escreveu.
 *
 * Espelho do `ReportModerationStateEnum` em C#. **Todo relato nasce
 * `Pending`**, inclusive em projeto privado — e e isso que faz marcar o projeto
 * como publico depois nao publicar o historico inteiro de uma vez.
 */
export type ReportModerationState = 'Pending' | 'Approved' | 'Rejected'

/** Um relato na fila de moderacao, como o time o le antes de decidir. */
export interface ModerationItemViewModel {
  PublicId: string
  TrackingCode: string
  Type: ReportType
  /** Inteiro: quem decide publicar precisa ler o que vai publicar. */
  Text: string
  /** Aparece aqui mesmo quando a pessoa **nao** quis assinar. */
  ReporterName: string | null
  ReporterNameIsPublic: boolean
  State: ReportModerationState
  ModeratedAt: string | null
  ModeratedByName: string | null
  CreatedAt: string
}

/** A fila de moderacao de um projeto. */
export interface ModerationQueueViewModel {
  /** Do mais antigo para o mais novo: fila lida ao contrario nunca esvazia o comeco. */
  Items: ModerationItemViewModel[]
  /** Quantos esperam decisao, **independente do recorte pedido**. */
  PendingTotal: number
}

/** A decisao que o painel manda. `Pending` nao e aceito. */
export interface ModerateReportRequest {
  Decision: Exclude<ReportModerationState, 'Pending'>
}

/**
 * Um relato ja liberado, como qualquer pessoa o le.
 *
 * **Nao ha protocolo nem identificador aqui.** O protocolo e curto, falado em
 * voz alta, e e metade da credencial de quem relatou.
 */
export interface PublishedReportViewModel {
  Type: ReportType
  Text: string
  StageLabel: string | null
  IsClosed: boolean
  /** So com o projeto em publico identificado **e** o relato assinado. */
  ReporterName: string | null
  PublishedAt: string
}

/** A lista publica de um projeto. Projeto privado responde vazio, e nao uma recusa. */
export interface PublishedReportsViewModel {
  Reports: PublishedReportViewModel[]
  HasMore: boolean
}

/** Um relato na lista pessoal de quem o escreveu. */
export interface ReporterCodeReportViewModel {
  TrackingCode: string
  Type: ReportType
  /** O comeco do texto, para distinguir um relato do outro sem abrir. */
  Excerpt: string
  /** Em que passo da jornada ele esta. Nulo quando o projeto nao tem jornada. */
  StageLabel: string | null
  IsClosed: boolean
  CreatedAt: string
}

/**
 * A resposta da consulta por codigo pessoal.
 *
 * **Codigo que nao existe devolve lista vazia, e nao uma recusa.** Qualquer
 * diferenca entre "nao existe" e "existe e esta vazio" transformaria a consulta
 * num oraculo, e tentar codigos ate a resposta mudar e como se enumera.
 */
export interface ReporterCodeReportsViewModel {
  Reports: ReporterCodeReportViewModel[]

  /**
   * Ha relato alem dos que vieram.
   *
   * **E um sim ou nao, e nunca um total.** A rota e publica e nao pede
   * credencial: dizer quantos entregaria a quem sonda o tamanho da lista de outra
   * pessoa. O aviso basta para quem le saber que a lista nao e tudo.
   */
  HasMore: boolean
}

/** A consulta da lista pessoal. */
export interface ReporterCodeLookupRequest {
  Key: string
  Code: string
}

/**
 * A leitura de um relato pelo codigo, em vez do link.
 *
 * O codigo prova que o relato e dela; o link e que da poder sobre ele. As acoes
 * chegam desligadas, a menos que o projeto tenha ligado `TrackingCodeCanAct`.
 */
export interface OpenByReporterCodeRequest {
  Key: string
  Code: string
  TrackingCode: string
}
