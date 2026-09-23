import type {
  ApiResponse,
  CreatedReportViewModel,
  PublicReportViewModel,
  PublishedReportsViewModel,
  ReporterCodeReportsViewModel,
} from '@/contracts'
import { postPublic } from '@/data/api/publicPost'
import { environment } from '@/data/environment'
import { PanelError } from '@/data/errors'
import type { ReportService } from '@/data/reportService'

/**
 * As rotas publicas de relato passam por `postPublic`, que nao carrega credencial
 * nenhuma — ver o motivo la. Aqui fica so o que muda de uma rota para outra.
 */
const post = postPublic

export const apiReportService: ReportService = {
  createReport: (request) =>
    post<CreatedReportViewModel>('/public/reports', request, 'Falha de rede ao enviar o relato.'),

  openReportTracking: (request) =>
    post<PublicReportViewModel>(
      '/public/reports/tracking',
      request,
      'Falha de rede ao abrir o relato.',
    ),

  // As mensagens de rede falam da **acao**, e nao da rota: quem nao conseguiu
  // confirmar precisa saber que a resposta dele nao chegou, e nao que "houve um
  // erro" — a diferenca e entre tentar de novo e ir embora achando que respondeu.
  confirmReport: (request) =>
    post<PublicReportViewModel>(
      '/public/reports/confirm',
      request,
      'Falha de rede ao enviar a sua resposta.',
    ),

  reopenReport: (request) =>
    post<PublicReportViewModel>(
      '/public/reports/reopen',
      request,
      'Falha de rede ao reabrir o relato.',
    ),

  replyToReport: (request) =>
    post<PublicReportViewModel>(
      '/public/reports/reply',
      request,
      'Falha de rede ao enviar a sua resposta.',
    ),

  // **`GET`, e as outras sao `POST`.** Ali o corpo carrega um segredo; aqui nao ha
  // segredo nenhum, e a chave publica ja esta no codigo-fonte da pagina.
  listPublished: async (request) => {
    let response: Response
    const url = `${environment.apiUrl}/public/reports/published?key=${encodeURIComponent(request.Key)}`

    try {
      response = await fetch(url, { method: 'GET', credentials: 'omit' })
    } catch {
      throw new PanelError('Falha de rede ao buscar o que já foi relatado.', 0)
    }

    const envelope = await response
      .json()
      .then((data) => data as ApiResponse<PublishedReportsViewModel>)
      .catch(() => null)

    if (!response.ok || envelope?.Success === false || !envelope?.Data) {
      throw new PanelError(envelope?.Message ?? `Erro ${response.status}.`, response.status)
    }

    return envelope.Data
  },

  listByReporterCode: (request) =>
    post<ReporterCodeReportsViewModel>(
      '/public/reports/by-code',
      request,
      'Falha de rede ao buscar os seus relatos.',
    ),

  openByReporterCode: (request) =>
    post<PublicReportViewModel>(
      '/public/reports/by-code/open',
      request,
      'Falha de rede ao abrir o relato.',
    ),
}
