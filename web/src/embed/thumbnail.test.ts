// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeThumbnail } from '@/embed/attachments'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **A miniatura sai em WebP, e em JPEG onde o navegador nao codifica WebP** — o
 * Safari, inclusive o do iPhone. So com WebP, quem relata por la mandaria tudo sem
 * miniatura, e o time veria so a palavra "imagem" na lista.
 *
 * **Sempre em fundo branco**, e a memoria do bitmap e do canvas e devolvida — tambem
 * quando o desenho falha no meio.
 *
 * **Nunca passa do teto da API (256 KB)**, que a recusaria calada: a altura tem limite,
 * e a qualidade desce um degrau se precisar.
 */
let pintado: string[] = []
let canvases: HTMLCanvasElement[] = []
const fechar = vi.fn()

function navegador({ webp }: { webp: boolean }) {
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback: BlobCallback, tipo = 'image/png') => {
      const real = tipo === 'image/webp' && !webp ? 'image/png' : tipo
      callback(new Blob([new Uint8Array(50)], { type: real }))
    },
  )
}

beforeEach(() => {
  pintado = []
  canvases = []
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 1280, height: 800, close: fechar })),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    canvases.push(this)
    return {
      set fillStyle(valor: string) {
        pintado.push(`cor ${valor}`)
      },
      fillRect: () => pintado.push('fundo'),
      drawImage: () => pintado.push('imagem'),
    } as unknown as CanvasRenderingContext2D
  } as unknown as HTMLCanvasElement['getContext'])
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  fechar.mockClear()
})

const arquivo = () => new File([new Uint8Array(10)], 'erro.png', { type: 'image/png' })

describe('a miniatura', () => {
  it('com WebP, sai WebP', async () => {
    navegador({ webp: true })
    expect((await makeThumbnail(arquivo()))?.type).toBe('image/webp')
  })

  it('sem WebP, sai JPEG — e nao fica sem miniatura', async () => {
    navegador({ webp: false })
    expect((await makeThumbnail(arquivo()))?.type).toBe('image/jpeg')
  })

  it('o branco vai por baixo da imagem', async () => {
    navegador({ webp: false })
    await makeThumbnail(arquivo())
    expect(pintado).toEqual(['cor white', 'fundo', 'imagem'])
  })

  it('devolve a memoria do bitmap e do canvas', async () => {
    navegador({ webp: true })
    await makeThumbnail(arquivo())
    expect(fechar).toHaveBeenCalled()
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true)
  })

  it('a captura de rolagem longa mostra o comeco: no maximo o dobro da largura', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1080, height: 10000, close: fechar })),
    )
    let medida = ''
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      tipo = 'image/png',
    ) {
      medida = `${this.width}x${this.height}`
      callback(new Blob([new Uint8Array(50)], { type: tipo }))
    })

    await makeThumbnail(arquivo())

    expect(medida).toBe('320x640')
  })

  it('passando de 256 KB, desce um degrau; passando ainda, fica sem miniatura', async () => {
    const qualidades: (number | undefined)[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback: BlobCallback, tipo = 'image/png', qualidade?: number) => {
        qualidades.push(qualidade)
        callback(new Blob([new Uint8Array(qualidade === 0.6 ? 100 : 300 * 1024)], { type: tipo }))
      },
    )
    expect((await makeThumbnail(arquivo()))?.size).toBe(100)
    expect(qualidades).toEqual([0.8, 0.6])

    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback: BlobCallback, tipo = 'image/png') =>
        callback(new Blob([new Uint8Array(300 * 1024)], { type: tipo })),
    )
    expect(await makeThumbnail(arquivo())).toBeNull()
  })

  it('o desenho que falha no meio ainda devolve a memoria do bitmap', async () => {
    navegador({ webp: true })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          set fillStyle(_: string) {},
          fillRect: () => {},
          drawImage: () => {
            throw new Error('sem memoria')
          },
        }) as unknown as CanvasRenderingContext2D,
    )

    expect(await makeThumbnail(arquivo())).toBeNull()
    expect(fechar).toHaveBeenCalled()
  })

  it('tem 320 de largura, na proporcao da imagem', async () => {
    let medida = ''
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      tipo = 'image/png',
    ) {
      medida = `${this.width}x${this.height}`
      callback(new Blob([new Uint8Array(50)], { type: tipo }))
    })
    await makeThumbnail(arquivo())
    expect(medida).toBe('320x200')
  })
})
