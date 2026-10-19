import { CAPTURE_GLOBAL, type CaptureModule } from '@/capture/area'
import {
  placeFrame,
  readLauncherAppearance,
  readResize,
  type WidgetLauncherViewModel,
} from '@/embed/launcher'
import {
  CAPTURE_CAPABILITY,
  type CaptureRequestMessage,
  FRAME_SIZE,
  HOST_LAUNCHER,
  type InitMessage,
  isOurMessage,
  MESSAGE_SOURCE,
  type OpenMessage,
  type ResizeMessage,
} from '@/embed/protocol'
import { openAreaPicker } from '@/loader/areaPicker'
import { createCaptureHandler } from '@/loader/captureFlow'
import { createLauncherView, type LauncherView } from '@/loader/launcherView'

/**
 * O CARREGADOR — a unica linha que o cliente cola no site dele.
 *
 * <script src="https://.../v1/pds.js" data-key="pk_..." defer></script>
 *
 * **Nada pesado ate alguem pedir.** O carregador le so a aparencia do botao (uma
 * resposta pequena, guardada cinco minutos pelo navegador) e desenha o botao ele mesmo,
 * num elemento so, dentro de uma sombra fechada — ver `launcherView`. O quadro, com o
 * formulario e tudo que ele arrasta, so e criado quando a pessoa pede para abrir; passar
 * o mouse, focar ou tocar no botao ja o adianta, escondido, para o clique parecer
 * instantaneo. Ate o quadro responder, o carregador mostra a tela de "abrindo".
 *
 * **O cliente pode dispensar o nosso botao** (`data-button="none"`) e abrir pelo dele:
 * `Pds.open()`, ou qualquer elemento com `data-pds-open`. Ai nao sai requisicao
 * nenhuma ate alguem pedir.
 *
 * **A excecao e a captura**, e so quando a pessoa pede: codigo dentro de um quadro
 * de outra origem nao alcanca a pagina, entao quem captura e o carregador. Ele
 * desenha a camada de marcar a area — numa sombra, com o proprio estilo — e baixa
 * a biblioteca que redesenha a pagina so nesse clique. Ver `captureFlow`.
 *
 * Tres cuidados que a origem cruzada exige:
 *
 * **A origem sai do proprio `src`.** Nao ha valor fixo no codigo: o carregador
 * serve-se de onde quer que tenha sido servido. Trocar de dominio deixa de ser
 * publicar versao nova.
 *
 * **O `init` e reenviado ate o `ack`.** O `onload` de um `iframe` de outra origem
 * e a peca mais fragil deste caminho — em alguns navegadores ele dispara antes de
 * o script de dentro rodar. Reenviar resolve sem depender de quem dispara
 * primeiro.
 *
 * **Toda mensagem recebida passa por tres conferencias.** A terceira,
 * `event.source === iframe.contentWindow`, e a que impede outro quadro da mesma
 * origem de se passar pelo nosso — e a que costuma faltar.
 */

const script = document.currentScript as HTMLScriptElement | null

/** Sem chave nao ha o que abrir, e falhar calado e pior do que nao carregar. */
const key = script?.dataset.key?.trim() ?? ''

/** A origem de onde ESTE arquivo veio, que e tambem de onde o quadro vem. */
const origin = script ? new URL(script.src, window.location.href).origin : ''

/** O arquivo da captura mora ao lado deste, na mesma versao. */
const captureSrc = script ? new URL('pds-captura.js', script.src).href : ''

/**
 * O cliente dispensou o nosso botao e abre pelo dele. **Ai nada sai daqui ate alguem
 * pedir** — nem a leitura da aparencia.
 */
const ownTrigger = script?.dataset.button?.trim().toLowerCase() === 'none'

/**
 * O cracha da pessoa, assinado pelo servidor do cliente: `data-identity` no proprio
 * script, so no projeto que herda a identidade. **Lido a cada abertura**, e nao uma
 * vez: o site pode trocar o atributo quando a sessao dele renova, e a pessoa pode
 * entrar ou sair sem recarregar a pagina. O teto e o da API.
 */
function identity(): string | null {
  const valor = script?.dataset.identity?.trim() ?? ''
  return valor.length > 0 && valor.length <= 4096 ? valor : null
}

/**
 * A API, a mesma que o quadro usa: as duas saem do mesmo build. Sem barra no fim — o
 * caminho da rota ja comeca com uma.
 */
