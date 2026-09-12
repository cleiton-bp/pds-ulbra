// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **O 403 e a metade da conferencia de endereco que mora no navegador.** A API
 * recusa a configuracao quando a pagina declara um endereco fora da lista do
 * projeto, e e aqui que essa recusa vira "nao desenha nada". Trate-la como falha
 * — o que acontece com qualquer status nao previsto — cairia nos padroes, e o
 * quadro abriria no site errado com a aparencia de fabrica. A conferencia
 * continuaria existindo na API e nao valeria nada na tela.
 *
 * E o **endereco ausente nao viaja como vazio**: `origin=` diria "declarei nada",
 * que e o que "nao declarei" ja diz, e sujaria a chave do cache com uma variacao
 * que devolve a mesma resposta.
 */

const respostas: Array<{ status: number; corpo?: unknown }> = []
const chamadas: string[] = []

function fingirRede(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      chamadas.push(url)
      const resposta = respostas.shift() ?? { status: 200, corpo: undefined }

      return Promise.resolve({
        ok: resposta.status >= 200 && resposta.status < 300,
        status: resposta.status,
        json: () => Promise.resolve(resposta.corpo),
      })
    }),
  )
}

const envelope = { Success: true, Message: null, Data: DEFAULT_WIDGET_SETTINGS, Total: null }

afterEach(() => {
  respostas.length = 0
  chamadas.length = 0
  vi.unstubAllGlobals()
})

describe('a leitura publica da configuracao do quadro', () => {
  it('manda a chave e o endereco declarado pela pagina', async () => {
    fingirRede()
    respostas.push({ status: 200, corpo: envelope })
    const { apiWidgetSettingsService } = await import('@/data/api/apiWidgetSettingsService')

    await apiWidgetSettingsService.loadWidgetSettings('pk_DEMO', 'loja.exemplo.com')

    expect(chamadas[0]).toContain('key=pk_DEMO')
    expect(chamadas[0]).toContain('origin=loja.exemplo.com')
  })

  it('sem pagina hospedeira, o endereco nao vai na consulta', async () => {
    fingirRede()
    respostas.push({ status: 200, corpo: envelope })
    const { apiWidgetSettingsService } = await import('@/data/api/apiWidgetSettingsService')

    await apiWidgetSettingsService.loadWidgetSettings('pk_DEMO', null)

    expect(chamadas[0]).toContain('key=pk_DEMO')
    expect(chamadas[0]).not.toContain('origin')
  })

  it('endereco fora da lista devolve nulo, e nao os padroes', async () => {
    fingirRede()
    respostas.push({ status: 403, corpo: { Success: false, Message: 'Nao autorizado.' } })
    const { apiWidgetSettingsService } = await import('@/data/api/apiWidgetSettingsService')

    expect(
      await apiWidgetSettingsService.loadWidgetSettings('pk_DEMO', 'invasor.example'),
    ).toBeNull()
  })

  it('chave que nao vale devolve nulo pelo mesmo caminho', async () => {
    fingirRede()
    respostas.push({ status: 401, corpo: { Success: false, Message: 'Chave invalida.' } })
    const { apiWidgetSettingsService } = await import('@/data/api/apiWidgetSettingsService')

    expect(
      await apiWidgetSettingsService.loadWidgetSettings('pk_REVOGADA', 'loja.exemplo.com'),
    ).toBeNull()
  })

  it('falha do servidor lanca, para quem chama cair nos padroes', async () => {
    fingirRede()
    respostas.push({ status: 500, corpo: { Success: false, Message: 'Erro.' } })
    const { apiWidgetSettingsService } = await import('@/data/api/apiWidgetSettingsService')

    await expect(
      apiWidgetSettingsService.loadWidgetSettings('pk_DEMO', 'loja.exemplo.com'),
    ).rejects.toThrow()
  })
})
