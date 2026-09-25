/**
 * A captura **pedida**: a pessoa clica, o navegador pergunta qual tela ou janela,
 * e ela escolhe.
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

/** Quanto o print espera um quadro pintado antes de ler o video mesmo assim. */
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

/** O navegador sabe gravar video. So entao o botao de gravar aparece. */
export function canRecordScreen(): boolean {
  return canCaptureScreen() && typeof MediaRecorder !== 'undefined' && pickVideoType() !== null
}

/**
 * O formato de gravacao, do mais economico para o menos.
 *
 * **So WebM**, porque e o unico video que a API aceita. VP9 primeiro: na mesma
 * qualidade ocupa bem menos que VP8, e "o minimo de espaco que ainda deixa ler a
 * tela" foi o pedido.
 */
export function pickVideoType(
  suporta: (tipo: string) => boolean = (tipo) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(tipo),
): string | null {
  for (const tipo of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (suporta(tipo)) return tipo
  }
  return null
}

/**
 * A taxa de bits que cabe no limite do projeto.
 *
 * **Deriva do teto, e nao o contrario.** Com o teto e a duracao maxima, da para
 * saber quanto cada segundo pode ocupar — e gravar abaixo disso faz o video caber
 * de fabrica, em vez de gravar um minuto e ouvir no fim que passou do limite. A
 * margem de 15% e para o cabecalho do arquivo e para a taxa, que oscila.
 *
 * Tela e quase sempre texto parado, e 1,2 Mbps a 15 quadros ja le bem em 720p; o
 * teto evita gastar mais so porque o limite deixaria.
 */
export function bitrateFor(maxBytes: number, maxSeconds: number): number {
  const cabe = Math.floor((maxBytes * 8 * 0.85) / Math.max(1, maxSeconds))
  return Math.max(150_000, Math.min(1_200_000, cabe))
}

/**
 * O tipo que vai para a API, sem os parametros de codec.
 *
 * `video/webm;codecs=vp9` e o que o gravador diz, e a API aceita `video/webm` —
 * exatamente. O tipo declarado entra na assinatura do envio, e um parametro a mais
 * faria a permissao ser recusada.
 */
export function baseType(tipo: string): string {
  return tipo.split(';')[0]?.trim().toLowerCase() ?? tipo
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
 * **WebP quando o navegador codifica, PNG quando nao.** Os dois sao aceitos pela
 * API; o WebP e o que faz um print de tela inteira caber no limite de 5 MB sem
 * perder a leitura do texto.
 */
export async function cropToFile(canvas: HTMLCanvasElement, recorte: Rect): Promise<File> {
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

  const blob = await new Promise<Blob | null>((resolve) => saida.toBlob(resolve, 'image/webp', 0.9))
  if (!blob) throw new Error('Não deu para gerar a imagem da captura.')

  const tipo = blob.type === 'image/webp' ? 'image/webp' : 'image/png'
  return new File([blob], tipo === 'image/webp' ? 'captura.webp' : 'captura.png', { type: tipo })
}

/** Uma gravacao em andamento. */
export interface Recording {
  /** Termina agora. O resultado chega por `done`. */
  stop(): void
  /** O video, e quantos segundos ele tem — contados aqui, e nao lidos do arquivo. */
  done: Promise<{ file: File; durationSeconds: number }>
}

/**
 * Grava a tela, **sem som** e em qualidade baixa de proposito.
 *
 * **Sem audio.** E gravacao de tela para mostrar um erro, e o microfone ligado
 * levaria junto a conversa da sala — dado de terceiro que ninguem pediu para
 * mandar.
 *
 * **Para sozinha na duracao maxima**, e tambem quando a pessoa encerra o
 * compartilhamento pelo proprio navegador. E a duracao vem do relogio daqui:
 * video gravado pelo navegador sai sem duracao no cabecalho, e le-la depois exige
 * percorrer o arquivo inteiro.
 *
 * Tem de ser chamada **direto do clique**, pelo mesmo motivo de `captureFrame`.
 */
export async function recordScreen(options: {
  maxSeconds: number
  maxBytes: number
  onTick?: (segundos: number) => void
}): Promise<Recording> {
  const tipo = pickVideoType()
  if (!tipo) throw new Error('Este navegador não sabe gravar a tela.')

  const fluxo = await navigator.mediaDevices.getDisplayMedia({
    video: { width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 15 } },
    audio: false,
  })

  const gravador = new MediaRecorder(fluxo, {
    mimeType: tipo,
    videoBitsPerSecond: bitrateFor(options.maxBytes, options.maxSeconds),
  })

  const pedacos: Blob[] = []
  const inicio = Date.now()
  let tique: ReturnType<typeof setInterval> | undefined

  const done = new Promise<{ file: File; durationSeconds: number }>((resolve, reject) => {
    gravador.ondataavailable = (evento) => {
      if (evento.data.size > 0) pedacos.push(evento.data)
    }
    gravador.onerror = () => reject(new Error('A gravação falhou.'))
    gravador.onstop = () => {
      clearInterval(tique)
      for (const trilha of fluxo.getTracks()) trilha.stop()

      const segundos = Math.max(
        1,
        Math.min(options.maxSeconds, Math.round((Date.now() - inicio) / 1000)),
      )
      const tipoBase = baseType(tipo)
      resolve({
        file: new File(pedacos, 'gravacao.webm', { type: tipoBase }),
        durationSeconds: segundos,
      })
    }
  })

  const parar = () => {
    if (gravador.state !== 'inactive') gravador.stop()
  }

  // A pessoa encerrou o compartilhamento pelo botao do navegador.
  for (const trilha of fluxo.getVideoTracks()) trilha.onended = parar

  tique = setInterval(() => {
    const segundos = Math.floor((Date.now() - inicio) / 1000)
    options.onTick?.(segundos)
    if (segundos >= options.maxSeconds) parar()
  }, 250)

  // Pedacos de um segundo: se o navegador fechar no meio, o que ja foi gravado nao
  // se perde inteiro.
  gravador.start(1000)

  return { stop: parar, done }
}