const apiUrl = (
  (typeof import.meta.env.VITE_API_URL === 'string' ? import.meta.env.VITE_API_URL.trim() : '') ||
  'http://localhost:5080'
).replace(/\/+$/, '')

let captureModule: Promise<CaptureModule> | null = null

/** Quanto o arquivo da captura pode levar para chegar. */
const CAPTURE_LOAD_TIMEOUT_MS = 20_000

/**
 * Baixa o arquivo da captura, **uma vez**. Por `<script>` comum, como o proprio
 * carregador: um modulo pediria CORS do servidor dos arquivos. O que falha e
 * esquecido, para o proximo clique tentar de novo.
 *
 * **Com o `nonce` deste script.** A pagina que libera scripts por `nonce` liberou o
 * carregador pelo dele; sem repassa-lo, o arquivo da captura seria bloqueado.
 */
function loadCaptureModule(): Promise<CaptureModule> {
  captureModule ??= new Promise<CaptureModule>((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = captureSrc
    tag.async = true
    if (script?.nonce) tag.nonce = script.nonce
    const prazo = setTimeout(
      () => reject(new Error('O arquivo da captura demorou demais.')),
      CAPTURE_LOAD_TIMEOUT_MS,
    )
    tag.onload = () => {
      clearTimeout(prazo)
      const carregado = (window as unknown as Record<string, CaptureModule | undefined>)[
        CAPTURE_GLOBAL
      ]
      if (carregado && typeof carregado.capturePage === 'function') resolve(carregado)
      else reject(new Error('O arquivo da captura não trouxe o que devia.'))
    }
    tag.onerror = () => {
      clearTimeout(prazo)
      reject(new Error('Não deu para baixar o arquivo da captura.'))
    }
    document.head.appendChild(tag)
  })

  captureModule.catch(() => {
    captureModule = null
  })

  return captureModule
}

/** O pedido de captura so e atendido com os campos no formato combinado. */
function isCaptureRequest(data: { type: string }): data is CaptureRequestMessage {
  const pedido = data as Partial<CaptureRequestMessage>
  return (
    pedido.type === 'capture' &&
    typeof pedido.id === 'string' &&
    pedido.id.length > 0 &&
    (pedido.maxBytes === null || (typeof pedido.maxBytes === 'number' && pedido.maxBytes > 0))
  )
}

/** O caminho da pagina, sem o que vem depois de `?` ou `#`. */
function currentRoute(): string {
  return window.location.pathname || '/'
}

/** Com o botao a vista, confere de novo se esta pagina o esconde. */
function conferirRota(): void {
  if (view?.mode === 'button') view.setRoute(currentRoute())
}

/**
 * A aparencia do botao, pela rota leve. **Qualquer falha e "sem botao"**: chave que nao
 * vale (401), endereco fora da lista (403), ferramenta desligada, rede fora. Adivinhar
 * um botao poderia coloca-lo onde o projeto nao quer.
 *
 * Sem credencial: nenhum cookie da pagina do cliente viaja para a nossa API.
 */
async function readLauncher(): Promise<WidgetLauncherViewModel | null> {
  const query = new URLSearchParams({ key, origin: window.location.host })
  try {
    const resposta = await fetch(`${apiUrl}/public/widget-launcher?${query}`, {
      credentials: 'omit',
      mode: 'cors',
    })
    if (!resposta.ok) return null
    const envelope = (await resposta.json()) as { Data?: unknown } | null
    return readLauncherAppearance(envelope?.Data)
  } catch {
    return null
  }
}

/** Quanto a tela de "abrindo" espera o quadro antes de dizer que nao deu. */
const OPEN_TIMEOUT_MS = 15_000

/**
 * A unica cor que o carregador escreve na pagina do cliente: a da sombra do quadro
 * aberto, em preto neutro. O formulario tem as dele; o botao, as de `launcherView`.
 */
const SOMBRA = 'rgb(0 0 0 / 18%)'
const SOMBRAS = {
  open: `0 10px 40px ${SOMBRA}`,
  launcher: `0 4px 14px ${SOMBRA}`,
  none: 'none',
} as const

const px = (value: number | null) => (value === null ? '' : `${value}px`)

/** Fechado, abrindo (a tela de "abrindo" a mostra) ou aberto (o quadro a mostra). */
let estado: 'closed' | 'opening' | 'open' = 'closed'
/** O documento ja pode receber o nosso elemento. Antes disso, abrir fica na fila. */
let pronto = false
let abrirQuandoPronto = false

