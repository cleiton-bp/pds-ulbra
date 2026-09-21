import type {
  ApiResponse,
  CreatedReportViewModel,
  PublicReportViewModel,
  PublishedReportsViewModel,
  ReporterCodeReportsViewModel,
} from '@/contracts'
import { environment } from '@/data/environment'
import { PanelError } from '@/data/errors'
import type { ReportService } from '@/data/reportService'

/**
 * **Nao passa pelo `httpClient`, e isso e a decisao deste arquivo.**
 *
 * O cliente do painel le `getToken()` em toda requisicao e monta o
 * `Authorization` sem perguntar (`data/api/httpClient.ts`). A ferramenta embutida
 * mora na mesma origem do painel — e portanto no mesmo `localStorage` — entao
 * usa-lo aqui mandaria o token de sessao de quem administra a conta junto de um
 * relato anonimo, para dentro de uma pagina que qualquer site embute.
 *
 * O `credentials: 'omit'` diz a mesma coisa ao navegador: esta requisicao nao
 * carrega credencial nenhuma, nem cookie que um dia apareca.
 */
/**
 * As duas rotas publicas de relato tem a mesma forma — `POST`, corpo em JSON, sem
 * credencial — e o que muda e a mensagem da falha de rede: "nao deu para enviar" e
 * "nao deu para abrir" pedem coisas diferentes de quem le.
 *
 * O **status chega inteiro** em `PanelError`, e nao virado em texto: a pagina de
 * acompanhamento precisa distinguir o 404, que e resposta definitiva, de uma falha
 * passageira que vale tentar de novo.
 */
async function post<T>(path: string, body: unknown, networkMessage: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${environment.apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify(body),
    })
  } catch {
    // Status 0: nem chegou a haver resposta, igual ao `httpClient`.
    throw new PanelError(networkMessage, 0)
  }

  const envelope = await response
    .json()
    .then((data) => data as ApiResponse<T>)
    .catch(() => null)

  if (!response.ok || envelope?.Success === false || !envelope?.Data) {
    throw new PanelError(envelope?.Message ?? `Erro ${response.status}.`, response.status)
  }

  return envelope.Data
}

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
