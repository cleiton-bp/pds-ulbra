// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { CaptureArea, CaptureModule } from '@/capture/area'
import { type CaptureDoneMessage, MESSAGE_SOURCE } from '@/embed/protocol'
import type { AreaPicker } from '@/loader/areaPicker'
import { createCaptureHandler } from '@/loader/captureFlow'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O quadro some enquanto a pessoa marca, e sempre volta** — desistindo, falhando
 * ou dando certo. Uma falha no meio que deixasse o quadro escondido tiraria a
 * ferramenta do site do cliente ate a pagina recarregar.
 *
 * **Sempre ha resposta, e com o identificador do pedido.** O quadro espera por ela;
 * sem resposta, o botao dele ficaria desligado para sempre.
 *
 * **O arquivo da captura baixa enquanto a pessoa marca**, e nao depois.
 */
const pedido = { source: MESSAGE_SOURCE, type: 'capture', id: 'p-1', maxBytes: 5000 } as const

function montar({
  area = 'viewport' as CaptureArea | null,
  modulo = (async () => ({
    capturePage: vi.fn(async () => new File(['x'], 'captura.webp', { type: 'image/webp' })),
  })) as () => Promise<CaptureModule>,
} = {}) {
  const frameStyle = { visibility: 'visible' } as CSSStyleDeclaration
  const respostas: CaptureDoneMessage[] = []
  const picker = {
    chosen: Promise.resolve(area),
    aborted: new Promise<void>(() => {}),
    busy: vi.fn(),
    close: vi.fn(),
  } satisfies AreaPicker
  const loadModule = vi.fn(modulo)
  const openPicker = vi.fn(() => {
    // Quando a camada abre, o quadro ja sumiu.
    expect(frameStyle.visibility).toBe('hidden')
    return picker
  })

  const focusFrame = vi.fn()
  const capture = createCaptureHandler({
    frameStyle,
    focusFrame,
    openPicker,
    loadModule,
    reply: (message) => respostas.push(message),
  })

  return { capture, frameStyle, respostas, picker, loadModule, openPicker, focusFrame }
}

