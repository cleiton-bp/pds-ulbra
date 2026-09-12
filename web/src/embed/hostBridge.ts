import type { WidgetPosition } from '@/contracts'
import {
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

  function reply(message: FrameMessage): void {
    // Sem origem guardada nao ha para quem responder — e `'*'` nao e opcao.
    if (!hostOrigin) return
    window.parent.postMessage(message, hostOrigin)
  }

  function handle(event: MessageEvent): void {
    // 1. a janela certa: outro quadro da MESMA origem nao passa por aqui.
    if (event.source !== window.parent) return
    // 2. o carimbo, que separa o nosso do barulho da pagina.
    if (!isOurMessage(event.data)) return
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
    show: (chosen) => {
      position = chosen
      reply({ source: MESSAGE_SOURCE, type: 'resize', ...FRAME_SIZE.collapsed, position })
    },
    expand: () =>
      reply({ source: MESSAGE_SOURCE, type: 'resize', ...FRAME_SIZE.expanded, position }),
    collapse: () =>
      reply({ source: MESSAGE_SOURCE, type: 'resize', ...FRAME_SIZE.collapsed, position }),
    stop: () => window.removeEventListener('message', handle),
  }
}
