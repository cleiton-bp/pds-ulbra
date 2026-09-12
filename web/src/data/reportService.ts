import type { CreatedReportViewModel, CreateReportRequest } from '@/contracts'

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
}