let view: LauncherView | null = null
/** A aparencia lida. Nula: sem botao — dispensado, recusado, desligado ou sem rede. */
let aparencia: WidgetLauncherViewModel | null = null

let frame: HTMLIFrameElement | null = null
let capture: ReturnType<typeof createCaptureHandler> | null = null
let acked = false
/** O quadro ja mandou o primeiro tamanho: esta desenhado e pode ser mostrado. */
let frameReady = false
/** O ultimo tamanho pedido, para reaplicar quando a janela mudar. */
let last: ResizeMessage | null = null
let retry: ReturnType<typeof setInterval> | undefined
let prazo: ReturnType<typeof setTimeout> | undefined
/** Quem tinha o foco quando abriu sem o nosso botao — e para onde ele volta. */
let voltarFoco: HTMLElement | null = null

function ensureView(): LauncherView {
  view ??= createLauncherView({
    parent: document.body,
    placement: 'fixed',
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
    onOpen: open,
    // A intencao confere a pagina antes de adiantar: sem a Navigation API, a troca de
    // rota por `pushState` nao avisa ninguem, e o botao seguia numa pagina escondida.
    onIntent: () => {
      conferirRota()
      preload()
    },
    onCancel: cancel,
  })
  return view
}

/**
 * Mostra o nosso botao, se houver um. **Confere a pagina de novo antes**: uma aplicacao
 * de pagina unica pode ter trocado de rota sem nenhum aviso que o carregador ouca.
 */
function showButton(): void {
  if (!view) return
  if (!aparencia?.IsEnabled || ownTrigger) {
    view.show('hidden')
    return
  }
  view.setRoute(currentRoute())
  view.show('button')
}

/**
 * O quadro, criado **uma vez** e guardado: fechar so o esconde, e reabrir e
 * instantaneo. Nasce invisivel — so aparece quando alguem pediu e ele ja respondeu.
 */
function ensureFrame(): HTMLIFrameElement {
  if (frame) return frame

  const novo = document.createElement('iframe')
  novo.src = `${origin}/embed.html`
  novo.setAttribute('data-pds', '')
  novo.title = 'Relato'
  // `allow-scripts` e `allow-same-origin` sao o minimo para o quadro rodar e
  // falar com a nossa API. Sem `allow-top-navigation`: um quadro nunca deve
  // conseguir levar a pagina do cliente para outro lugar.
  novo.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups')

  const style = novo.style
  style.position = 'fixed'
  style.bottom = '20px'
  style.right = '20px'
  // `visibility` e nao `opacity`: o invisivel por opacidade continua recebendo
  // clique, e o quadro fica em cima do conteudo da pagina.
  style.visibility = 'hidden'
  style.width = `${FRAME_SIZE.expanded.width}px`
  style.height = `${FRAME_SIZE.expanded.height}px`
  style.border = '0'
  style.borderRadius = '14px'
  style.colorScheme = 'normal'
  // Alto o bastante para nao sumir debaixo de cabecalho fixo, e nao o maximo:
  // dialogo de consentimento e aviso de cookie tem de continuar por cima.
  style.zIndex = '2147483000'

  document.body.appendChild(novo)
  frame = novo
  acked = false
  frameReady = false
  last = null

  capture = createCaptureHandler({
    frameStyle: style,
    focusFrame: () => novo.focus(),
    openPicker: () => openAreaPicker(),
    loadModule: loadCaptureModule,
    // So para o nosso quadro, e so para a origem dele: o print e da pagina do
    // cliente, e nao pode sair para outra janela.
    reply: (message) => novo.contentWindow?.postMessage(message, origin),
  })

  // Montada a cada envio, e nao uma vez so: entre criar o quadro e o `ack` a pessoa
  // pode ter mudado a janela de tamanho, e o quadro guarda o que chegou no primeiro.
  const send = () => {
    const init: InitMessage = {
      source: MESSAGE_SOURCE,
      type: 'init',
      key,
      route: currentRoute(),
      origin: window.location.host,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      // O quadro so oferece capturar se este carregador disser que sabe.
      capabilities: [CAPTURE_CAPABILITY],
      // O botao e daqui: o quadro nasce no formulario e avisa quando fechar.
      launcher: HOST_LAUNCHER,
      identity: identity(),
    }
    novo.contentWindow?.postMessage(init, origin)
  }

  send()
  clearInterval(retry)
  retry = setInterval(() => {
    if (acked || frame !== novo) return clearInterval(retry)
    send()
  }, 150)
  // Desistir e melhor do que reenviar para sempre numa aba esquecida aberta.
  setTimeout(() => clearInterval(retry), 10_000)

  return novo
}

