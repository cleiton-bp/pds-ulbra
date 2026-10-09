import type {
  ArchiveCardRequest,
  AskInfoRequest,
  CardLinkViewModel,
  CloseReportRequest,
  CreateCardLinkRequest,
  CreateCommentRequest,
  CreateTeamCardRequest,
  EditCommentRequest,
  EditTeamCardRequest,
  InternalCommentViewModel,
  ModerateReportRequest,
  ModerationItemViewModel,
  ModerationQueueViewModel,
  MoveReportRequest,
  PublicCommentViewModel,
  ReportCommentsViewModel,
  ReportDetailViewModel,
  ReportHistoryEntryViewModel,
  ReportListOrder,
  ReportModerationState,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
  SetCardAssigneeRequest,
  SetCardDueDateRequest,
  SetCardLabelsRequest,
  SetCardPointsRequest,
  SetCardPositionRequest,
  SetCardPriorityRequest,
  SetCardSprintRequest,
  SetCardTitleRequest,
} from '@/contracts'

/**
 * Uma pagina de relatos.
 *
 * `total` e quantos o projeto tem, e nao quantos vieram nesta pagina: e a
 * comparacao entre os dois que diz se ainda ha o que carregar.
 */
export interface ReportPage {
  reports: ReportSummaryViewModel[]
  total: number
}

/**
 * O que muda na lista alem do recorte.
 *
 * `order: 'board'` traz a coluna na ordem do quadro — e, na ultima coluna ativa, so
 * o que entrou nela nos dias que o projeto escolheu. `pageSize` so vem do quadro,
 * que mostra os 50 de cima de cada coluna (decisao de produto, e nao de pagina): a
 * lista continua com o tamanho que a API decide.
 *
 * `after` e o "Mostrar mais" do quadro: os que vem logo depois daquele card na
 * coluna, e nao a pagina seguinte. Um card que sai de cima, ou chega ao topo, mexe
 * nas paginas — e a seguinte pularia um card, ou repetiria. O card de referencia
 * que ja saiu da coluna da 409, e a coluna e lida de novo.
 */
/** Os tipos do filtro da tela de Trabalho: os tres de relato, e o card do time. */
export type ReportFilterType = 'bug' | 'improvement' | 'question' | 'team'

/**
 * Os filtros da tela de Trabalho — os mesmos para a lista, para cada coluna do quadro
 * e para a contagem das colunas. **Dentro de um filtro, ou; entre filtros, e**: a
 * etiqueta A ou a B, da Ana e vencido. Lista vazia e `false` sao "sem este filtro".
 */
export interface ReportFilters {
  /** Responsavel: `me`, `none` (sem responsavel) ou o identificador de alguem do time. */
  assignees: string[]
  /** Etiquetas, pelo identificador: basta o card ter uma delas. */
  labels: string[]
  /** Prioridades, pelo identificador, ou `none` (sem prioridade). */
  priorities: string[]
  types: ReportFilterType[]
  /** So os vencidos: o prazo passou e o card nao terminou. */
  overdue: boolean
  /** So o que nao terminou — o "Em aberto": sai o relato encerrado e o card na ultima coluna. */
  open: boolean
  /** Sem as subtarefas: so os cards de primeiro nivel. */
  hideSubtasks: boolean
  /** A busca: titulo, texto, descricao, numero (`42` ou `#42`) e protocolo. */
  search: string
}

/** Nenhum filtro: a tela inteira. */
export const NO_REPORT_FILTERS: ReportFilters = {
  assignees: [],
  labels: [],
  priorities: [],
  types: [],
  overdue: false,
  open: false,
  hideSubtasks: false,
  search: '',
}

/** Por qual dado a tabela da lista se ordena. */
export type ReportSortField =
  | 'number'
  | 'state'
  | 'assignee'
  | 'priority'
  | 'due'
  | 'created'
  | 'updated'

/**
 * A ordem que a pessoa escolheu na tabela — feita pela API, porque a lista vem por
 * paginas: ordenar no navegador ordenaria so o que ja chegou. O vazio (sem prazo, sem
 * prioridade) fica no fim nas duas direcoes.
 */
