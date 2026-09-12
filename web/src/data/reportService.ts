import type {
  CreatedReportViewModel,
  CreateReportRequest,
  OpenReportTrackingRequest,
  PublicReportViewModel,
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
}
