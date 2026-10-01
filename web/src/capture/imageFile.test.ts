// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { canvasToImageFile } from '@/capture/imageFile'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O formato da captura cabe no limite.** WebP quando o navegador codifica. Onde
 * nao codifica — o Safari —, PNG se couber, e JPEG quando o PNG passa do teto do
 * projeto: sem isso a pessoa marcaria a area para so entao ouvir que nao cabe.
 *
 * O ambiente de teste nao codifica imagem; o `toBlob` e dublado com o que cada
 * navegador devolve.
 */
/** Um navegador: o que ele devolve para cada tipo pedido, e de que tamanho. */
function navegador(saida: Record<string, { tipo: string; bytes: number }>) {
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    tipo?: string,
  ) {
    const resposta = saida[tipo ?? 'image/png'] ?? saida['image/png']
    callback(resposta ? new Blob([new Uint8Array(resposta.bytes)], { type: resposta.tipo }) : null)
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('o formato da captura', () => {
  it('com WebP, sai WebP', async () => {
    navegador({ 'image/webp': { tipo: 'image/webp', bytes: 300 } })

    const arquivo = await canvasToImageFile(document.createElement('canvas'), 1000)

    expect(arquivo.type).toBe('image/webp')
    expect(arquivo.name).toBe('captura.webp')
  })

  it('sem WebP, sai PNG quando cabe no limite', async () => {
    // Quem nao codifica WebP devolve PNG no lugar, como o Safari.
    navegador({
      'image/webp': { tipo: 'image/png', bytes: 800 },
      'image/png': { tipo: 'image/png', bytes: 800 },
      'image/jpeg': { tipo: 'image/jpeg', bytes: 200 },
    })

    const arquivo = await canvasToImageFile(document.createElement('canvas'), 1000)

    expect(arquivo.type).toBe('image/png')
  })

  it('sem WebP e com o PNG passando do limite, sai JPEG', async () => {
    navegador({
      'image/webp': { tipo: 'image/png', bytes: 5000 },
      'image/png': { tipo: 'image/png', bytes: 5000 },
      'image/jpeg': { tipo: 'image/jpeg', bytes: 600 },
    })

    const arquivo = await canvasToImageFile(document.createElement('canvas'), 1000)

    expect(arquivo.type).toBe('image/jpeg')
    expect(arquivo.name).toBe('captura.jpg')
    expect(arquivo.size).toBe(600)
  })
})
