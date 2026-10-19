import { sanitizeRoute } from '@/embed/config'
import { sanitizeIdentity } from '@/embed/identityToken'
import { DEFAULT_OFFSET, type LauncherFrame, launcherRadius } from '@/embed/launcher'
import {
  CAPTURE_CAPABILITY,
  type CaptureDoneMessage,
  FRAME_SIZE,
  type FrameMessage,
  HOST_LAUNCHER,
  type InitMessage,
  isOurMessage,
  isPreviewFormPart,
  MESSAGE_SOURCE,
  type OpenMessage,
  type PreviewMessage,
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
 * **De quem e a pagina, o quadro pergunta ao navegador**, e nao a ela: primeiro
 * `location.ancestorOrigins` (que nao existe no Firefox), depois a origem que o
 * navegador carimbou no `init` — a mesma que esta ponte guarda. A que o carregador
 * declara so vale sem as duas. Ver `configFromInit`.
 *
 * **O caminho da pagina acompanha cada abertura** (`OpenMessage.route`): o quadro vive
 * enquanto o site troca de pagina sem recarregar, e o do `init` envelhece.
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
   * O caminho da pagina na ultima abertura (`OpenMessage.route`), ja sem `?` e `#`.
   * **Indefinido** enquanto nenhuma abertura disse — ai vale o do `init`. Opcional: a
   * previa do painel nao tem pagina.
   */
  readonly route?: string | null
  /**
   * O cracha da pessoa, assinado pelo servidor do cliente — o `data-identity` do
   * script, so no projeto que herda a identidade. O da ultima abertura
   * (`OpenMessage.identity`), ou o do `init` enquanto nenhuma abertura disse. Nulo
   * sem cracha. Opcional: a previa do painel nao tem pagina.
   */
  readonly identity?: string | null
  /**
   * Guarda como o botao e e onde ele fica — o tamanho do quadro recolhido, o canto, a
   * distancia, os cantos e a sombra. Com o quadro ja a mostra, a pagina recebe na hora:
   * e o que faz a previa do painel acompanhar o que se escolhe.
   */
  place(launcher: LauncherFrame): void
  /**
   * Pede a pagina que o quadro **apareca**, recolhido, com o ultimo `place`. Depois
   * da primeira vez, so repete o tamanho de agora — nunca fecha o formulario aberto.
   *
   * Enquanto isto nao for chamado o `iframe` continua invisivel do lado de la —
   * e e por isso que a ferramenta desligada nao precisa de mensagem propria: ela
   * simplesmente nunca chama.
   */
  show(): void
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
  /**
   * O botao parado na pagina e da pagina, e nao do quadro — ver `InitMessage.launcher`.
   * Verdadeiro, o quadro nasce no formulario, nunca desenha o proprio botao, e fechar
   * vira `close`. **Opcional**: ausente e falso, o quadro de sempre.
   */
  readonly hostDrawsLauncher?: boolean
  /** Diz a pagina que a pessoa fechou o formulario. So com `hostDrawsLauncher`. */
  close?(): void
  /** Diz a pagina que nao ha o que abrir aqui. So com `hostDrawsLauncher`. */
  unavailable?(): void
  /**
   * Avisa a cada vez que a pagina pede para abrir (`OpenMessage`). Devolve como
   * desinscrever.
   */
  onOpen?(listener: (options?: OpenOptions) => void): () => void
  /** Desliga o ouvinte. */
  stop(): void
}

/**
 * O tamanho que o quadro pede a cada momento — recolhido, aberto ou com o editor — e o
 * lugar dele. **Uma maquina so para a pagina do cliente e para a previa do painel**:
 * as duas recebem as mesmas mensagens, e so muda para quem elas vao.
 */
function frameControls(reply: (message: FrameMessage) => void) {
  // O botao de sempre ate o primeiro `place`. Nada sai antes de `show`, entao o valor
  // so importa para quem nunca chamar `place` — o quadro antigo dos testes.
  let launcher: LauncherFrame = {
    ...FRAME_SIZE.collapsed,
    position: 'BottomRight',
    offsetX: DEFAULT_OFFSET,
    offsetY: DEFAULT_OFFSET,
    radius: launcherRadius('Pill').frame,
    shadow: false,
  }
  let estado: 'hidden' | 'collapsed' | 'expanded' | 'editor' = 'hidden'

  function send(): void {
    if (estado === 'hidden') return

    if (estado === 'collapsed') {
      reply({ source: MESSAGE_SOURCE, type: 'resize', ...launcher })
      return
    }

    // Aberto, o canto e a distancia sao os do botao: o formulario sai de onde ele esta.
    const tamanho = estado === 'editor' ? FRAME_SIZE.editor : FRAME_SIZE.expanded
    reply({
      source: MESSAGE_SOURCE,
      type: 'resize',
      ...tamanho,
      position: launcher.position,
      offsetX: launcher.offsetX,
      offsetY: launcher.offsetY,
    })
  }

  return {
    place: (proximo: LauncherFrame) => {
      launcher = proximo
      send()
    },
    show: () => {
      if (estado === 'hidden') estado = 'collapsed'
      send()
    },
    expand: () => {
      estado = 'expanded'
      send()
    },
    collapse: () => {
      estado = 'collapsed'
      send()
    },
    enlarge: () => {
      estado = 'editor'
      send()
    },
    close: () => reply({ source: MESSAGE_SOURCE, type: 'close' }),
    unavailable: () => reply({ source: MESSAGE_SOURCE, type: 'unavailable' }),
  }
}

