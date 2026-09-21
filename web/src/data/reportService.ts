import type {
  ConfirmReportRequest,
  CreatedReportViewModel,
  CreateReportRequest,
  OpenReportTrackingRequest,
  PublicReportViewModel,
  ReopenReportRequest,
  ReplyToReportRequest,
  ReporterCodeLookupRequest,
  ReporterCodeReportsViewModel,
} from '@/contracts'

/** Espelha o `ReportService` da API, do lado publico dela. */
export interface ReportService {
  /**
   * Abre um relato. E a unica operacao do painel que roda **sem sessao**: quem
   * chama e a ferramenta embutida na pagina de um cliente, e a chave publica no
   * corpo diz para qual projeto vai.
   *
   * Devolve o protocolo e o token de acompanhamento. O token vem uma vez so.
   */
  createReport(request: CreateReportRequest): Promise<CreatedReportViewModel>

  /**
   * Abre o acompanhamento de um relato, para a pagina publica. Tambem roda **sem
   * sessao**: quem chama e quem relatou, com o link na mao.
   *
   * O protocolo identifica e o token abre. Protocolo que nao existe e token
   * errado chegam aqui como o **mesmo** erro 404, de proposito — quem sonda a
   * rota nao descobre que acertou metade.
   */
  openReportTracking(request: OpenReportTrackingRequest): Promise<PublicReportViewModel>

  /**
   * Quem relatou diz que resolveu, com a nota quando o projeto a pede.
   *
   * **Devolve o relato inteiro**, e nao um "ok": a pagina redesenha a partir da
   * resposta, entao o que ela mostra depois de agir e o que ficou gravado — e nao
   * o que ela mandou.
   */
  confirmReport(request: ConfirmReportRequest): Promise<PublicReportViewModel>

  /**
   * Quem relatou diz que nao resolveu, e o relato volta para a fila.
   *
   * Nao leva nota: quem reabre esta dizendo que o trabalho nao acabou.
   */
  reopenReport(request: ReopenReportRequest): Promise<PublicReportViewModel>

  /**
   * Responde a pergunta da equipe.
   *
   * **So enquanto ha pedido aberto** — `CanReply` diz quando. Sem a pergunta do
   * outro lado, isto viraria uma caixa de entrada sem dono e sem moderacao.
   */
  replyToReport(request: ReplyToReportRequest): Promise<PublicReportViewModel>

  /**
   * Os relatos ligados a um codigo pessoal.
   *
   * **Codigo desconhecido devolve lista vazia**, e nao um erro: qualquer diferenca
   * entre "nao existe" e "existe e esta vazio" transformaria a consulta num
   * oraculo. Quem digitou errado ve o mesmo que quem acabou de receber um codigo.
   */
  listByReporterCode(request: ReporterCodeLookupRequest): Promise<ReporterCodeReportsViewModel>
}
