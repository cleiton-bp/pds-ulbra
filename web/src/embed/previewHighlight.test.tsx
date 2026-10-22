// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import { EmbedApp } from '@/embed/EmbedApp'
import { connectToPreviewPanel } from '@/embed/hostBridge'
import { MESSAGE_SOURCE, type PreviewMessage } from '@/embed/protocol'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTES TESTES TRAVAM: o contorno da parte do formulario que a tela do painel
 * esta mudando (`PreviewMessage.highlight`).
 *
 * - **Lista fechada na chegada**: so um nome de `PREVIEW_FORM_PARTS` passa; qualquer
 *   outro valor vira "nada a contornar", e a mensagem de outra origem nem e ouvida.
 * - **So na previa**: no site do cliente, o mesmo `highlight` nao desenha nada.
 * - **Uma parte so**, a pedida — inclusive a area de anexar.
 */
vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()
  return {
    ...real,
    reportService: { createReport: vi.fn(), listByReporterCode: vi.fn() },
    widgetSettingsService: { loadWidgetSettings: vi.fn() },
  }
})

const config = { key: '', route: null, origin: null, viewport: null }

const MIDIA: PublicMediaSettingsViewModel = {
  IsEnabled: true,
  AllowsScreenCapture: false,
  AllowsOnInfoRequest: false,
  AllowsOnReopen: false,
  Kinds: [{ Kind: 'Image', MaxCount: 3, MaxBytes: 5 * 1024 * 1024, ContentTypes: ['image/png'] }],
}

const contornadas = () => Array.from(document.querySelectorAll('[data-preview-highlight]'))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('a ponte da prévia confere o contorno', () => {
  const recebidas: PreviewMessage[] = []

  function chega(dados: unknown, origem = window.location.origin) {
    window.dispatchEvent(
      new MessageEvent('message', { data: dados, origin: origem, source: window.parent }),
    )
  }

  function ligar() {
    recebidas.length = 0
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() },
    })
    return connectToPreviewPanel((mensagem) => recebidas.push(mensagem))
  }

  const previa = (highlight: unknown) => ({
    source: MESSAGE_SOURCE,
    type: 'preview',
    settings: DEFAULT_WIDGET_SETTINGS,
    viewport: { width: 1280, height: 480 },
    highlight,
  })

  it('a parte conhecida passa; o resto vira nada a contornar', () => {
    const ponte = ligar()

    chega(previa('form-title'))
    chega(previa('form-attachments'))
    chega(previa('<img src=x>'))
    chega(previa({ parte: 'form-title' }))
    chega(previa(undefined))

    expect(recebidas.map((mensagem) => mensagem.highlight)).toEqual([
      'form-title',
      'form-attachments',
      null,
      null,
      null,
    ])
    ponte.stop()
  })

  it('a mensagem de outra origem nem é ouvida', () => {
    const ponte = ligar()
    chega(previa('form-title'), 'https://outro.exemplo.com')
    expect(recebidas).toEqual([])
    ponte.stop()
  })
})

describe('o quadro contorna a parte pedida', () => {
  it('na prévia, só a parte pedida ganha o contorno', () => {
    render(
      <EmbedApp
        settings={DEFAULT_WIDGET_SETTINGS}
        config={config}
        preview
        highlight="form-submit"
      />,
    )

    expect(contornadas()).toEqual([screen.getByRole('button', { name: 'Enviar' })])
    expect(contornadas()[0]?.className).toContain('outline-dashed')
  })

  it('cada grupo do Formulário acha a parte dele', () => {
    const settings = { ...DEFAULT_WIDGET_SETTINGS, AsksForName: true }
    const { rerender } = render(
      <EmbedApp settings={settings} config={config} preview highlight="form-top" />,
    )
    expect(contornadas()[0]?.textContent).toContain(settings.Title)

    rerender(<EmbedApp settings={settings} config={config} preview highlight="form-type" />)
    expect(contornadas()[0]?.tagName).toBe('FIELDSET')

    rerender(<EmbedApp settings={settings} config={config} preview highlight="form-title" />)
    expect(contornadas()[0]?.textContent).toContain(settings.ReportTitleQuestion)

    rerender(<EmbedApp settings={settings} config={config} preview highlight="form-name" />)
    expect(contornadas()[0]?.textContent).toContain(settings.NameQuestion)
    expect(contornadas()).toHaveLength(1)
  })

  it('a área de anexar tem o contorno dela', () => {
    render(
      <EmbedApp
        settings={DEFAULT_WIDGET_SETTINGS}
        config={config}
        media={MIDIA}
        preview
        highlight="form-attachments"
      />,
    )

    expect(contornadas()).toHaveLength(1)
    expect(contornadas()[0]?.getAttribute('data-preview-highlight')).toBe('form-attachments')
    expect(contornadas()[0]?.textContent).toContain('Anexar imagem')
  })

  it('fora da prévia, o mesmo pedido não desenha nada', () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} highlight="form-submit" />)

    expect(screen.getByRole('button', { name: 'Enviar' })).toBeTruthy()
    expect(contornadas()).toEqual([])
    expect(document.querySelector('.outline-dashed')).toBeNull()
  })
})