export interface ReportSort {
  field: ReportSortField
  dir: 'asc' | 'desc'
}

export interface ReportListOptions {
  order?: ReportListOrder
  pageSize?: number
  after?: string
  /** Os filtros da tela de Trabalho. Sem eles, ou vazios, a lista inteira. */
  filters?: ReportFilters
  /** So as subtarefas deste card. */
  parent?: string
  /**
   * O recorte das sprints: `active` (a em andamento, com as subtarefas — o quadro),
   * `backlog` (sem sprint, sem subtarefa e sem o que terminou) ou o identificador de
   * uma sprint (os cards dela, sem as subtarefas).
   */
  sprint?: string
  /**
   * As colunas do filtro da lista — o identificador ou `WITHOUT_STATE_FILTER`; basta o
   * card estar numa delas. **So da lista**: a contagem das colunas nao recebe, senao
   * cada coluna desmarcada contaria zero no proprio menu.
   */
  columns?: string[]
  /** A ordem escolhida na tabela. So na lista de sempre — nunca com `order`. */
  sort?: ReportSort
}

/** Espelha o `ReportService` da API, do lado que exige sessao. */
export interface ProjectReportService {
  /**
   * Os relatos do projeto, do mais novo para o mais antigo — ou na ordem de
   * `options.sort`, feita pela API. A pagina comeca em 1; de 50 em 50, se ninguem
   * pedir outro tamanho.
   *
   * `state` recorta por coluna da fila: ausente traz tudo, um identificador traz
   * so aquela coluna, e `WITHOUT_STATE_FILTER` traz os que ainda nao tem lugar
   * nela. **O `total` acompanha o recorte** — filtrando, ele e o numero daquela
   * coluna, e nao o do projeto.
   *
   * Vem relato e card do time. **O arquivado nao vem**: `archived` verdadeiro troca
   * a lista pelos arquivados — os dois nunca juntos.
   */
  listReports(
    publicId: string,
    page: number,
    state?: string | null,
    archived?: boolean,
    options?: ReportListOptions,
  ): Promise<ReportPage>

  /**
   * Cria um card do time. Ganha o proximo numero do projeto, e nunca tem lado de
   * fora. O responsavel e a prioridade, quando vem, gravam na propria criacao, numa
   * transacao so: recusado um, o card nao nasce. Devolve o card **aberto**, sem
   * registrar leitura.
   */
  createTeamCard(publicId: string, request: CreateTeamCardRequest): Promise<ReportDetailViewModel>

  /** Grava o titulo e a descricao de um card do time. O relato a API recusa. */
  editTeamCard(
    publicId: string,
    reportPublicId: string,
    request: EditTeamCardRequest,
  ): Promise<ReportDetailViewModel>

  /**
   * Arquiva ou desarquiva. No relato aberto, arquivar encerra junto — por isso o
   * desfecho e o motivo, que quem relatou le.
   */
  setArchived(
    publicId: string,
    reportPublicId: string,
    request: ArchiveCardRequest,
  ): Promise<ReportDetailViewModel>

  /**
   * Poe o card numa sprint (nula e o backlog), e no lugar da lista: abaixo de um card,
   * no topo ou no fim. A subtarefa vai com o pai. Devolve o card aberto.
   */
  setSprint(
    publicId: string,
    reportPublicId: string,
    request: SetCardSprintRequest,
  ): Promise<ReportDetailViewModel>

  /** A estimativa em pontos. Nunca na subtarefa. */
  setPoints(
    publicId: string,
    reportPublicId: string,
    request: SetCardPointsRequest,
  ): Promise<ReportDetailViewModel>

  /** Os vinculos do card, vistos dele, na ordem em que foram feitos. */
  listLinks(publicId: string, reportPublicId: string): Promise<CardLinkViewModel[]>

  /**
   * Vincula o card a outro do projeto. Marcar como duplicado leva o duplicado para o
   * arquivo; o relato duplicado passa a acompanhar o original. Devolve os vinculos.
   */
  link(
    publicId: string,
    reportPublicId: string,
    request: CreateCardLinkRequest,
  ): Promise<CardLinkViewModel[]>

