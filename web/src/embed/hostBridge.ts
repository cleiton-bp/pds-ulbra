import type { WidgetPosition } from '@/contracts'
import {
  CAPTURE_CAPABILITY,
  type CaptureDoneMessage,
  FRAME_SIZE,
  type FrameMessage,
  type InitMessage,
  isOurMessage,
  MESSAGE_SOURCE,
} from '@/embed/protocol'

/**
 * O lado do quadro na conversa com a pagina hospedeira.
 *
 * Duas decisoes que parecem detalhe e nao sao:
 *
 * **O ouvinte entra antes de qualquer desenho.** O carregador manda o `init`
 * assim que o `iframe` carrega, e montar React primeiro abre uma janela em que a
 * mensagem chega sem ninguem escutando. Como o carregador reenvia ate o `ack`,
 * uma perda nao seria fatal — mas depender do reenvio para o caminho normal e
 * transformar a rede de seguranca em piso.
 *
 * **A origem da pagina e guardada do PRIMEIRO `init` e nunca mais muda.** Sem
 * isso, qualquer um que mande um segundo `init` reaponta para onde as respostas
 * vao. E por isso tambem que a resposta nunca sai para `event.origin`: sai sempre
 * para a origem guardada.
 *
 * O quadro **nao tenta descobrir sozinho** de quem e a pagina:
 * `location.ancestorOrigins` nao existe no Firefox e `document.referrer` some com
 * `Referrer-Policy`. A origem chega declarada, e e tratada como declaracao.
 */

/** Como terminou uma captura pedida a pagina. Ver `CaptureDoneMessage`. */
export type CaptureOutcome =
  | { outcome: 'file'; file: File }
  | { outcome: 'cancel' }
  | { outcome: 'failed' }
  | { outcome: 'unavailable' }

export interface HostConnection {
  /** O que veio no `init`. Nulo enquanto ele nao chegou. */
  readonly init: InitMessage | null
  /**
   * Guarda o canto e pede a pagina que o quadro **apareca**, recolhido.
   *
   * Enquanto isto nao for chamado o `iframe` continua invisivel do lado de la —
   * e e por isso que a ferramenta desligada nao precisa de mensagem propria: ela
   * simplesmente nunca chama.
   */
  show(position: WidgetPosition): void
  /** Pede a pagina que o quadro passe a ocupar o tamanho aberto. */
  expand(): void
  /** Pede a pagina que o quadro volte a ser so o gatilho. */
  collapse(): void
  /** Pede a pagina o tamanho do editor da imagem. `expand` volta ao formulario. */
  enlarge(): void
  /**
   * O carregador desta pagina sabe capturar uma area dela. Falso ate o `init`
   * chegar, e com o carregador antigo que nao declara — ver
   * `InitMessage.capabilities`.
   */
  readonly canCapture: boolean
  /**
   * Pede a pagina que capture uma area, e espera ela terminar. **Quem captura e a
   * pagina**: esconde o quadro, deixa a pessoa marcar e devolve o arquivo. Um pedido
   * de cada vez — o anterior que sobrou e dado por desistido.
   *
   * @param maxBytes O teto de imagem do projeto, para o formato caber nele.
   */
  capture(maxBytes: number | null): Promise<CaptureOutcome>
  /** Desliga o ouvinte. */
  stop(): void
}

/** Ha pagina hospedeira? Fora de um quadro, `window.parent` e a propria janela. */
export function isEmbedded(): boolean {
  return typeof window !== 'undefined' && window.parent !== window
}

/**
 * Liga o ouvinte e avisa quando o `init` chegar. Chame **antes** de montar a
 * interface.
 */
export function connectToHost(onInit: (message: InitMessage) => void): HostConnection {
  let hostOrigin: string | null = null
  let init: InitMessage | null = null

  // O canto so e conhecido depois que a configuracao chega. Ate la o valor nao e
  // usado, porque nada e mandado antes de `show`.
  let position: WidgetPosition = 'BottomRight'

  /** A captura pedida e ainda sem resposta. */
  let pendente: { id: string; resolve: (resultado: CaptureOutcome) => void } | null = null

  function reply(message: FrameMessage): void {
    // Sem origem guardada nao ha para quem responder — e `'*'` nao e opcao.
    if (!hostOrigin) return
    window.parent.postMessage(message, hostOrigin)
  }

  /**
   * A resposta da captura. **So depois do `init`, so da origem dele, e so a do
   * pedido em aberto** — o resto e ignorado. O arquivo que chega ainda passa por
   * tudo que um arquivo escolhido passa: o tipo pelos bytes, o limite, a API.
   */
  function receberCaptura(event: MessageEvent): void {
    if (hostOrigin === null || event.origin !== hostOrigin) return

    const message = event.data as Partial<CaptureDoneMessage>
    if (!pendente || message.id !== pendente.id) return

    const { resolve } = pendente
    pendente = null

    if (message.outcome === 'file' && message.file instanceof File)
      resolve({ outcome: 'file', file: message.file })
    else if (message.outcome === 'cancel') resolve({ outcome: 'cancel' })
    else if (message.outcome === 'unavailable') resolve({ outcome: 'unavailable' })
    else resolve({ outcome: 'failed' })
  }

  function handle(event: MessageEvent): void {
    // 1. a janela certa: outro quadro da MESMA origem nao passa por aqui.
    if (event.source !== window.parent) return
    // 2. o carimbo, que separa o nosso do barulho da pagina.
    if (!isOurMessage(event.data)) return

    if (event.data.type === 'capture-done') {
      receberCaptura(event)
      return
    }

    if (event.data.type !== 'init') return
    // 3. a origem: depois do primeiro `init`, so ela vale.
    if (hostOrigin !== null && event.origin !== hostOrigin) return

    const message = event.data as unknown as InitMessage
    if (typeof message.key !== 'string' || message.key === '') return

    if (hostOrigin === null) hostOrigin = event.origin

    // O carregador reenvia ate o `ack`; responder sempre e o que encerra o
    // reenvio quando o primeiro `ack` se perde.
    reply({ source: MESSAGE_SOURCE, type: 'ack' })

    if (init) return
    init = message
    onInit(message)
  }

  window.addEventListener('message', handle)

  return {
    get init() {
      return init
    },
    get canCapture() {
      const declarado = init?.capabilities
      return Array.isArray(declarado) && declarado.includes(CAPTURE_CAPABILITY)
    },
    show: (chosen) => {
      position = chosen
      reply({ source: MESSAGE_SOURCE, type: 'resize', ...FRAME_SIZE.collapsed, position })
    },
    expand: () =>
      reply({ source: MESSAGE_SOURCE, type: 'resize', ...FRAME_SIZE.expanded, position }),
    collapse: () =>
      reply({ source: MESSAGE_SOURCE, type: 'resize', ...FRAME_SIZE.collapsed, position }),
    enlarge: () =>
      reply({ source: MESSAGE_SOURCE, type: 'resize', ...FRAME_SIZE.editor, position }),
    capture: (maxBytes) =>
      new Promise<CaptureOutcome>((resolve) => {
        if (!hostOrigin) {
          resolve({ outcome: 'failed' })
          return
        }

        pendente?.resolve({ outcome: 'cancel' })
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        pendente = { id, resolve }
        reply({ source: MESSAGE_SOURCE, type: 'capture', id, maxBytes })
      }),
    stop: () => window.removeEventListener('message', handle),
  }
}