describe('a captura pedida pelo quadro', () => {
  it('marcada a area, devolve o arquivo com o id do pedido, e o quadro volta com o foco', async () => {
    const { capture, frameStyle, respostas, picker, focusFrame } = montar()

    await capture(pedido)

    expect(respostas).toHaveLength(1)
    expect(respostas[0]).toMatchObject({ type: 'capture-done', id: 'p-1', outcome: 'file' })
    expect(respostas[0]?.file?.name).toBe('captura.webp')
    expect(picker.busy).toHaveBeenCalled()
    expect(picker.close).toHaveBeenCalled()
    expect(frameStyle.visibility).toBe('visible')
    expect(focusFrame).toHaveBeenCalledOnce()
    expect(capture.isCapturing()).toBe(false)
  })

  it('leva a area marcada e o teto de imagem ate quem desenha', async () => {
    const capturePage = vi.fn(async () => new File(['x'], 'captura.webp'))
    const area = { x: 10, y: 20, width: 300, height: 200 }
    const { capture } = montar({ area, modulo: async () => ({ capturePage }) })

    await capture(pedido)

    expect(capturePage).toHaveBeenCalledWith(area, 5000)
  })

  it('desistir responde "cancel", e o quadro volta', async () => {
    const { capture, frameStyle, respostas } = montar({ area: null })

    await capture(pedido)

    expect(respostas).toEqual([
      { source: MESSAGE_SOURCE, type: 'capture-done', id: 'p-1', outcome: 'cancel', file: null },
    ])
    expect(frameStyle.visibility).toBe('visible')
  })

  // O que bloqueia o arquivo — a pagina que proibe o nosso script — nao muda na
  // proxima area: a camada fecha na hora, sem pedir para a pessoa marcar.
  it('o arquivo da captura que nao chega responde "unavailable" na hora, sem esperar marcar', async () => {
    const frameStyle = { visibility: 'visible' } as CSSStyleDeclaration
    const respostas: CaptureDoneMessage[] = []
    const close = vi.fn()
    const capture = createCaptureHandler({
      frameStyle,
      focusFrame: vi.fn(),
      // A pessoa nunca marca: so a falha do download termina a espera.
      openPicker: () => ({
        chosen: new Promise(() => {}),
        aborted: new Promise(() => {}),
        busy: vi.fn(),
        close,
      }),
      loadModule: () => Promise.reject(new Error('bloqueado')),
      reply: (message) => respostas.push(message),
    })

    await capture(pedido)

    expect(respostas).toEqual([expect.objectContaining({ outcome: 'unavailable', file: null })])
    expect(close).toHaveBeenCalled()
    expect(frameStyle.visibility).toBe('visible')
  })

  it('a pagina que nao deixa montar a camada responde "unavailable"', async () => {
    const frameStyle = { visibility: 'visible' } as CSSStyleDeclaration
    const respostas: CaptureDoneMessage[] = []
    const capture = createCaptureHandler({
      frameStyle,
      focusFrame: vi.fn(),
      openPicker: () => {
        throw new TypeError('Trusted Types')
      },
      loadModule: async () => ({ capturePage: async () => new File(['x'], 'captura.webp') }),
      reply: (message) => respostas.push(message),
    })

    await capture(pedido)

    expect(respostas[0]).toMatchObject({ outcome: 'unavailable' })
    expect(frameStyle.visibility).toBe('visible')
  })

  // Uma pagina pesada ou uma rede parada nao podem prender a pessoa debaixo do veu.
  it('cancelar enquanto a imagem e gerada responde "cancel" na hora', async () => {
    let desistir: () => void = () => {}
    const respostas: CaptureDoneMessage[] = []
    const close = vi.fn()
    const capture = createCaptureHandler({
      frameStyle: { visibility: 'visible' } as CSSStyleDeclaration,
      focusFrame: vi.fn(),
      openPicker: () => ({
        chosen: Promise.resolve('viewport'),
        aborted: new Promise<void>((resolve) => {
          desistir = resolve
        }),
        busy: vi.fn(),
        close,
      }),
      // A imagem nunca fica pronta.
      loadModule: async () => ({ capturePage: () => new Promise<File>(() => {}) }),
      reply: (message) => respostas.push(message),
    })

    const andamento = capture(pedido)
    await vi.waitFor(() => expect(capture.isCapturing()).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 0))
    desistir()
    await andamento

    expect(respostas).toEqual([expect.objectContaining({ outcome: 'cancel' })])
    expect(close).toHaveBeenCalled()
    expect(capture.isCapturing()).toBe(false)
  })

  it('a imagem que passa do prazo responde "failed", e o quadro volta', async () => {
    const frameStyle = { visibility: 'visible' } as CSSStyleDeclaration
    const respostas: CaptureDoneMessage[] = []
    const capture = createCaptureHandler({
      frameStyle,
      focusFrame: vi.fn(),
      openPicker: () => ({
        chosen: Promise.resolve('viewport'),
        aborted: new Promise<void>(() => {}),
        busy: vi.fn(),
        close: vi.fn(),
      }),
      loadModule: async () => ({ capturePage: () => new Promise<File>(() => {}) }),
      reply: (message) => respostas.push(message),
      timeoutMs: 20,
    })

    await capture(pedido)

    expect(respostas).toEqual([expect.objectContaining({ outcome: 'failed' })])
    expect(frameStyle.visibility).toBe('visible')
  })

  it('a pagina que nao se deixa redesenhar responde "failed", e o quadro volta', async () => {
    const { capture, frameStyle, respostas } = montar({
      modulo: async () => ({
        capturePage: async () => {
          throw new Error('img-src bloqueado')
        },
      }),
    })

    await capture(pedido)

    expect(respostas[0]).toMatchObject({ outcome: 'failed' })
    expect(frameStyle.visibility).toBe('visible')
  })

  // Marcar leva segundos, e e o tempo de o arquivo chegar.
  it('o arquivo da captura comeca a baixar antes de a pessoa terminar de marcar', async () => {
    const { capture, loadModule, openPicker } = montar()

    await capture(pedido)

    expect(loadModule.mock.invocationCallOrder[0]).toBeLessThan(
      openPicker.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
  })

  // Desistir antes de marcar nao e erro, mesmo com o download falhando.
  it('desistir com o download falhando continua sendo desistir', async () => {
    const { capture, respostas } = montar({
      area: null,
      modulo: () => Promise.reject(new Error('rede')),
    })

    await capture(pedido)

    expect(respostas[0]).toMatchObject({ outcome: 'cancel' })
  })

  it('o segundo pedido, com o primeiro no meio, e dado por desistido', async () => {
    let marcar: (area: CaptureArea | null) => void = () => {}
    const frameStyle = { visibility: 'visible' } as CSSStyleDeclaration
    const respostas: CaptureDoneMessage[] = []
    const capture = createCaptureHandler({
      frameStyle,
      focusFrame: vi.fn(),
      openPicker: () => ({
        chosen: new Promise((resolve) => {
          marcar = resolve
        }),
        aborted: new Promise<void>(() => {}),
        busy: vi.fn(),
        close: vi.fn(),
      }),
      loadModule: async () => ({ capturePage: async () => new File(['x'], 'captura.webp') }),
      reply: (message) => respostas.push(message),
    })

    const primeiro = capture(pedido)
    await capture({ ...pedido, id: 'p-2' })
    expect(respostas).toEqual([expect.objectContaining({ id: 'p-2', outcome: 'cancel' })])

    marcar('viewport')
    await primeiro
    expect(respostas[1]).toMatchObject({ id: 'p-1', outcome: 'file' })
  })
})