  /** Desfaz um vinculo. O duplicado volta do arquivo. Devolve os vinculos que ficaram. */
  unlink(
    publicId: string,
    reportPublicId: string,
    linkPublicId: string,
  ): Promise<CardLinkViewModel[]>

  /**
   * O titulo do time num relato. Vazio volta ao que quem relatou escreveu — que
   * nunca se perde. O card do time a API recusa: la o titulo vai com a descricao.
   *
   * Cada campo tem a sua chamada, e cada uma devolve o card **aberto**, sem
   * registrar leitura: a tela troca o card inteiro pela resposta.
   */
  setTitle(
    publicId: string,
    reportPublicId: string,
    request: SetCardTitleRequest,
  ): Promise<ReportDetailViewModel>

  /** Quem do time fica com o card — so quem esta no time agora —, ou ninguem. */
  setAssignee(
    publicId: string,
    reportPublicId: string,
    request: SetCardAssigneeRequest,
  ): Promise<ReportDetailViewModel>

  /** A prioridade — uma ativa do projeto —, ou nenhuma. */
  setPriority(
    publicId: string,
    reportPublicId: string,
    request: SetCardPriorityRequest,
  ): Promise<ReportDetailViewModel>

  /** O conjunto inteiro de etiquetas, trocado de uma vez. */
  setLabels(
    publicId: string,
    reportPublicId: string,
    request: SetCardLabelsRequest,
  ): Promise<ReportDetailViewModel>

  /** O prazo, so a data — ou nenhum. */
  setDueDate(
    publicId: string,
    reportPublicId: string,
    request: SetCardDueDateRequest,
  ): Promise<ReportDetailViewModel>

  /**
   * A fila de moderacao do projeto, num estado so.
   *
   * **Do mais antigo para o mais novo**, ao contrario de `listReports`. E fila:
   * lida ao contrario, o primeiro que chegou espera para sempre.
   *
   * O total de pendentes vem em toda resposta, inclusive quando o recorte e
   * outro — e o numero que a lateral mostra, e ele nao pode sumir porque alguem
   * abriu a aba dos ja decididos.
   */
  listModeration(publicId: string, state: ReportModerationState): Promise<ModerationQueueViewModel>

  /**
   * Libera o relato para o publico, ou decide que ele nao vai.
   *
   * **Liberar nao publica sozinho**: o projeto tambem precisa estar num nivel
   * publico. E recusar nao apaga nem encerra — fala so da vitrine.
   */
  moderateReport(
    publicId: string,
    reportPublicId: string,
    request: ModerateReportRequest,
  ): Promise<ModerationItemViewModel>

  /**
   * Quantos relatos ha em cada coluna.
   *
   * E chamada separada da lista de proposito: a lista traz uma pagina e a contagem
   * varre tudo. Contar as linhas que vieram daria um numero errado assim que o
   * projeto passasse de uma pagina.
   *
   * Com `filters` — os mesmos da lista —, conta so o que passa neles: o numero de
   * cada coluna e o que a tela mostra.
   */
  listReportCounts(
    publicId: string,
    filters?: ReportFilters,
    /** Com a sprint ligada, o quadro conta so a sprint em andamento (`active`). */
    sprint?: string,
  ): Promise<ReportStateCountViewModel[]>

  /**
   * Abre um relato e traz o contexto que veio junto.
   *
   * Chama-se **abrir**, e nao "buscar", porque a chamada grava: a API registra a
   * visualizacao, e o intervalo entre ela e a criacao e o tempo que o time levou
   * para ir olhar. Por isso nao se chama isto para adiantar dado que ninguem
   * pediu — cada chamada vira uma linha que a pesquisa vai contar.
   */
  openReport(publicId: string, reportPublicId: string): Promise<ReportDetailViewModel>

