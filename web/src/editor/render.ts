import type { EditDoc, Point, Rect, Shape } from '@/editor/doc'
import { CROP_EDGE, CROP_SHADE, contrastOf, HIDE_FILL } from '@/editor/palette'

/**
 * O desenho da imagem com as marcas — **o mesmo na tela e no arquivo**.
 *
 * Uma funcao desenha as duas coisas, e e isso que garante que o arquivo e o que a
 * pessoa viu. So muda a escala: na tela a imagem cabe no palco; no arquivo ela sai
 * no tamanho dela.
 *
 * **Ocultar e desfocar trabalham no pixel do canvas**, e nao no da imagem, com as
 * bordas arredondadas para fora. Uma borda de meio pixel sairia misturada — um fio
 * do que estava embaixo, tingido de preto, em volta da tarja.
 */

/** Quantos pixels do canvas por pixel da imagem, e de que ponto da imagem o canvas comeca. */
export interface View {
  scale: number
  origin: Point
}

export interface SceneExtras {
  /** A marca sendo desenhada, antes de a pessoa soltar. */
  draft?: Shape | null
  /** O recorte a mostrar. **So na tela**: no arquivo, o recorte e o tamanho do canvas. */
  cropGuide?: Rect | null
  /**
   * A folga da tarja, em pixels da imagem — ver `hideMarginFor`. **A mesma na tela e no
   * arquivo**: a tela nao pode mostrar mais cobertura do que o arquivo vai ter.
   */
  hideMargin?: number
}

export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** A altura da linha do texto, em relacao ao tamanho da letra. */
export const LINE_HEIGHT = 1.25

/** O marca-texto deixa ver o que esta embaixo. */
const HIGHLIGHT_ALPHA = 0.35

type Contexto = CanvasRenderingContext2D

export function drawScene(
  ctx: Contexto,
  image: CanvasImageSource,
  doc: EditDoc,
  view: View,
  { draft = null, cropGuide = null, hideMargin = 0 }: SceneExtras = {},
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  naImagem(ctx, view)
  ctx.drawImage(image, 0, 0)

  const marcas = draft ? [...doc.shapes, draft] : doc.shapes

  // **As tarjas primeiro, todas.** O desfoque le o proprio canvas: feito antes de uma
  // tarja que o cruza, ele espalharia pelos blocos de fora a media do que a tarja
  // cobre depois. Com as tarjas ja pintadas, ele so le preto.
  for (const shape of marcas) if (shape.type === 'hide') drawHide(ctx, shape.rect, view, hideMargin)

  // Depois, na ordem em que foram feitas — a tarja de novo no lugar dela: o que veio
  // depois fica por cima, o que veio antes fica coberto.
  for (const shape of marcas) drawShape(ctx, shape, view, hideMargin)

  if (cropGuide) drawCropGuide(ctx, cropGuide, view)
}

/** Passa a desenhar em pixels da imagem. */
function naImagem(ctx: Contexto, view: View) {
  ctx.setTransform(
    view.scale,
    0,
    0,
    view.scale,
    -view.origin.x * view.scale,
    -view.origin.y * view.scale,
  )
}

/** O retangulo em pixels do canvas: arredondado para fora, e cortado nas bordas dele. */
export function toCanvasRect(
  rect: Rect,
  view: View,
  canvas: { width: number; height: number },
): Rect {
  const x0 = Math.max(0, Math.floor((rect.x - view.origin.x) * view.scale))
  const y0 = Math.max(0, Math.floor((rect.y - view.origin.y) * view.scale))
  const x1 = Math.min(canvas.width, Math.ceil((rect.x + rect.width - view.origin.x) * view.scale))
  const y1 = Math.min(canvas.height, Math.ceil((rect.y + rect.height - view.origin.y) * view.scale))
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) }
}

