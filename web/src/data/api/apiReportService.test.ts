// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **O token nao pode viajar na URL.** Trocar este `POST` por um `GET` com
 * `?token=` funcionaria igual na tela e poria o segredo no log de acesso do
 * servidor e no historico do navegador. A asserticao e sobre o endereco chamado
 * **nao** conter o token.
 *
 * **E o status tem de chegar inteiro em quem chama.** A pagina decide entre
 * "recusado" e "falhou" pelo 404, e um cliente que transformasse todo erro em
 * mensagem de texto apagaria essa diferenca — a pessoa com a rede fora passaria a
 * ler "este link nao abre nada".
 */

const chamadas: Array<{ url: string; init: RequestInit }> = []

function fingirRede(status: number, corpo: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      chamadas.push({ url, init })

      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(corpo),
      })
    }),
  )
}

const relato = {
  TrackingCode: '7K2M-9QXP-4TRV',
  Type: 'Bug',
  Text: 'texto',
  CreatedAt: '2026-09-12T13:24:00.000Z',
}

afterEach(() => {
  chamadas.length = 0
  vi.unstubAllGlobals()
})

describe('a consulta publica de acompanhamento', () => {
  it('manda protocolo e token no corpo, e nada disso no endereco', async () => {
    fingirRede(200, { Success: true, Data: relato })
    const { apiReportService } = await import('@/data/api/apiReportService')

    await apiReportService.openReportTracking({
      TrackingCode: '7K2M-9QXP-4TRV',
      Token: 'tok-secreto',
    })

    const chamada = chamadas[0]
    expect(chamada?.url).toContain('/public/reports/tracking')
    expect(chamada?.init.method).toBe('POST')
    // A asserticao que importa.
    expect(chamada?.url).not.toContain('tok-secreto')
    expect(chamada?.init.body).toBe(
      JSON.stringify({ TrackingCode: '7K2M-9QXP-4TRV', Token: 'tok-secreto' }),
    )
  })

  it('nao manda credencial nenhuma junto', async () => {
    fingirRede(200, { Success: true, Data: relato })
    const { apiReportService } = await import('@/data/api/apiReportService')

    await apiReportService.openReportTracking({ TrackingCode: '7K2M', Token: 'tok' })

    // O quadro e a pagina moram na mesma origem do painel, e portanto no mesmo
    // `localStorage`: o `omit` e o que impede cookie de sessao de sair numa
    // chamada anonima.
    expect(chamadas[0]?.init.credentials).toBe('omit')
  })

  it('devolve o 404 como status, e nao como texto', async () => {
    fingirRede(404, { Success: false, Message: 'Este link nao abre nenhum relato.' })
    const { apiReportService } = await import('@/data/api/apiReportService')
    const { isPanelError } = await import('@/data/errors')

    const falha = await apiReportService
      .openReportTracking({ TrackingCode: '7K2M', Token: 'errado' })
      .catch((erro: unknown) => erro)

    expect(isPanelError(falha) && falha.status).toBe(404)
  })
})