  /**
   * Rele o card **que ja esta aberto**, quando outra pessoa mexe nele (o aviso chega
   * pelo tempo real). Nao registra leitura: ela foi contada ao abrir, e cada aviso
   * viraria uma leitura que ninguem fez.
   */
  refreshReport(publicId: string, reportPublicId: string): Promise<ReportDetailViewModel>

  /**
   * Move o relato para outra coluna.
   *
   * Devolve o relato com a coluna nova — e essa resposta que a tela usa, e nao o
   * que ela mandou: se a API decidir algo diferente, a tela mostra o que ficou
   * gravado, e nao o que ela pediu.
   */
  moveReport(
    publicId: string,
    reportPublicId: string,
    request: MoveReportRequest,
  ): Promise<ReportSummaryViewModel>

  /**
   * Muda o card de lugar na propria coluna do quadro: logo abaixo de outro card, ou
   * no topo. **Nao e evento** — arrumar a coluna nao muda o card. Trocar de coluna e
   * `moveReport`, que tambem leva o lugar.
   */
  setPosition(
    publicId: string,
    reportPublicId: string,
    request: SetCardPositionRequest,
  ): Promise<ReportSummaryViewModel>

  /**
   * Encerra o relato, com desfecho e motivo.
   *
   * **E o encerramento por botao**, e nao o que acontece ao mover: aquele viaja
   * dentro do proprio `moveReport`. Este existe nos dois gatilhos — a
   * configuracao diz por qual gesto o painel oferece encerrar, e nao tira do time
   * o direito de encerrar o relato que ja esta parado na ultima coluna.
   *
   * Devolve o relato **aberto**, e nao o resumo: quem chamou esta com o dialogo
   * na tela e precisa do fechamento para desenhar. E nao registra visualizacao.
   */
  closeReport(
    publicId: string,
    reportPublicId: string,
    request: CloseReportRequest,
  ): Promise<ReportDetailViewModel>

  /**
   * Devolve o relato pedindo informacao, em vez de encerrar.
   *
   * **"Nao reproduzi" e "nao vamos fazer" sao decisoes opostas**, e chegando iguais
   * do outro lado a pessoa entende que acabou e para de responder. Este metodo e o
   * primeiro; o outro e `closeReport`.
   *
   * Devolve o relato **aberto**: quem chamou esta com o dialogo na tela.
   */
  askInfo(
    publicId: string,
    reportPublicId: string,
    request: AskInfoRequest,
  ): Promise<ReportDetailViewModel>

  /** Os comentarios do relato, em duas listas separadas. */
  listComments(publicId: string, reportPublicId: string): Promise<ReportCommentsViewModel>

  /**
   * Escreve um comentario que fica entre o time.
   *
   * **E um metodo proprio, e nao um parametro de visibilidade.** Um parametro
   * seria o sinalizador que as duas tabelas da API existem para evitar: bastaria
   * um valor errado para o texto interno ir parar na tabela lida de fora.
   */
  addInternalComment(
    publicId: string,
    reportPublicId: string,
    request: CreateCommentRequest,
  ): Promise<InternalCommentViewModel>

  /**
   * Corrige um comentario interno. So quem o escreveu (a API recusa as outras pessoas);
   * as mencoes passam a ser as do texto novo. **So o interno**: o que foi para quem
   * relatou ja saiu da empresa.
   */
  editInternalComment(
    publicId: string,
    reportPublicId: string,
    commentPublicId: string,
    request: EditCommentRequest,
  ): Promise<InternalCommentViewModel>

  /** Apaga um comentario interno, so de quem o escreveu. Os avisos da mencao saem junto. */
  deleteInternalComment(
    publicId: string,
    reportPublicId: string,
    commentPublicId: string,
  ): Promise<void>

  /** Escreve um comentario para quem relatou. */
  addPublicComment(
    publicId: string,
    reportPublicId: string,
    request: CreateCommentRequest,
  ): Promise<PublicCommentViewModel>

  /** Tudo que aconteceu com o relato, em ordem. Nao registra visualizacao. */
  listReportHistory(
    publicId: string,
    reportPublicId: string,
  ): Promise<ReportHistoryEntryViewModel[]>
}
