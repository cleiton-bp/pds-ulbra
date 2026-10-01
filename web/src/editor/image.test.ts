// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_DOC } from '@/editor/doc'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O arquivo marcado sai no formato e com o nome da imagem de origem** — e o teto
 * do projeto chega a quem escolhe o formato.
 *
 * **A imagem aberta devolve a memoria** quando o editor fecha.
 */
const dublê = vi.hoisted(() => ({ codificar: vi.fn(), desenhar: vi.fn(), soltar: vi.fn() }))

vi.mock('@/capture/imageFile', () => ({ canvasToImageFile: dublê.codificar }))
vi.mock('@/editor/render', () => ({ renderEdit: dublê.desenhar, releaseScratch: dublê.soltar }))

import { exportEdit, openImage } from '@/editor/image'

const aberta = { image: {} as CanvasImageSource, width: 40, height: 30, close: () => {} }

beforeEach(() => {
  dublê.desenhar.mockImplementation(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 40
    canvas.height = 30
    return canvas
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('o arquivo marcado', () => {
  it.each([
    ['foto.jpg', 'image/jpeg', 'foto'],
    ['captura.webp', 'image/webp', 'captura'],
    ['print', 'image/png', 'print'],
    ['.png', 'image/png', 'imagem'],
  ])('%s sai no formato dele, com o nome dele', async (origem, tipo, nome) => {
    const gerado = new File(['x'], `${nome}.algo`, { type: tipo })
    dublê.codificar.mockResolvedValue(gerado)

    const arquivo = await exportEdit(
      aberta,
      EMPTY_DOC,
      new File(['y'], origem, { type: tipo }),
      5000,
    )

    expect(arquivo).toBe(gerado)
    expect(dublê.codificar).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), {
      maxBytes: 5000,
      format: tipo,
      name: nome,
    })
  })

  it('sem teto, nenhum teto vai para quem codifica', async () => {
    dublê.codificar.mockResolvedValue(new File(['x'], 'a.png', { type: 'image/png' }))

    await exportEdit(aberta, EMPTY_DOC, new File(['y'], 'a.png', { type: 'image/png' }), null)

    expect(dublê.codificar.mock.calls[0]?.[1]).toMatchObject({ maxBytes: undefined })
    expect(dublê.desenhar).toHaveBeenCalledWith(aberta.image, aberta, EMPTY_DOC)
  })

  // O Safari do iPhone so devolve a memoria do canvas zerado — mesmo quando falha.
  it('o canvas do arquivo e zerado depois de codificar, e tambem quando falha', async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 4000
    canvas.height = 3000
    dublê.desenhar.mockReturnValue(canvas)
    dublê.codificar.mockRejectedValue(new Error('sem memoria'))

    await expect(exportEdit(aberta, EMPTY_DOC, new File(['y'], 'a.png'), null)).rejects.toThrow()

    expect([canvas.width, canvas.height]).toEqual([0, 0])
    // E os de apoio do desfoque, que ficaram do tamanho do arquivo.
    expect(dublê.soltar).toHaveBeenCalled()
  })
})

describe('a imagem aberta', () => {
  it('sai do bitmap, com o tamanho dele, e fechar devolve a memoria', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 640, height: 480, close })),
    )

    const imagem = await openImage(new Blob(['z']))
    imagem.close()

    expect([imagem.width, imagem.height]).toEqual([640, 480])
    expect(close).toHaveBeenCalled()
  })
})