/** Joga o quadro fora: o proximo pedido cria outro, do zero. */
function discardFrame(): void {
  clearInterval(retry)
  frame?.remove()
  frame = null
  capture = null
  acked = false
  frameReady = false
  last = null
}

function apply(message: ResizeMessage): void {
  if (!frame) return
  const style = frame.style
  // O tamanho limitado pela janela, a distancia do canto ate onde ela deixa, os
  // cantos e a sombra: a conta e de `placeFrame`, a mesma do botao e da previa.
  const lugar = placeFrame(message, { width: window.innerWidth, height: window.innerHeight })
  style.width = px(lugar.width)
  style.height = px(lugar.height)
  style.borderRadius = px(lugar.radius)
  style.boxShadow = SOMBRAS[lugar.shadow]

  // O canto vem em toda mensagem, e as quatro bordas sao escritas sempre: trocar
  // de canto sem apagar a anterior deixaria o quadro preso nas duas.
  style.left = px(lugar.left)
  style.right = px(lugar.right)
  style.top = px(lugar.top)
  style.bottom = px(lugar.bottom)

  // No meio de uma captura o quadro fica escondido — girar o telefone nao o traz
  // de volta para baixo do veu. A captura o devolve quando termina.
  if (estado === 'open' && !capture?.isCapturing()) style.visibility = 'visible'
}

/** O quadro respondeu e alguem quer ve-lo: sai a tela de "abrindo", entra ele. */
function reveal(): void {
  if (!frame || !last) return
  clearTimeout(prazo)
  estado = 'open'
  view?.show('hidden')
  apply(last)
  frame.focus()
  // A cada abertura: o quadro poe o foco no formulario e, da segunda em diante, le
  // os tipos de novo.
  // Com o caminho de agora: o site pode ter trocado de pagina sem recarregar desde o
  // `init`, e o relato tem de dizer a pagina em que a pessoa esta.
  // E com o cracha de agora, pelo mesmo motivo.
  const aberto: OpenMessage = {
    source: MESSAGE_SOURCE,
    type: 'open',
    route: currentRoute(),
    identity: identity(),
  }
  frame.contentWindow?.postMessage(aberto, origin)
}

/** Adianta o quadro, escondido: a pessoa esta a caminho do clique. */
function preload(): void {
  if (!key || !origin || !pronto) return
  ensureFrame()
}

/** Abre: pelo nosso botao, por `Pds.open()` ou por `data-pds-open`. */
function open(): void {
  if (!pronto) {
    abrirQuandoPronto = true
    return
  }
  if (!key || !origin) return
  if (estado === 'open') {
    frame?.focus()
    return
  }
  if (estado === 'opening') return

  // O foco volta ao nosso botao, se foi por ele; senao, a quem o tinha — o botao do
  // proprio cliente, quase sempre.
  const ativo = document.activeElement
  voltarFoco =
    !view?.hasFocus() && ativo instanceof HTMLElement && ativo !== document.body ? ativo : null

  estado = 'opening'
  ensureFrame()
  if (frameReady) {
    reveal()
    return
  }

  ensureView().show('loading')
  clearTimeout(prazo)
  prazo = setTimeout(() => {
    if (estado !== 'opening') return
    // Nao chegou: o proximo pedido tenta do zero, e a tela diz que nao deu.
    estado = 'closed'
    discardFrame()
    ensureView().show('error')
  }, OPEN_TIMEOUT_MS)
}

/** Devolve o foco a quem o tinha: o nosso botao, ou o elemento de onde se abriu. */
function returnFocus(): void {
  if (view?.focusButton()) return
  if (voltarFoco?.isConnected) voltarFoco.focus()
  voltarFoco = null
}

/** Fecha: o quadro e escondido e guardado, o botao volta. */
function close(): void {
  if (estado === 'closed') {
    // A tela de erro tambem fecha por aqui.
    if (view && view.mode !== 'button' && view.mode !== 'hidden') cancel()
    return
  }
  clearTimeout(prazo)
  estado = 'closed'
  if (frame && !capture?.isCapturing()) frame.style.visibility = 'hidden'
  showButton()
  returnFocus()
}

