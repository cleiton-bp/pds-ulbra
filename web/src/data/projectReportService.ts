import type { ReportDetailViewModel, ReportSummaryViewModel } from '@/contracts'

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
  /** Os relatos do projeto, do mais novo para o mais antigo. A pagina comeca em 1. */
  listReports(publicId: string, page: number): Promise<ReportPage>

  /**
   * Abre um relato e traz o contexto que veio junto.
   *
   * Chama-se **abrir**, e nao "buscar", porque a chamada grava: a API registra a
   * visualizacao, e o intervalo entre ela e a criacao e o tempo que o time levou
   * para ir olhar. Por isso nao se chama isto para adiantar dado que ninguem
   * pediu — cada chamada vira uma linha que a pesquisa vai contar.
   */
  openReport(publicId: string, reportPublicId: string): Promise<ReportDetailViewModel>
}
