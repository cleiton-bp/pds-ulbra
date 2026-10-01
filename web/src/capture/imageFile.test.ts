// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **A captura sai no formato mais leve**: WebP, e JPEG onde o navegador nao codifica
 * WebP — nunca PNG, que numa tela Retina passa de um megabyte. **Saber se ha WebP custa
 * um pixel, uma vez**: perguntar com a imagem inteira custava, no Safari, um PNG
 * inteiro jogado fora a cada tentativa.
 *
 * **A imagem editada sai no formato de origem**: PNG continua PNG enquanto couber — e
 * so no tamanho cheio —, JPEG continua JPEG; sem o formato de origem, o mais leve.
 *
 * **Sempre cabendo no teto**: a qualidade desce em degraus, e sem caber nem no ultimo
 * a imagem encolhe. Nada que ja saiu se perde por uma falha no meio, e sem canvas para
 * encolher nao se repete o mesmo trabalho. O JPEG ganha fundo branco por baixo, no
 * proprio canvas — o transparente sairia preto.
 *
 * O ambiente de teste nao codifica imagem: o `toBlob` e um navegador de mentira, que
 * diz o tamanho de cada pedido, e o contexto do canvas grava o que foi pintado. Cada
 * teste carrega o modulo de novo: a resposta sobre o WebP fica guardada nele.
 */

interface Pedido {
  tipo: string
  qualidade: number | undefined
  largura: number
  canvas: HTMLCanvasElement
}

let pedidos: Pedido[] = []
let pinturas: { canvas: HTMLCanvasElement; acao: string; valor?: unknown }[] = []
let semContexto = false
let sondas = 0

type Modulo = typeof import('@/capture/imageFile')
let modulo: Modulo

/**
 * Um navegador: se codifica WebP, e quantos bytes sai cada pedido (nulo: falhou). Quem
 * nao codifica WebP devolve PNG no lugar, como o Safari.
 */
function navegador(
  { webp = true }: { webp?: boolean },
  tamanho: (pedido: Omit<Pedido, 'canvas'>) => number | null,
) {
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    tipo = 'image/png',
    qualidade?: number,
  ) {
    const real = tipo === 'image/webp' && !webp ? 'image/png' : tipo
    const pedido = { tipo: real, qualidade, largura: this.width }
    // A sonda do WebP, num pixel, nao conta como tentativa.
    if (this.width > 1) pedidos.push({ ...pedido, canvas: this })
    else sondas += 1
    const bytes = this.width > 1 ? tamanho(pedido) : 10
    callback(bytes === null ? null : new Blob([new Uint8Array(bytes)], { type: real }))
  })
}

beforeEach(async () => {
  pedidos = []
  pinturas = []
  semContexto = false
  sondas = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const canvas = this
    if (semContexto && canvas.width > 1 && !canvas.dataset.original) return null
    return {
      save: () => pinturas.push({ canvas, acao: 'save' }),
      restore: () => pinturas.push({ canvas, acao: 'restore' }),
      set globalCompositeOperation(valor: unknown) {
        pinturas.push({ canvas, acao: 'composicao', valor })
      },
      set fillStyle(valor: unknown) {
        pinturas.push({ canvas, acao: 'fillStyle', valor })
      },
      fillRect: () => pinturas.push({ canvas, acao: 'fillRect' }),
      drawImage: (fonte: unknown) => pinturas.push({ canvas, acao: 'drawImage', valor: fonte }),
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'low',
    } as unknown as CanvasRenderingContext2D
  } as unknown as HTMLCanvasElement['getContext'])
  vi.resetModules()
  modulo = await import('@/capture/imageFile')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function tela(largura = 2000, altura = 1000) {
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  canvas.dataset.original = 'sim'
  return canvas
}