/** Os que pediram aviso de abertura. Ver `HostConnection.onOpen`. */
/** Como abrir: com o foco no formulario, ou sem tira-lo da pagina (a previa que abre sozinha). */
export interface OpenOptions {
  focus: boolean
}

function openListeners() {
  const ouvintes = new Set<(options?: OpenOptions) => void>()
  return {
    notify: (options: OpenOptions = { focus: true }) => {
      for (const ouvinte of ouvintes) ouvinte(options)
    },
    onOpen: (listener: (options?: OpenOptions) => void) => {
      ouvintes.add(listener)
      return () => {
        ouvintes.delete(listener)
      }
    },
  }
}

/** Ha pagina hospedeira? Fora de um quadro, `window.parent` e a propria janela. */
export function isEmbedded(): boolean {
  return typeof window !== 'undefined' && window.parent !== window
}

/**
 * Liga o ouvinte e avisa quando o `init` chegar. Chame **antes** de montar a
 * interface.
 */
export function connectToHost(
  onInit: (message: InitMessage, origin: string) => void,
): HostConnection {
  let hostOrigin: string | null = null
  let init: InitMessage | null = null
  /** O caminho que veio com a ultima abertura. Ver `HostConnection.route`. */
  let rota: string | null | undefined
  /** O cracha que veio com a ultima abertura. Ver `HostConnection.identity`. */
  let cracha: string | null | undefined

  /** A captura pedida e ainda sem resposta. */
  let pendente: { id: string; resolve: (resultado: CaptureOutcome) => void } | null = null

  const aberturas = openListeners()

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

    // O pedido de abrir vale o mesmo que a captura: so depois do `init`, e so da
    // origem dele.
    if (event.data.type === 'open') {
      if (hostOrigin !== null && event.origin === hostOrigin) {
        // O caminho passa pelo mesmo corte do `init`: quem confere e quem recebe. Fora
        // de texto, fica o que ja havia — o carregador antigo nao manda nada.
        const pedido = (event.data as Partial<OpenMessage>).route
        if (typeof pedido === 'string' || pedido === null) rota = sanitizeRoute(pedido)
        // O cracha tambem: o site pode ter renovado a sessao, e a pessoa pode ter
        // entrado ou saido sem recarregar. Ausente, fica o que ja havia.
        const apresentado = (event.data as Partial<OpenMessage>).identity
        if (typeof apresentado === 'string' || apresentado === null)
          cracha = sanitizeIdentity(apresentado)
        aberturas.notify()
      }
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
    onInit(message, hostOrigin)
  }

  window.addEventListener('message', handle)

  const controles = frameControls(reply)

  return {
    get init() {
      return init
    },
    get route() {
      return rota
    },
    get identity() {
      return cracha !== undefined ? cracha : sanitizeIdentity(init?.identity)
    },
    get canCapture() {
      const declarado = init?.capabilities
      return Array.isArray(declarado) && declarado.includes(CAPTURE_CAPABILITY)
    },
    get hostDrawsLauncher() {
      return init?.launcher === HOST_LAUNCHER
    },
    onOpen: aberturas.onOpen,
    ...controles,
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

/**
 * O lado do quadro **na previa do painel** (`embed.html?preview`): recebe a
 * configuracao ainda nao publicada e pede tamanho ao painel, que faz o papel do
 * carregador numa pagina de mentira — inclusive desenhando o botao, com o mesmo codigo.
 *
 * **So a janela de cima, e so da mesma origem** — o painel e o quadro saem do mesmo
 * endereco. Qualquer outra mensagem e ignorada: sem isso, qualquer site poderia
 * enquadrar a previa e fazer o nosso endereco mostrar o texto que quisesse. As
 * respostas tambem so saem para a propria origem.
 *
 * A previa nao captura, nao le nem grava nada: `canCapture` e falso, e o formulario
 * recebe `preview` e nunca envia.
 */
export function connectToPreviewPanel(
  onSettings: (message: PreviewMessage) => void,
): HostConnection {
  const origem = window.location.origin

  function reply(message: FrameMessage): void {
    window.parent.postMessage(message, origem)
  }

  const aberturas = openListeners()

  function handle(event: MessageEvent): void {
    if (event.source !== window.parent) return
    if (event.origin !== origem) return
    if (!isOurMessage(event.data)) return

    // O painel desenha o botao com o mesmo codigo do carregador, e pede para abrir
    // como ele pede.
    if (event.data.type === 'open') {
      aberturas.notify({ focus: (event.data as Partial<OpenMessage>).focus !== false })
      return
    }

    if (event.data.type !== 'preview') return

    const message = event.data as unknown as PreviewMessage
    if (typeof message.settings !== 'object' || message.settings === null) return

    // O contorno so passa se for uma das partes conhecidas: qualquer outro valor vira
    // "nada a contornar", e nao chega ao desenho.
    onSettings({
      ...message,
      highlight: isPreviewFormPart(message.highlight) ? message.highlight : null,
    })
  }

  window.addEventListener('message', handle)

  // O painel pode ter mandado antes de este ouvinte existir: avisar que chegou e o
  // que o faz mandar de novo.
  reply({ source: MESSAGE_SOURCE, type: 'preview-ready' })

  return {
    init: null,
    canCapture: false,
    // Como no site do cliente: o botao e do painel, que usa o desenho do carregador.
    hostDrawsLauncher: true,
    onOpen: aberturas.onOpen,
    ...frameControls(reply),
    capture: () => Promise.resolve({ outcome: 'unavailable' }),
    stop: () => window.removeEventListener('message', handle),
  }
}
