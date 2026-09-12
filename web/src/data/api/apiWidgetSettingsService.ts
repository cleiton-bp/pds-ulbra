import type { ApiResponse, WidgetSettingsViewModel } from '@/contracts'
import { environment } from '@/data/environment'
import { PanelError } from '@/data/errors'
import type { WidgetSettingsService } from '@/data/widgetSettingsService'

/**
 * Pelo mesmo motivo de `apiReportService`: **nao passa pelo `httpClient`**.
 *
 * Ele monta o `Authorization` a partir do `localStorage` em toda requisicao, e a
 * ferramenta mora na mesma origem do painel. Usa-lo aqui mandaria o token de quem
 * administra a conta numa chamada feita de dentro de uma pagina que qualquer site
 * do mundo embute.
 *
 * A chave vai na URL, e nao no corpo como no relato, porque aqui e um `GET`: a
 * chamada sai do nosso documento para a nossa API e essa URL nao aparece na
 * pagina de ninguem. E deixa a porta aberta para cache no dia em que o volume
 * pedir — coisa que um `POST` fecharia.
 */
export const apiWidgetSettingsService: WidgetSettingsService = {
  loadWidgetSettings: async (key) => {
    const response = await fetch(
      `${environment.apiUrl}/public/widget-settings?key=${encodeURIComponent(key)}`,
      { credentials: 'omit' },
    ).catch(() => {
      // Status 0: nem chegou a haver resposta, igual ao `httpClient`.
      throw new PanelError('Falha de rede ao ler a configuracao.', 0)
    })

    // Chave que nao vale: o projeto nao existe para quem perguntou, e quem chama
    // trata isso desenhando nada — diferente de uma falha, que cai nos padroes.
    if (response.status === 401) return null

    const envelope = await response
      .json()
      .then((data) => data as ApiResponse<WidgetSettingsViewModel>)
      .catch(() => null)

    if (!response.ok || envelope?.Success === false || !envelope?.Data) {
      throw new PanelError(envelope?.Message ?? `Erro ${response.status}.`, response.status)
    }

    return envelope.Data
  },
}