describe('a captura, no formato mais leve', () => {
  it('com WebP, sai WebP no primeiro degrau quando cabe', async () => {
    navegador({}, () => 300)

    const arquivo = await modulo.canvasToImageFile(tela(), { maxBytes: 1000 })

    expect(arquivo.type).toBe('image/webp')
    expect(arquivo.name).toBe('captura.webp')
    expect(pedidos.map((p) => [p.tipo, p.qualidade])).toEqual([
      ['image/webp', modulo.QUALITY_STEPS[0]],
    ])
  })

  it('sem teto, a primeira tentativa vale', async () => {
    navegador({}, () => 9_000_000)

    const arquivo = await modulo.canvasToImageFile(tela())

    expect(arquivo.size).toBe(9_000_000)
    expect(pedidos).toHaveLength(1)
  })

  it('grande demais, a qualidade desce ate caber', async () => {
    navegador({}, ({ qualidade }) => ((qualidade ?? 1) > 0.7 ? 2000 : 800))

    const arquivo = await modulo.canvasToImageFile(tela(), { maxBytes: 1000 })

    expect(arquivo.size).toBe(800)
    expect(pedidos.map((p) => p.qualidade)).toEqual([0.85, 0.75, 0.6])
  })

  // No Safari, perguntar com a imagem inteira custava um PNG inteiro, jogado fora.
  it('sem WebP, sai JPEG — nunca PNG —, sem codificar nada a toa', async () => {
    navegador({ webp: false }, () => 300)

    const arquivo = await modulo.canvasToImageFile(tela(), { maxBytes: 5_000_000 })

    expect(arquivo.type).toBe('image/jpeg')
    expect(arquivo.name).toBe('captura.jpg')
    expect(pedidos.map((p) => p.tipo)).toEqual(['image/jpeg'])
  })

  it('o JPEG ganha branco por baixo, no proprio canvas, sem copia', async () => {
    navegador({ webp: false }, () => 300)
    const canvas = tela()

    await modulo.canvasToImageFile(canvas, { maxBytes: 5_000_000 })

    expect(pedidos[0]?.canvas).toBe(canvas)
    const pintado = pinturas.filter((p) => p.canvas === canvas)
    expect(pintado.map((p) => p.acao)).toEqual([
      'save',
      'composicao',
      'fillStyle',
      'fillRect',
      'restore',
    ])
    expect(pintado[1]?.valor).toBe('destination-over')
    expect(pintado[2]?.valor).toBe('white')
  })

  it('sem caber nem no ultimo degrau, a imagem encolhe e tenta de novo', async () => {
    navegador({}, ({ largura }) => (largura > 1600 ? 5000 : 900))

    const arquivo = await modulo.canvasToImageFile(tela(2000, 1000), { maxBytes: 1000 })

    expect(arquivo.size).toBe(900)
    expect(pedidos.at(-1)?.largura).toBe(1500)
  })

  // O menor no meio do caminho, e nao no fim: guardar so o ultimo nao basta.
  it('sem caber nem encolhida, sai a menor de todas as tentativas', async () => {
    const tamanhos = new Map([
      [2000, 700],
      [1500, 300],
      [1125, 500],
      [844, 600],
    ])
    navegador(
      {},
      ({ largura, qualidade }) => (tamanhos.get(largura) ?? 999) + (qualidade === 0.45 ? 0 : 50),
    )

    const arquivo = await modulo.canvasToImageFile(tela(2000, 1000), { maxBytes: 10 })

    expect(arquivo.size).toBe(300)
    // Tres vezes menor, e nao mais.
    expect(Math.min(...pedidos.map((p) => p.largura))).toBe(Math.round(2000 * 0.75 ** 3))
  })

  it('uma falha no meio da escada nao joga fora o que ja saiu', async () => {
    navegador({}, ({ qualidade }) => (qualidade === 0.85 ? 2000 : null))

    const arquivo = await modulo.canvasToImageFile(tela(), { maxBytes: 1000 })

    expect(arquivo.type).toBe('image/webp')
    expect(arquivo.size).toBe(2000)
  })

  it('sem canvas para encolher, para — e nao repete o mesmo trabalho', async () => {
    navegador({}, () => 5000)
    semContexto = true

    await modulo.canvasToImageFile(tela(), { maxBytes: 1000 })

    expect(pedidos).toHaveLength(modulo.QUALITY_STEPS.length)
  })

  it('os canvases intermediarios sao zerados; o recebido, nao', async () => {
    navegador({}, ({ largura }) => (largura > 1200 ? 5000 : 900))
    const canvas = tela(2000, 1000)

    await modulo.canvasToImageFile(canvas, { maxBytes: 1000 })

    const intermediarios = [...new Set(pedidos.map((p) => p.canvas))].filter((c) => c !== canvas)
    expect(intermediarios.length).toBeGreaterThan(0)
    expect(intermediarios.every((c) => c.width === 0 && c.height === 0)).toBe(true)
    expect(canvas.width).toBe(2000)
  })

  it('a pergunta sobre o WebP e feita uma vez so', async () => {
    navegador({}, () => 300)

    await modulo.canvasToImageFile(tela(), { maxBytes: 1000 })
    await modulo.canvasToImageFile(tela(), { maxBytes: 1000 })

    expect(sondas).toBe(1)
  })
})

describe('a imagem editada, no formato de origem', () => {
  it('o PNG continua PNG enquanto cabe, com o nome dele', async () => {
    navegador({}, () => 400)

    const arquivo = await modulo.canvasToImageFile(tela(), {
      maxBytes: 1000,
      format: 'image/png',
      name: 'tela-do-erro',
    })

    expect(arquivo.type).toBe('image/png')
    expect(arquivo.name).toBe('tela-do-erro.png')
  })

  it('o PNG que nao cabe vai para o mais leve, e so e tentado no tamanho cheio', async () => {
    navegador({}, ({ tipo, largura }) =>
      tipo === 'image/png' ? 9000 : largura > 1600 ? 5000 : 500,
    )

    const arquivo = await modulo.canvasToImageFile(tela(), { maxBytes: 1000, format: 'image/png' })

    expect(arquivo.type).toBe('image/webp')
    expect(pedidos.filter((p) => p.tipo === 'image/png')).toHaveLength(1)
  })

  it('sem WebP, o PNG que nao cabe vira JPEG, sem PNG a toa', async () => {
    navegador({ webp: false }, ({ tipo }) => (tipo === 'image/png' ? 9000 : 500))

    const arquivo = await modulo.canvasToImageFile(tela(), { maxBytes: 1000, format: 'image/png' })

    expect(arquivo.type).toBe('image/jpeg')
    expect(pedidos.map((p) => p.tipo)).toEqual(['image/png', 'image/jpeg'])
  })

  it('o JPEG continua JPEG, mesmo onde WebP ocuparia menos', async () => {
    navegador({}, ({ tipo }) => (tipo === 'image/webp' ? 100 : 700))

    const arquivo = await modulo.canvasToImageFile(tela(), {
      maxBytes: 1000,
      format: 'image/jpeg',
      name: 'foto',
    })

    expect(arquivo.type).toBe('image/jpeg')
    expect(arquivo.name).toBe('foto.jpg')
    expect(pedidos.every((p) => p.tipo === 'image/jpeg')).toBe(true)
  })

  it('o WebP, onde o navegador nao codifica WebP, vira JPEG', async () => {
    navegador({ webp: false }, () => 300)

    const arquivo = await modulo.canvasToImageFile(tela(), {
      maxBytes: 1000,
      format: 'image/webp',
    })

    expect(arquivo.type).toBe('image/jpeg')
  })
})
