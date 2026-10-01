/**
 * A captura **pedida**: a pessoa clica, o navegador pergunta qual tela ou janela,
 * e ela escolhe. O que sai daqui e sempre um print — gravar a tela saiu do produto
 * junto com o video, que pesava demais no armazenamento e na entrega.
 *
 * **Nao e a captura automatica, que continua impossivel.** Codigo dentro de um
 * quadro de outra origem nao alcanca a pagina onde esta. Aqui quem decide o que
 * aparece e quem relata — o navegador mostra o seletor, e nada e capturado sem ela
 * escolher.
 *
 * **Tres limites que nao tem contorno**, e nos tres o botao some e anexar arquivo
 * continua: o iPhone nao tem `getDisplayMedia`; o site do cliente pode proibir por
 * `Permissions-Policy`; e nao se captura uma regiao direto — captura-se a tela, e
 * o recorte e nosso.
 */

/** Quanto o print espera um quadro pintado antes de ler o fluxo da tela mesmo assim. */
const FRAME_WAIT_MS = 100

/** O que o navegador e a pagina permitem, antes de mostrar o botao. */
export function canCaptureScreen(): boolean {
  if (typeof navigator === 'undefined') return false
  if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') return false

  // Onde o navegador conta, a proibicao do site do cliente aparece aqui antes do
  // clique — e o botao nem chega a existir. Onde nao conta, descobre-se no clique.
  const politica = (
    document as Document & { featurePolicy?: { allowsFeature(nome: string): boolean } }
  ).featurePolicy
  if (politica && !politica.allowsFeature('display-capture')) return false

  return true
}

/** Um retangulo em pixels. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Leva o recorte feito na tela do quadro para os pixels da captura.
 *
 * **O recorte e desenhado numa imagem reduzida, e cortado na original.** A pessoa
 * arrasta sobre uma versao que cabe no quadro; cortar nessa versao entregaria um
 * print borrado. A conta aqui devolve o mesmo pedaco na resolucao real, e nunca
 * para fora da imagem.
 */
export function toSourceRect(
  desenhado: Rect,
  exibido: { width: number; height: number },
  original: { width: number; height: number },
): Rect {
  const sx = original.width / exibido.width
  const sy = original.height / exibido.height

  const x = Math.max(0, Math.round(Math.min(desenhado.x, desenhado.x + desenhado.width) * sx))
  const y = Math.max(0, Math.round(Math.min(desenhado.y, desenhado.y + desenhado.height) * sy))
  const width = Math.min(original.width - x, Math.round(Math.abs(desenhado.width) * sx))
  const height = Math.min(original.height - y, Math.round(Math.abs(desenhado.height) * sy))

  return { x, y, width: Math.max(1, width), height: Math.max(1, height) }
}

/**
 * A recusa veio da pagina, e nao da pessoa.
 *
 * As duas chegam como `NotAllowedError`: quem fechou o seletor e o site que proibe.
 * So a segunda muda algo — o botao deve sumir, porque vai falhar sempre. A primeira
 * e a pessoa desistindo, e nao merece mensagem nenhuma.
 */
export function isBlockedByPage(falha: unknown): boolean {
  return falha instanceof Error && (falha.name === 'SecurityError' || /polic/i.test(falha.message))
}

/**
 * Pede a tela e congela **um** quadro dela.
 *
 * **O compartilhamento para logo em seguida.** Um print so precisa de um quadro, e
 * deixar a tela sendo compartilhada depois disso — com o aviso do navegador aceso —
 * faria a pessoa achar que ainda esta sendo observada.
 *
 * Tem de ser chamado **direto do clique**: o navegador so abre o seletor em
 * resposta a um gesto de quem usa.
 */
export async function captureFrame(): Promise<HTMLCanvasElement> {
  const fluxo = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })

  try {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = fluxo
    await video.play()

    // Um quadro de espera: o primeiro, logo depois de `play`, as vezes sai preto.
    //
    // **Com prazo.** Quem escolhe outra janela no seletor costuma deixar esta aba
    // encoberta, e aba encoberta nao pinta: o `requestAnimationFrame` so voltaria
    // quando a pessoa voltasse, e a captura ficaria parada ate la.
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(null))
      setTimeout(() => resolve(null), FRAME_WAIT_MS)
    })

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    return canvas
  } finally {
    for (const trilha of fluxo.getTracks()) trilha.stop()
  }
}

/**
 * Corta um pedaco da captura e devolve como arquivo de imagem.
 *
 * **WebP quando o navegador codifica.** E o que faz um print de tela inteira caber
 * no limite sem perder a leitura do texto.
 *
 * **Sem WebP, PNG — se couber.** O Safari nao codifica WebP, e o PNG de uma tela
 * Retina passa facil de 5 MB: a pessoa recortaria a tela para so entao ouvir que
 * nao cabe. Passando de `maxBytes`, vai JPEG, que cabe e ainda se le. Os tres sao
 * aceitos pela API.
 *
 * @param maxBytes O teto de imagem do projeto. Sem ele, o PNG vai como sair.
 */
export async function cropToFile(
  canvas: HTMLCanvasElement,
  recorte: Rect,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<File> {
  const saida = document.createElement('canvas')
  saida.width = recorte.width
  saida.height = recorte.height
  saida
    .getContext('2d')
    ?.drawImage(
      canvas,
      recorte.x,
      recorte.y,
      recorte.width,
      recorte.height,
      0,
      0,
      recorte.width,
      recorte.height,
    )

  const codificar = (tipo: string, qualidade?: number) =>
    new Promise<Blob | null>((resolve) => saida.toBlob(resolve, tipo, qualidade))

  const webp = await codificar('image/webp', 0.9)
  if (webp?.type === 'image/webp') return new File([webp], 'captura.webp', { type: 'image/webp' })

  // O navegador que nao codifica WebP devolve PNG no lugar, e esse ja serve.
  const png = webp?.type === 'image/png' ? webp : await codificar('image/png')
  if (png && png.size <= maxBytes) return new File([png], 'captura.png', { type: 'image/png' })

  const jpeg = await codificar('image/jpeg', 0.9)
  if (jpeg?.type === 'image/jpeg') return new File([jpeg], 'captura.jpg', { type: 'image/jpeg' })

  // Nem JPEG: o PNG grande ainda e melhor que nada, e a recusa diz o limite.
  if (png) return new File([png], 'captura.png', { type: 'image/png' })

  throw new Error('Não deu para gerar a imagem da captura.')
}
