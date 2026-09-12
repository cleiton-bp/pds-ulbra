// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WidgetSettingsViewModel } from '@/contracts'
import { EmbedApp } from '@/embed/EmbedApp'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * O quadro tem dois modos e a diferenca entre eles nao e estetica: dentro de uma
 * pagina ele comeca **recolhido**, porque quem visita o site do cliente nao pediu
 * um formulario no meio da tela. Aberto direto, comeca no formulario, que e como
 * ele se demonstra sem carregador.
 *
 * E o token de acompanhamento **nao aparece**: ele volta na resposta, nao ha
 * pagina de acompanhamento ainda, e mostrar um segredo que nao serve para nada e
 * a maneira mais facil de ensinar alguem a ignorar segredo.
 */
const dublê = vi.hoisted(() => ({ criar: vi.fn() }))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()
  return { ...real, reportService: { createReport: dublê.criar } }
})

const config = { key: 'pk_DEMO', route: '/checkout', origin: 'loja.exemplo.com' }
const pagina = { init: null, expand: vi.fn(), collapse: vi.fn(), stop: vi.fn() }

function comSettings(mudanca: Partial<WidgetSettingsViewModel>): WidgetSettingsViewModel {
  return { ...DEFAULT_WIDGET_SETTINGS, ...mudanca }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('o quadro dentro de uma pagina', () => {
  it('comeca recolhido, mostrando so o gatilho', () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={pagina} />)

    expect(screen.getByRole('button', { name: 'Relatar' })).toBeDefined()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('abrir o gatilho pede o tamanho maior a pagina', () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={pagina} />)
    fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))

    expect(pagina.expand).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox')).toBeDefined()
  })

  it('o rotulo do gatilho vem da configuracao', () => {
    render(
      <EmbedApp
        settings={comSettings({ LauncherLabel: 'Fale com a gente' })}
        config={config}
        host={pagina}
      />,
    )

    expect(screen.getByRole('button', { name: 'Fale com a gente' })).toBeDefined()
  })
})

describe('o quadro aberto direto, sem pagina', () => {
  it('ja nasce no formulario', () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} />)

    expect(screen.getByRole('textbox')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull()
  })
})

describe('o formulario', () => {
  it('nao envia vazio: o botao so libera com texto', () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} />)
    const enviar = screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement

    expect(enviar.disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    expect(enviar.disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'algo quebrou' } })
    expect(enviar.disabled).toBe(false)
  })

  it('esconde o seletor de tipo quando a configuracao manda, e envia o tipo padrao', async () => {
    dublê.criar.mockResolvedValue({
      TrackingCode: 'ABCD-EFGH-IJKL',
      AccessToken: 'token-secreto',
      CreatedAt: '2026-09-12T00:00:00Z',
    })

    render(
      <EmbedApp
        settings={comSettings({ ShowsTypeField: false, DefaultReportType: 'Question' })}
        config={config}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Defeito' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'como faço isso?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(dublê.criar).toHaveBeenCalledOnce())
    expect(dublê.criar.mock.calls[0]?.[0]).toMatchObject({ Type: 'Question', Route: '/checkout' })
  })

  it('mostra o protocolo e NAO mostra o token de acompanhamento', async () => {
    dublê.criar.mockResolvedValue({
      TrackingCode: 'ABCD-EFGH-IJKL',
      AccessToken: 'token-secreto-que-nao-pode-vazar',
      CreatedAt: '2026-09-12T00:00:00Z',
    })

    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'algo quebrou' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(screen.getByText('ABCD-EFGH-IJKL')).toBeDefined())
    expect(document.body.textContent).not.toContain('token-secreto-que-nao-pode-vazar')
  })

  it('falha de envio vira aviso na tela, e o texto escrito nao se perde', async () => {
    dublê.criar.mockRejectedValue(new Error('caiu'))

    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'algo quebrou' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('algo quebrou')
  })
})