function drawShape(ctx: Contexto, shape: Shape, view: View, hideMargin: number) {
  if (shape.type === 'hide') {
    drawHide(ctx, shape.rect, view, hideMargin)
    return
  }
  if (shape.type === 'blur') {
    drawBlur(ctx, shape.rect, shape.block, view, hideMargin)
    return
  }

  ctx.save()
  naImagem(ctx, view)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (shape.type) {
    case 'arrow':
      drawArrow(ctx, shape.from, shape.to, shape.color, shape.width)
      break
    case 'rect':
      ctx.strokeStyle = shape.color
      ctx.lineWidth = shape.width
      ctx.strokeRect(shape.rect.x, shape.rect.y, shape.rect.width, shape.rect.height)
      break
    case 'ellipse': {
      const { x, y, width, height } = shape.rect
      ctx.strokeStyle = shape.color
      ctx.lineWidth = shape.width
      ctx.beginPath()
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'pen':
      drawStroke(ctx, shape.points, shape.color, shape.width)
      break
    case 'highlight':
      // Um traco so: onde ele cruza a si mesmo, a cor nao escurece em dobro.
      ctx.globalAlpha = HIGHLIGHT_ALPHA
      drawStroke(ctx, shape.points, shape.color, shape.width)
      break
    case 'text':
      drawText(ctx, shape.at, shape.text, shape.color, shape.size)
      break
    case 'step':
      drawStep(ctx, shape.at, shape.number, shape.color, shape.radius)
      break
  }

  ctx.restore()
}

/**
 * A tarja: preta, opaca, por cima do pixel inteiro. **E o que tira o dado da imagem**
 * — o arquivo e desenhado de novo, e o que estava embaixo nao existe nele.
 */
function drawHide(ctx: Contexto, rect: Rect, view: View, folga: number) {
  const alvo = toCanvasRect(
    {
      x: rect.x - folga,
      y: rect.y - folga,
      width: rect.width + folga * 2,
      height: rect.height + folga * 2,
    },
    view,
    ctx.canvas,
  )
  if (alvo.width === 0 || alvo.height === 0) return

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = HIDE_FILL
  ctx.fillRect(alvo.x, alvo.y, alvo.width, alvo.height)
  ctx.restore()
}

/**
 * O desfoque: o pedaco encolhe ate cada ponto valer um bloco inteiro, e estica de
 * volta. **Pela metade de cada vez**: encolher de uma vez so leria alguns pixels e
 * pularia os outros — o borrao sairia granulado, com pedacos do original intactos.
 *
 * Sem `filter` do canvas, que o Safari nao tem: assim o borrao e o mesmo em todo
 * navegador. **Sem canvas de apoio, cobre** — um pedaco que a pessoa mandou borrar
 * nao pode ir nitido.
 */
function drawBlur(ctx: Contexto, rect: Rect, block: number, view: View, folga: number) {
  const alvo = toCanvasRect(rect, view, ctx.canvas)
  if (alvo.width === 0 || alvo.height === 0) return

  const passo = Math.max(2, block * view.scale)
  const final = {
    width: Math.max(1, Math.round(alvo.width / passo)),
    height: Math.max(1, Math.round(alvo.height / passo)),
  }

  let fonte: CanvasImageSource = ctx.canvas
  let de: Rect = alvo
  let nivel = 0

  while (de.width > final.width || de.height > final.height) {
    const largura = Math.max(final.width, Math.ceil(de.width / 2))
    const altura = Math.max(final.height, Math.ceil(de.height / 2))
    const menor = canvasDeApoio(nivel, largura, altura)
    nivel += 1
    const apoio = menor.getContext('2d')
    if (!apoio) {
      drawHide(ctx, rect, view, folga)
      return
    }
    apoio.imageSmoothingEnabled = true
    apoio.imageSmoothingQuality = 'high'
    // Reaproveitado, o canvas guarda o desenho anterior: numa imagem com transparencia,
    // ele apareceria por baixo.
    apoio.clearRect(0, 0, largura, altura)
    apoio.drawImage(fonte, de.x, de.y, de.width, de.height, 0, 0, largura, altura)
    fonte = menor
    de = { x: 0, y: 0, width: largura, height: altura }
  }

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(fonte, de.x, de.y, de.width, de.height, alvo.x, alvo.y, alvo.width, alvo.height)
  ctx.restore()
}

function drawArrow(ctx: Contexto, from: Point, to: Point, color: string, width: number) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const comprimento = Math.hypot(dx, dy)
  if (comprimento === 0) return

  // A ponta cresce com a espessura, mas nunca passa de mais da metade da seta.
  const ponta = Math.min(width * 4.5, comprimento * 0.6)
  const angulo = Math.atan2(dy, dx)
  const abertura = 0.45

  // A haste acaba dentro da ponta: a ponta arredondada da linha nao aparece na frente.
  const base = {
    x: to.x - Math.cos(angulo) * ponta * 0.7,
    y: to.y - Math.sin(angulo) * ponta * 0.7,
  }

  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(base.x, base.y)
  ctx.stroke()

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - Math.cos(angulo - abertura) * ponta, to.y - Math.sin(angulo - abertura) * ponta)
  ctx.lineTo(to.x - Math.cos(angulo + abertura) * ponta, to.y - Math.sin(angulo + abertura) * ponta)
  ctx.closePath()
  ctx.fill()
}

