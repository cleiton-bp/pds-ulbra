// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **A area marcada e a area desenhada.** A pessoa marca na janela; quem desenha
 * trabalha na pagina — a diferenca e a rolagem, e esquecer de soma-la desenharia o
 * topo da pagina em vez do que ela marcou.
 *
 * **O nosso quadro e a camada de marcar nunca entram no print.** Estao por cima do
 * que a pessoa quer mostrar.
 *
 * **A densidade para em 2**, e o fundo e o da pagina: sem ele, o print sai
 * transparente onde o site pinta o fundo no `<html>`.
 *
 * O ambiente de teste nao desenha pagina: a biblioteca e dublada, e o que se
 * confere e o que se pede a ela.
 */
const dublê = vi.hoisted(() => ({ snapdom: vi.fn() }))

vi.mock('@zumer/snapdom', () => ({ snapdom: dublê.snapdom }))

import { capturePage, EXCLUDED_FROM_CAPTURE, pageBackground } from '@/capture/pageCapture'

function desenhar() {
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'toBlob').mockImplementation((callback, tipo) =>
    callback(new Blob([new Uint8Array(50)], { type: tipo ?? 'image/png' })),
  )
  dublê.snapdom.mockResolvedValue({ toCanvas: async () => canvas })
}

function rolar(x: number, y: number) {
  Object.defineProperty(window, 'scrollX', { configurable: true, value: x })
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  rolar(0, 0)
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 })
  document.body.style.backgroundColor = ''
  document.documentElement.style.backgroundColor = ''
})

describe('o desenho da area', () => {
  it('soma a rolagem: a area da janela vira a area da pagina', async () => {
    desenhar()
    rolar(0, 1200)

    await capturePage({ x: 40, y: 100, width: 300, height: 200 }, null)

    // Do <html>: e o que guarda a rolagem de quem rola pelo proprio <body>.
    expect(dublê.snapdom).toHaveBeenCalledWith(
      document.documentElement,
      expect.objectContaining({ clip: { x: 40, y: 1300, width: 300, height: 200 } }),
    )
  })

  it('a tela inteira vai como a area que se ve', async () => {
    desenhar()

    await capturePage('viewport', null)

    expect(dublê.snapdom.mock.calls[0]?.[1]).toMatchObject({ clip: 'viewport' })
  })

  it('deixa o nosso quadro e a camada de marcar fora do print', async () => {
    desenhar()

    await capturePage('viewport', null)

    const opcoes = dublê.snapdom.mock.calls[0]?.[1]
    expect(opcoes.exclude).toEqual(EXCLUDED_FROM_CAPTURE)
    expect(EXCLUDED_FROM_CAPTURE).toEqual(['iframe[data-pds]', '[data-pds-captura]'])
    expect(opcoes.excludeMode).toBe('remove')
  })

  it.each([
    [1, 1],
    [2, 2],
    [3, 2],
  ])('tela de densidade %s desenha em %s', async (tela, esperada) => {
    desenhar()
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: tela })

    await capturePage('viewport', null)

    expect(dublê.snapdom.mock.calls[0]?.[1]).toMatchObject({ dpr: esperada })
  })

  it('devolve a imagem como arquivo, no formato que cabe no teto', async () => {
    desenhar()

    const arquivo = await capturePage('viewport', 5000)

    expect(arquivo.type).toBe('image/webp')
    expect(arquivo.name).toBe('captura.webp')
  })
})

describe('o fundo da pagina', () => {
  it('e o do body, quando ele tem cor', () => {
    document.body.style.backgroundColor = 'rgb(10, 20, 30)'
    expect(pageBackground()).toBe('rgb(10, 20, 30)')
  })

  it('e o do html, quando so ele tem', () => {
    document.documentElement.style.backgroundColor = 'rgb(1, 2, 3)'
    expect(pageBackground()).toBe('rgb(1, 2, 3)')
  })

  it('e branco, quando nenhum tem', () => {
    expect(pageBackground()).toBe('#ffffff')
  })
})
