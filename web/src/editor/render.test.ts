// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type EditDoc, EMPTY_DOC, type Shape } from '@/editor/doc'
import { CROP_SHADE, HIDE_FILL } from '@/editor/palette'
import {
  drawScene,
  exportArea,
  hideMarginFor,
  LINE_HEIGHT,
  MAX_EXPORT_PIXELS,
  renderEdit,
  toCanvasRect,
} from '@/editor/render'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **A tarja cobre o pixel inteiro, opaca e preta**, com as bordas arredondadas para
 * fora — em qualquer escala. Meio pixel de borda misturaria o que estava embaixo.
 *
 * **O desfoque le o pedaco do proprio canvas e o devolve borrado, no mesmo lugar**, e
 * sem canvas de apoio cobre em vez de deixar nitido.
 *
 * **O arquivo e o recorte, e so ele**: o veu do recorte e da tela. Imagem grande
 * demais sai reduzida ate o teto do Safari, na mesma proporcao.
 *
 * O jsdom nao desenha: o contexto aqui e um gravador, e o que se confere e o que foi
 * pedido a ele. A prova de pixel e a do navegador de verdade.
 */

interface Chamada {
  metodo: string
  args: unknown[]
  estado: Record<string, unknown>
}

interface Gravador {
  ctx: CanvasRenderingContext2D
  chamadas: Chamada[]
}

const gravadores = new Map<HTMLCanvasElement, Gravador>()
let semApoio = false

function gravador(canvas: HTMLCanvasElement): Gravador {
  const existente = gravadores.get(canvas)
  if (existente) return existente

  const chamadas: Chamada[] = []
  const estado: Record<string, unknown> = {
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    transform: [1, 0, 0, 1, 0, 0],
  }
  const pilha: Record<string, unknown>[] = []

  const ctx = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === 'canvas') return canvas
        if (prop in estado) return estado[prop]
        return (...args: unknown[]) => {
          if (prop === 'setTransform') estado.transform = args
          if (prop === 'save') pilha.push({ ...estado })
          if (prop === 'restore') Object.assign(estado, pilha.pop())
          chamadas.push({ metodo: prop, args, estado: { ...estado } })
        }
      },
      set(_, prop: string, valor) {
        estado[prop] = valor
        return true
      },
    },
  ) as CanvasRenderingContext2D

  const novo = { ctx, chamadas }
  gravadores.set(canvas, novo)
  return novo
}

function canvas(width: number, height: number) {
  const elemento = document.createElement('canvas')
  elemento.width = width
  elemento.height = height
  return { elemento, ...gravador(elemento) }
}

const doMetodo = (chamadas: Chamada[], metodo: string) =>
  chamadas.filter((chamada) => chamada.metodo === metodo)

const imagem = {} as CanvasImageSource

beforeEach(() => {
  semApoio = false
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    // O canvas principal sempre tem contexto; os de apoio podem nao ter.
    if (semApoio && !gravadores.has(this)) return null
    return gravador(this).ctx
  } as HTMLCanvasElement['getContext'])
})

afterEach(() => {
  gravadores.clear()
  vi.restoreAllMocks()
})

describe('o retangulo em pixels do canvas', () => {
  it('arredonda para fora: o pixel pela metade entra inteiro', () => {
    expect(
      toCanvasRect(
        { x: 10.4, y: 20.6, width: 5.2, height: 3 },
        { scale: 1, origin: { x: 0, y: 0 } },
        { width: 100, height: 100 },
      ),
    ).toEqual({ x: 10, y: 20, width: 6, height: 4 })
  })

  it('segue a escala e o comeco do canvas', () => {
    expect(
      toCanvasRect(
        { x: 5, y: 5, width: 10, height: 10 },
        { scale: 2, origin: { x: 5, y: 5 } },
        { width: 100, height: 100 },
      ),
    ).toEqual({ x: 0, y: 0, width: 20, height: 20 })
  })

  it('para na borda do canvas', () => {
    expect(
      toCanvasRect(
        { x: -10, y: 90, width: 30, height: 30 },
        { scale: 1, origin: { x: 0, y: 0 } },
        { width: 100, height: 100 },
      ),
    ).toEqual({ x: 0, y: 90, width: 20, height: 10 })
  })
})