function drawStroke(ctx: Contexto, points: Point[], color: string, width: number) {
  const [primeiro, ...resto] = points
  if (!primeiro) return

  // Um toque sem arrastar e um ponto, e nao nada.
  if (resto.length === 0) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(primeiro.x, primeiro.y, width / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(primeiro.x, primeiro.y)
  for (const ponto of resto) ctx.lineTo(ponto.x, ponto.y)
  ctx.stroke()
}

/** O texto com contorno: legivel em cima de qualquer print, claro ou escuro. */
function drawText(ctx: Contexto, at: Point, text: string, color: string, size: number) {
  ctx.font = `600 ${size}px ${FONT_FAMILY}`
  ctx.textBaseline = 'top'
  ctx.lineWidth = Math.max(1, size * 0.2)
  ctx.strokeStyle = contrastOf(color)
  ctx.fillStyle = color

  text.split('\n').forEach((linha, indice) => {
    const y = at.y + indice * size * LINE_HEIGHT
    ctx.strokeText(linha, at.x, y)
    ctx.fillText(linha, at.x, y)
  })
}

function drawStep(ctx: Contexto, at: Point, numero: number, color: string, radius: number) {
  const contraste = contrastOf(color)

  ctx.fillStyle = color
  ctx.strokeStyle = contraste
  ctx.lineWidth = radius * 0.16
  ctx.beginPath()
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = contraste
  ctx.font = `700 ${radius * (numero > 9 ? 0.95 : 1.15)}px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(numero), at.x, at.y + radius * 0.06)
}

/** O que fica fora do recorte, escurecido, e a borda dele. So na tela. */
function drawCropGuide(ctx: Contexto, crop: Rect, view: View) {
  const { canvas } = ctx
  const alvo = toCanvasRect(crop, view, canvas)

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = CROP_SHADE
  ctx.beginPath()
  ctx.rect(0, 0, canvas.width, canvas.height)
  ctx.rect(alvo.x, alvo.y, alvo.width, alvo.height)
  ctx.fill('evenodd')

  ctx.strokeStyle = CROP_EDGE
  ctx.lineWidth = 2
  ctx.setLineDash([8, 6])
  ctx.strokeRect(alvo.x + 1, alvo.y + 1, Math.max(0, alvo.width - 2), Math.max(0, alvo.height - 2))
  ctx.restore()
}

/**
 * O maior arquivo que o editor desenha, em pixels. **E o teto do Safari no iPhone**:
 * acima dele o canvas volta vazio, sem erro — e o arquivo sairia em branco. Uma foto
 * maior sai reduzida ate caber, com as marcas no mesmo lugar.
 */
export const MAX_EXPORT_PIXELS = 4096 * 4096

/** O pedaco da imagem que vai para o arquivo: o recorte, em pixels inteiros, dentro dela. */
export function exportArea(doc: EditDoc, size: { width: number; height: number }): Rect {
  const area = doc.crop ?? { x: 0, y: 0, width: size.width, height: size.height }
  const x0 = Math.min(Math.max(Math.floor(area.x), 0), size.width - 1)
  const y0 = Math.min(Math.max(Math.floor(area.y), 0), size.height - 1)
  const x1 = Math.min(Math.max(Math.ceil(area.x + area.width), x0 + 1), size.width)
  const y1 = Math.min(Math.max(Math.ceil(area.y + area.height), y0 + 1), size.height)
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/** A escala do arquivo: 1, ou menos quando o recorte passa do teto de pixels. */
function exportScale(area: Rect): number {
  return Math.min(1, Math.sqrt(MAX_EXPORT_PIXELS / (area.width * area.height)))
}

/**
 * A folga da tarja, em pixels da imagem. **Reduzida, a imagem mistura pixels
 * vizinhos** para desenhar cada ponto do arquivo — e o ponto logo fora da tarja
 * levaria um pouco do que esta dentro. A folga cobre esse alcance. So existe quando
 * o arquivo sai reduzido: a foto grande demais para o teto.
 *
 * **Vem da escala do arquivo, e nao da tela.** A tela quase sempre mostra a imagem
 * reduzida; com a folga dela, a tarja apareceria maior do que sai — e a pessoa
 * encostaria a tarja na senha contando com uma cobertura que o arquivo nao tem.
 */
export function hideMarginFor(doc: EditDoc, size: { width: number; height: number }): number {
  const escala = exportScale(exportArea(doc, size))
  return escala < 1 ? Math.ceil(2 / escala) + 1 : 0
}

/** A imagem com as marcas, no tamanho dela e so com o recorte, num canvas novo. */
export function renderEdit(
  image: CanvasImageSource,
  size: { width: number; height: number },
  doc: EditDoc,
): HTMLCanvasElement {
  const area = exportArea(doc, size)
  const escala = exportScale(area)

  // Para baixo: arredondar para cima passaria do teto por uma fileira de pixels.
  const canvas = createCanvas(
    Math.max(1, Math.floor(area.width * escala)),
    Math.max(1, Math.floor(area.height * escala)),
  )
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('O navegador não deu um canvas para desenhar a imagem.')

  drawScene(
    ctx,
    image,
    doc,
    { scale: escala, origin: { x: area.x, y: area.y } },
    { hideMargin: hideMarginFor(doc, size) },
  )
  return canvas
}

/**
 * Os canvases de apoio do desfoque, **reaproveitados**: um por nivel de reducao. O
 * desfoque roda a cada quadro de um gesto, e um canvas novo por quadro estoura a
 * memoria de canvas do Safari no iPhone — ai o `getContext` volta nulo.
 */
const apoios: HTMLCanvasElement[] = []

/**
 * Devolve a memoria dos canvases de apoio. Depois de gerar o arquivo eles ficam do
 * tamanho do arquivo — e guardando, pela metade, o pedaco que a pessoa mandou borrar.
 * A tela os refaz do tamanho dela no proximo desenho.
 */
export function releaseScratch(): void {
  for (const apoio of apoios) {
    apoio.width = 0
    apoio.height = 0
  }
  apoios.length = 0
}

function canvasDeApoio(nivel: number, width: number, height: number): HTMLCanvasElement {
  const existente = apoios[nivel]
  if (!existente) {
    const novo = createCanvas(width, height)
    apoios[nivel] = novo
    return novo
  }
  // Mudar o tamanho limpa o canvas; o mesmo tamanho, nao — e o desenho cobre tudo.
  if (existente.width !== width) existente.width = width
  if (existente.height !== height) existente.height = height
  return existente
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}
