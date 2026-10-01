/**
 * A imagem desenhada vira arquivo — **no formato que menos ocupa, ou no de origem**, e
 * sempre cabendo no teto do projeto.
 *
 * **A captura sai no mais leve**: WebP e, onde o navegador nao codifica WebP (o
 * Safari, inclusive o do iPhone), JPEG. Nunca PNG: o PNG de uma tela Retina passa de
 * um megabyte, e cada byte guardado e uma conta que alguem paga.
 *
 * **A imagem editada sai no formato de origem.** Quem anexou um PNG recebe um PNG,
 * enquanto couber; o JPEG continua JPEG. Onde o navegador nao codifica o formato de
 * origem, ou o PNG nao cabe, vale o mais leve.
 *
 * **Cabe, custe a qualidade que custar — ate um ponto.** A qualidade desce em degraus
 * ate caber; sem caber nem no ultimo, a imagem encolhe e tenta de novo. So o que nao
 * cabe nem assim sai do tamanho que deu, e a recusa diz o limite.
 */

/** O formato mais leve que o navegador souber codificar. Ver o comentario do arquivo. */
export const LIGHTEST = 'lightest'

export interface EncodeOptions {
  /** O teto de imagem do projeto. Sem ele, a primeira tentativa vale. */
  maxBytes?: number
  /** `LIGHTEST`, ou o tipo da imagem de origem. */
  format?: string
  /** O nome do arquivo, sem a extensao. */
  name?: string
}

/**
 * Os degraus de qualidade dos formatos com perda. **O primeiro e o que vale quase
 * sempre**: um print de tela Retina sai em poucas centenas de kilobytes, com o texto
 * legivel. Os outros so existem para caber num teto apertado.
 */
export const QUALITY_STEPS = [0.85, 0.75, 0.6, 0.45] as const

/** Quanto a imagem encolhe quando nem o ultimo degrau cabe, e quantas vezes. */
const SHRINK = 0.75
const MAX_SHRINKS = 3

const EXTENSAO: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

/** Um jeito de codificar: o tipo, e os degraus de qualidade (PNG nao tem). */
type Tentativa = { tipo: string; qualidades: readonly (number | undefined)[] }

const WEBP: Tentativa = { tipo: 'image/webp', qualidades: QUALITY_STEPS }
const JPEG: Tentativa = { tipo: 'image/jpeg', qualidades: QUALITY_STEPS }
const PNG: Tentativa = { tipo: 'image/png', qualidades: [undefined] }

let suportaWebp: Promise<boolean> | null = null

/**
 * O navegador codifica WebP? **Descoberto uma vez, num canvas de um pixel.** Quem nao
 * codifica devolve PNG no lugar, sem erro — e perguntar com a imagem inteira custava,
 * no Safari, um PNG inteiro jogado fora a cada tentativa.
 */
function codificaWebp(): Promise<boolean> {
  suportaWebp ??= new Promise((resolve) => {
    const sonda = document.createElement('canvas')
    sonda.width = 1
    sonda.height = 1
    sonda.toBlob((blob) => resolve(blob?.type === 'image/webp'), 'image/webp')
  })
  return suportaWebp
}

/**
 * O que tentar, em ordem, num tamanho. **O PNG so no tamanho cheio**: se ele nao cabe
 * ali, uma versao com perda no tamanho cheio fica melhor do que um PNG encolhido — e o
 * PNG e o codificador mais lento.
 */
function plano(format: string, webp: boolean, nivel: number): Tentativa[] {
  const leve = webp ? WEBP : JPEG
  if (format === 'image/png') return nivel === 0 ? [PNG, leve] : [leve]
  if (format === 'image/jpeg') return [JPEG]
  // WebP de origem, a captura e o que nao se conhece: o mais leve.
  return [leve]
}

/**
 * @param canvas **E consumido**: pode ganhar fundo branco por baixo (ver
 *   `pintarFundoBranco`) e deve ser descartado depois por quem chamou.
 */
export async function canvasToImageFile(
  canvas: HTMLCanvasElement,
  { maxBytes = Number.POSITIVE_INFINITY, format = LIGHTEST, name = 'captura' }: EncodeOptions = {},
): Promise<File> {
  const webp = await codificaWebp()
  let atual = canvas
  let menor: Blob | null = null

  try {
    for (let nivel = 0; nivel <= MAX_SHRINKS; nivel++) {
      for (const tentativa of plano(format, webp, nivel)) {
        const blob = await escada(atual, tentativa, maxBytes)
        if (!blob) continue
        if (blob.size <= maxBytes) return comoArquivo(blob, name)
        if (!menor || blob.size < menor.size) menor = blob
      }
      if (nivel === MAX_SHRINKS) break

      // Sem canvas para encolher — a memoria acabou —, repetir o mesmo tamanho nao
      // mudaria nada.
      const menorCanvas = encolher(atual)
      if (!menorCanvas) break
      if (atual !== canvas) liberar(atual)
      atual = menorCanvas
    }
  } finally {
    if (atual !== canvas) liberar(atual)
  }

  // Nem encolhida coube: sai a menor, e a recusa diz o limite.
  if (menor) return comoArquivo(menor, name)
  throw new Error('Não deu para gerar a imagem.')
}

/**
 * Os degraus de um formato: o primeiro que cabe, ou o menor que saiu. Nulo quando o
 * navegador nao codifica o tipo. **Uma falha no meio nao joga fora o que ja saiu.**
 */
async function escada(
  canvas: HTMLCanvasElement,
  { tipo, qualidades }: Tentativa,
  maxBytes: number,
): Promise<Blob | null> {
  if (tipo === 'image/jpeg') pintarFundoBranco(canvas)

  let melhor: Blob | null = null
  for (const qualidade of qualidades) {
    const blob = await codificar(canvas, tipo, qualidade)
    // Falhou, ou o navegador nao codifica o tipo (devolve PNG no lugar): fica o que ja saiu.
    if (blob?.type !== tipo) break
    if (!melhor || blob.size < melhor.size) melhor = blob
    if (blob.size <= maxBytes) return blob
  }
  return melhor
}

function codificar(canvas: HTMLCanvasElement, tipo: string, qualidade?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tipo, qualidade))
}

function comoArquivo(blob: Blob, name: string): File {
  return new File([blob], `${name}.${EXTENSAO[blob.type] ?? 'img'}`, { type: blob.type })
}

/**
 * Branco **por baixo** do que ja esta no canvas: o JPEG nao tem transparencia, e o
 * transparente sairia preto. No proprio canvas, e nao numa copia — uma copia do
 * tamanho do arquivo dobraria a memoria, e no iPhone, sem memoria, a copia viria sem
 * contexto e o fundo, preto.
 */
function pintarFundoBranco(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.save()
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
}

/** A imagem, menor, num canvas novo. Nulo quando nao ha canvas para isso. */
function encolher(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const menor = document.createElement('canvas')
  menor.width = Math.max(1, Math.round(canvas.width * SHRINK))
  menor.height = Math.max(1, Math.round(canvas.height * SHRINK))
  const ctx = menor.getContext('2d')
  if (!ctx) {
    liberar(menor)
    return null
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, menor.width, menor.height)
  return menor
}

/** O Safari do iPhone so devolve a memoria do canvas zerado. */
function liberar(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}
