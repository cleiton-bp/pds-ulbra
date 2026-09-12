import type { ApiResponse, CreatedReportViewModel } from '@/contracts'
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
export const apiReportService: ReportService = {
  createReport: async (request) => {
    let response: Response
    try {
      response = await fetch(`${environment.apiUrl}/public/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify(request),
      })
    } catch {
      // Status 0: nem chegou a haver resposta, igual ao `httpClient`.
      throw new PanelError('Falha de rede ao enviar o relato.', 0)
    }

    const envelope = await response
      .json()
      .then((data) => data as ApiResponse<CreatedReportViewModel>)
      .catch(() => null)

    if (!response.ok || envelope?.Success === false || !envelope?.Data) {
      throw new PanelError(envelope?.Message ?? `Erro ${response.status}.`, response.status)
    }

    return envelope.Data
  },
}