describe('a cena', () => {
  it('a imagem primeiro, na escala; as tarjas logo depois; e as marcas na ordem', () => {
    const { ctx, chamadas } = canvas(200, 100)
    const doc: EditDoc = {
      shapes: [
        { type: 'rect', rect: { x: 1, y: 1, width: 10, height: 10 }, color: '#e5484d', width: 3 },
        { type: 'hide', rect: { x: 20, y: 20, width: 10, height: 10 } },
      ],
      crop: null,
    }

    drawScene(ctx, imagem, doc, { scale: 2, origin: { x: 0, y: 0 } })

    const desenhos = chamadas.filter((c) =>
      ['drawImage', 'strokeRect', 'fillRect'].includes(c.metodo),
    )
    expect(desenhos.map((c) => c.metodo)).toEqual([
      'drawImage',
      'fillRect',
      'strokeRect',
      'fillRect',
    ])
    expect(desenhos[0]?.estado.transform).toEqual([2, 0, 0, 2, -0, -0])
  })

  it('a tarja e preta, opaca, e cobre o pixel inteiro', () => {
    const { ctx, chamadas } = canvas(100, 100)
    const tarja: Shape = { type: 'hide', rect: { x: 3.4, y: 3.6, width: 3.2, height: 3 } }

    drawScene(ctx, imagem, { shapes: [tarja], crop: null }, { scale: 1, origin: { x: 0, y: 0 } })

    const [preenchida] = doMetodo(chamadas, 'fillRect')
    // 3,4..6,6 e 3,6..6,6: os pixels pela metade entram inteiros.
    expect(preenchida?.args).toEqual([3, 3, 4, 4])
    expect(preenchida?.estado).toMatchObject({
      fillStyle: HIDE_FILL,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      transform: [1, 0, 0, 1, 0, 0],
    })
  })

  // A tela quase sempre mostra a imagem reduzida. A folga dela faria a tarja parecer
  // maior do que sai no arquivo — a direcao insegura.
  it('na tela reduzida, a tarja e a exata, sem folga propria', () => {
    const { ctx, chamadas } = canvas(1000, 1000)
    const tarja: Shape = { type: 'hide', rect: { x: 100, y: 100, width: 40, height: 20 } }

    drawScene(ctx, imagem, { shapes: [tarja], crop: null }, { scale: 0.5, origin: { x: 0, y: 0 } })

    expect(doMetodo(chamadas, 'fillRect')[0]?.args).toEqual([50, 50, 20, 10])
  })

  it('a folga pedida entra em volta da tarja', () => {
    const { ctx, chamadas } = canvas(1000, 1000)
    const tarja: Shape = { type: 'hide', rect: { x: 100, y: 100, width: 40, height: 20 } }

    drawScene(
      ctx,
      imagem,
      { shapes: [tarja], crop: null },
      { scale: 1, origin: { x: 0, y: 0 } },
      { hideMargin: 5 },
    )

    expect(doMetodo(chamadas, 'fillRect')[0]?.args).toEqual([95, 95, 50, 30])
  })

  it('o desfoque feito antes de uma tarja le a tarja, e nao o que ela cobre', () => {
    const { elemento, ctx, chamadas } = canvas(400, 400)
    const doc: EditDoc = {
      shapes: [
        { type: 'blur', rect: { x: 0, y: 0, width: 200, height: 200 }, block: 20 },
        { type: 'hide', rect: { x: 50, y: 50, width: 40, height: 40 } },
      ],
      crop: null,
    }

    drawScene(ctx, imagem, doc, { scale: 1, origin: { x: 0, y: 0 } })

    // A tarja entra no canvas principal antes de algum apoio ler dele.
    const primeiraTarja = chamadas.findIndex((c) => c.metodo === 'fillRect')
    const leituras = [...gravadores.entries()]
      .filter(([alvo]) => alvo !== elemento)
      .flatMap(([, g]) => doMetodo(g.chamadas, 'drawImage'))
      .filter((c) => c.args[0] === elemento)
    expect(primeiraTarja).toBeGreaterThan(-1)
    expect(leituras).toHaveLength(1)
    expect(chamadas[primeiraTarja]?.estado.fillStyle).toBe(HIDE_FILL)
    // O apoio foi escrito depois da tarja: a ordem das chamadas entre gravadores nao
    // existe, entao a prova e que a tarja ja estava no principal quando o desfoque
    // comecou — a primeira chamada do desfoque no principal vem depois dela.
    const volta = chamadas.findIndex(
      (c) => c.metodo === 'drawImage' && c.args[0] !== imagem && c.args[0] !== elemento,
    )
    expect(volta).toBeGreaterThan(primeiraTarja)
  })

  it('os canvases de apoio do desfoque sao reaproveitados de um desenho para outro', () => {
    const { ctx } = canvas(400, 400)
    const borrao: Shape = { type: 'blur', rect: { x: 0, y: 0, width: 160, height: 80 }, block: 20 }
    const criar = vi.spyOn(document, 'createElement')

    drawScene(ctx, imagem, { shapes: [borrao], crop: null }, { scale: 1, origin: { x: 0, y: 0 } })
    const primeiro = criar.mock.calls.length
    drawScene(ctx, imagem, { shapes: [borrao], crop: null }, { scale: 1, origin: { x: 0, y: 0 } })

    expect(criar.mock.calls.length).toBe(primeiro)
  })

  it('o desfoque le o pedaco do canvas e o devolve borrado, no mesmo lugar', () => {
    const { elemento, ctx, chamadas } = canvas(400, 400)
    const borrao: Shape = {
      type: 'blur',
      rect: { x: 40, y: 40, width: 160, height: 80 },
      block: 20,
    }

    drawScene(ctx, imagem, { shapes: [borrao], crop: null }, { scale: 1, origin: { x: 0, y: 0 } })

    // O primeiro apoio le do canvas principal, exatamente o pedaco marcado.
    const apoios = [...gravadores.entries()].filter(([alvo]) => alvo !== elemento)
    expect(apoios.length).toBeGreaterThan(1)
    const primeira = doMetodo(apoios[0]?.[1].chamadas ?? [], 'drawImage')[0]
    expect(primeira?.args.slice(0, 5)).toEqual([elemento, 40, 40, 160, 80])

    // O menor tem um ponto por bloco: 160/20 por 80/20.
    const menor = apoios.at(-1)?.[0]
    expect([menor?.width, menor?.height]).toEqual([8, 4])

    // E volta esticado sobre o mesmo pedaco, sem transformacao.
    const volta = doMetodo(chamadas, 'drawImage').at(-1)
    expect(volta?.args[0]).toBe(menor)
    expect(volta?.args.slice(5)).toEqual([40, 40, 160, 80])
    expect(volta?.estado.transform).toEqual([1, 0, 0, 1, 0, 0])
  })

  it('sem canvas de apoio, o desfoque cobre em vez de deixar nitido', () => {
    const { ctx, chamadas } = canvas(400, 400)
    semApoio = true
    const borrao: Shape = {
      type: 'blur',
      rect: { x: 40, y: 40, width: 160, height: 80 },
      block: 20,
    }

    drawScene(ctx, imagem, { shapes: [borrao], crop: null }, { scale: 1, origin: { x: 0, y: 0 } })

    const [coberta] = doMetodo(chamadas, 'fillRect')
    expect(coberta?.args).toEqual([40, 40, 160, 80])
    expect(coberta?.estado.fillStyle).toBe(HIDE_FILL)
  })

  it('o texto tem contorno por baixo, linha por linha', () => {
    const { ctx, chamadas } = canvas(400, 400)
    const texto: Shape = {
      type: 'text',
      at: { x: 10, y: 20 },
      text: 'um\ndois',
      color: '#ffc53d',
      size: 20,
    }

    drawScene(ctx, imagem, { shapes: [texto], crop: null }, { scale: 1, origin: { x: 0, y: 0 } })

    const escritas = chamadas.filter((c) => c.metodo === 'strokeText' || c.metodo === 'fillText')
    expect(escritas.map((c) => [c.metodo, ...c.args])).toEqual([
      ['strokeText', 'um', 10, 20],
      ['fillText', 'um', 10, 20],
      ['strokeText', 'dois', 10, 20 + 20 * LINE_HEIGHT],
      ['fillText', 'dois', 10, 20 + 20 * LINE_HEIGHT],
    ])
    // Amarelo leva contorno escuro.
    expect(escritas[0]?.estado.strokeStyle).toBe('#000000')
  })

  it('o marcador escreve o proprio numero', () => {
    const { ctx, chamadas } = canvas(400, 400)
    const marcador: Shape = {
      type: 'step',
      at: { x: 50, y: 50 },
      number: 7,
      color: '#e5484d',
      radius: 12,
    }

    drawScene(ctx, imagem, { shapes: [marcador], crop: null }, { scale: 1, origin: { x: 0, y: 0 } })

    expect(doMetodo(chamadas, 'fillText')[0]?.args[0]).toBe('7')
  })

  it('o marca-texto e um traco so, transparente', () => {
    const { ctx, chamadas } = canvas(400, 400)
    const marca: Shape = {
      type: 'highlight',
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 0, y: 0 },
      ],
      color: '#ffc53d',
      width: 18,
    }

    drawScene(ctx, imagem, { shapes: [marca], crop: null }, { scale: 1, origin: { x: 0, y: 0 } })

    const tracos = doMetodo(chamadas, 'stroke')
    expect(tracos).toHaveLength(1)
    expect(tracos[0]?.estado.globalAlpha).toBeLessThan(1)
  })

  it('o veu do recorte so aparece quando pedido', () => {
    const sem = canvas(100, 100)
    const crop = { x: 10, y: 10, width: 50, height: 50 }
    drawScene(sem.ctx, imagem, { shapes: [], crop }, { scale: 1, origin: { x: 0, y: 0 } })
    expect(doMetodo(sem.chamadas, 'fill')).toEqual([])

    const com = canvas(100, 100)
    drawScene(com.ctx, imagem, EMPTY_DOC, { scale: 1, origin: { x: 0, y: 0 } }, { cropGuide: crop })
    const [veu] = doMetodo(com.chamadas, 'fill')
    expect(veu?.args).toEqual(['evenodd'])
    expect(veu?.estado.fillStyle).toBe(CROP_SHADE)
  })
})