/** A pessoa desistiu da tela de "abrindo" (ou fechou a de erro). */
function cancel(): void {
  clearTimeout(prazo)
  // O quadro que ainda carrega continua, escondido: a proxima abertura o aproveita.
  estado = 'closed'
  showButton()
  returnFocus()
}

/** O quadro disse que nao ha o que abrir aqui: sem botao, e a tela diz por que. */
function unavailable(): void {
  const esperando = estado !== 'closed'
  clearTimeout(prazo)
  estado = 'closed'
  discardFrame()
  aparencia = null
  if (esperando) ensureView().show('error', 'O formulário não está disponível nesta página.')
  else view?.show('hidden')
}

window.addEventListener('message', (event) => {
  if (!frame) return
  // 1. a origem de onde servimos o quadro.
  if (event.origin !== origin) return
  // 2. a janela exata: outro quadro da MESMA origem nao passa por aqui.
  if (event.source !== frame.contentWindow) return
  // 3. o carimbo.
  if (!isOurMessage(event.data)) return

  switch (event.data.type) {
    case 'ack':
      acked = true
      return
    case 'resize': {
      // Conferido antes de aplicar: tamanho que nao e numero recusa a mensagem, e o
      // canto ou a distancia fora do combinado caem no de sempre.
      const pedido = readResize(event.data)
      if (!pedido) return
      last = pedido
      frameReady = true
      if (estado === 'opening') reveal()
      else if (estado === 'open') apply(pedido)
      return
    }
    case 'close':
      close()
      return
    case 'unavailable':
      unavailable()
      return
    default:
      if (isCaptureRequest(event.data)) void capture?.(event.data)
  }
})

function mount(): void {
  pronto = true

  // A janela muda de tamanho: girar o telefone basta para o botao virar o do celular.
  window.addEventListener('resize', () => {
    if (last && estado === 'open') apply(last)
    view?.refresh()
    // Girar o telefone tambem e uma chance de ver a rota que mudou sem aviso.
    conferirRota()
  })

  // Esc fecha a tela de "abrindo". O quadro aberto cuida do proprio Esc.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && view && (view.mode === 'loading' || view.mode === 'error'))
      cancel()
  })

  // As paginas escondidas, numa aplicacao de pagina unica: **sem mexer no `history`
  // da pagina**. A Navigation API avisa toda troca de rota onde existe; voltar e
  // avancar, e a troca de ancora, sao avisados em todo navegador. O que escapar disso
  // e conferido de novo quando o botao vai aparecer (`showButton`), quando a janela muda
  // de tamanho e na intencao de abrir (passar o mouse, focar).
  const aoNavegar = conferirRota
  window.addEventListener('popstate', aoNavegar)
  window.addEventListener('hashchange', aoNavegar)
  ;(window as Window & { navigation?: EventTarget }).navigation?.addEventListener(
    'navigatesuccess',
    aoNavegar,
  )

  if (abrirQuandoPronto) open()
}

/** Desenha o nosso botao com a aparencia lida — ou nada, se nao houver. */
async function drawButton(leitura: Promise<WidgetLauncherViewModel | null>): Promise<void> {
  const lida = await leitura
  if (!lida?.IsEnabled) return
  aparencia = lida
  ensureView().setAppearance(lida)
  // Aberto antes de a leitura chegar (`Pds.open()`), o botao espera o fechar.
  if (estado === 'closed' && view?.mode !== 'error') showButton()
}

/**
 * Abre pelo clique em qualquer elemento com `data-pds-open` — **um ouvinte so**, no
 * documento, e passivo: o elemento continua sendo do cliente, com o comportamento dele.
 */
function onDeclarativeClick(event: Event): void {
  const alvo = event.target
  if (alvo instanceof Element && alvo.closest('[data-pds-open]')) open()
}

/**
 * `window.Pds`, **uma vez e congelado**: duas copias do script na mesma pagina nao
 * abrem dois quadros, e script nenhum da pagina troca o `open` por outra coisa.
 */
function start(): void {
  if ('Pds' in window) return

  Object.defineProperty(window, 'Pds', {
    value: Object.freeze({ open: () => open(), close: () => close() }),
    writable: false,
    configurable: false,
  })

  document.addEventListener('click', onDeclarativeClick, { passive: true })

  if (!key || !origin) return

  // A leitura sai ja, sem esperar o documento: quando ele fica pronto, ela ja chegou.
  const leitura = ownTrigger ? null : readLauncher()

  const montar = () => {
    mount()
    if (leitura) void drawButton(leitura)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar)
  else montar()
}

start()
