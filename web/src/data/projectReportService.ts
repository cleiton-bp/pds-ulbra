import type {
  AskInfoRequest,
  CloseReportRequest,
  CreateCommentRequest,
  InternalCommentViewModel,
  MoveReportRequest,
  PublicCommentViewModel,
  ReportCommentsViewModel,
  ReportDetailViewModel,
  ReportHistoryEntryViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
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

/** Espelha o `ReportService` da API, do lado que exige sessao. */
export interface ProjectReportService {
  /**
   * Os relatos do projeto, do mais novo para o mais antigo. A pagina comeca em 1.
   *
   * `state` recorta por coluna da fila: ausente traz tudo, um identificador traz
   * so aquela coluna, e `WITHOUT_STATE_FILTER` traz os que ainda nao tem lugar
   * nela. **O `total` acompanha o recorte** — filtrando, ele e o numero daquela
   * coluna, e nao o do projeto.
   */
  listReports(publicId: string, page: number, state?: string | null): Promise<ReportPage>

  /**
   * Quantos relatos ha em cada coluna.
   *
   * E chamada separada da lista de proposito: a lista traz uma pagina e a contagem
   * varre tudo. Contar as linhas que vieram daria um numero errado assim que o
   * projeto passasse de uma pagina.
   */
  listReportCounts(publicId: string): Promise<ReportStateCountViewModel[]>

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