describe('o arquivo', () => {
  it('e o recorte, em pixels inteiros, sem o veu', () => {
    const doc: EditDoc = { shapes: [], crop: { x: 10.5, y: 20.2, width: 100, height: 50.5 } }

    const gerado = renderEdit(imagem, { width: 400, height: 300 }, doc)

    expect([gerado.width, gerado.height]).toEqual([101, 51])
    const { chamadas } = gravador(gerado)
    expect(doMetodo(chamadas, 'drawImage')[0]?.estado.transform).toEqual([1, 0, 0, 1, -10, -20])
    expect(doMetodo(chamadas, 'fill')).toEqual([])
  })

  it('sem recorte, e a imagem inteira', () => {
    expect(exportArea(EMPTY_DOC, { width: 400, height: 300 })).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    })
  })

  it('o recorte que sai da imagem para na borda dela', () => {
    expect(
      exportArea(
        { shapes: [], crop: { x: 350, y: -20, width: 200, height: 100 } },
        { width: 400, height: 300 },
      ),
    ).toEqual({ x: 350, y: 0, width: 50, height: 80 })
  })

  // Reduzido, o arquivo mistura pixels vizinhos para desenhar cada ponto: sem folga, o
  // ponto logo fora da tarja levaria um pouco do que esta dentro.
  it('so o arquivo reduzido tem folga, e ela vem da escala dele', () => {
    const tarja: Shape = { type: 'hide', rect: { x: 1000, y: 1000, width: 300, height: 200 } }
    expect(hideMarginFor({ shapes: [tarja], crop: null }, { width: 4000, height: 3000 })).toBe(0)

    // 8000x6000 sai a 0,5825: folga de 2/0,5825 + 1, arredondada para cima.
    const margem = hideMarginFor({ shapes: [tarja], crop: null }, { width: 8000, height: 6000 })
    expect(margem).toBe(Math.ceil(2 / Math.sqrt(MAX_EXPORT_PIXELS / (8000 * 6000))) + 1)

    // Recortado dentro do teto, o arquivo volta a escala 1, e a folga some.
    const recortado = { shapes: [tarja], crop: { x: 0, y: 0, width: 3000, height: 3000 } }
    expect(hideMarginFor(recortado, { width: 8000, height: 6000 })).toBe(0)
  })

  it('o arquivo reduzido desenha a tarja com a folga', () => {
    const tarja: Shape = { type: 'hide', rect: { x: 1000, y: 1000, width: 300, height: 200 } }
    const doc = { shapes: [tarja], crop: null }
    const margem = hideMarginFor(doc, { width: 8000, height: 6000 })

    const gerado = renderEdit(imagem, { width: 8000, height: 6000 }, doc)

    const escala = Math.sqrt(MAX_EXPORT_PIXELS / (8000 * 6000))
    const [x] = (doMetodo(gravador(gerado).chamadas, 'fillRect')[0]?.args ?? []) as number[]
    expect(x).toBe(Math.floor((1000 - margem) * escala))
  })

  it('grande demais, sai reduzida ate o teto, na mesma proporcao', () => {
    const gerado = renderEdit(imagem, { width: 8000, height: 6000 }, EMPTY_DOC)

    expect(gerado.width * gerado.height).toBeLessThanOrEqual(MAX_EXPORT_PIXELS)
    expect(gerado.width / gerado.height).toBeCloseTo(8000 / 6000, 2)
  })
})
