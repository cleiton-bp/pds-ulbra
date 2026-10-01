import { CAPTURE_GLOBAL, type CaptureModule } from '@/capture/area'
import {
  CAPTURE_CAPABILITY,
  type CaptureRequestMessage,
  FRAME_SIZE,
  type InitMessage,
  isOurMessage,
  MESSAGE_SOURCE,
  type ResizeMessage,
} from '@/embed/protocol'
import { openAreaPicker } from '@/loader/areaPicker'
import { createCaptureHandler } from '@/loader/captureFlow'

/**
 * O CARREGADOR — a unica linha que o cliente cola no site dele.
 *
 * <script src="https://.../v1/pds.js" data-key="pk_..." defer></script>
 *
 * **Ele quase nao desenha na pagina.** Cria um `iframe` e cuida de posicao e
 * tamanho — o gatilho, o formulario e as cores moram dentro do quadro. E o que
 * mantem o site do cliente livre do nosso CSS, e o nosso livre do dele.
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

function mount(): void {
  if (!key || !origin) return
  // Duas copias do script na mesma pagina abririam dois quadros sobrepostos.
  if (document.querySelector('iframe[data-pds]')) return

  const frame = document.createElement('iframe')
  frame.src = `${origin}/embed.html`
  frame.setAttribute('data-pds', '')
  frame.title = 'Relato'
  // `allow-scripts` e `allow-same-origin` sao o minimo para o quadro rodar e
  // falar com a nossa API. Sem `allow-top-navigation`: um quadro nunca deve
  // conseguir levar a pagina do cliente para outro lugar.
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups')

  const style = frame.style
  style.position = 'fixed'
  style.bottom = '20px'
  // O canto horizontal so e decidido quando a configuracao do cliente chega, no
  // primeiro `resize`. Ate la o quadro esta invisivel, entao o lado nao importa.
  style.right = '20px'

  // **Nasce invisivel, e so o primeiro `resize` o revela.** O quadro nao manda
  // nenhum antes de saber como o cliente o configurou, e isso resolve quatro
  // coisas de uma vez: ele aparece ja no canto certo; a ferramenta desligada
  // nunca manda e nunca aparece; o rotulo nao pisca, porque nada e desenhado com
  // os padroes para ser trocado na cara de quem estava lendo; e o quadro que nao
  // carregou some, em vez de deixar uma pilula vazia parada no site do cliente.
  //
  // `visibility` e nao `opacity`: o invisivel por opacidade continua recebendo
  // clique, e o quadro fica em cima do conteudo da pagina.
  style.visibility = 'hidden'
  style.width = `${FRAME_SIZE.collapsed.width}px`
  style.height = `${FRAME_SIZE.collapsed.height}px`
  style.border = '0'
  style.borderRadius = '999px'
  style.colorScheme = 'normal'
  // Alto o bastante para nao sumir debaixo de cabecalho fixo, e nao o maximo:
  // dialogo de consentimento e aviso de cookie tem de continuar por cima.
  style.zIndex = '2147483000'

  document.body.appendChild(frame)

  let acked = false
  /** O ultimo tamanho pedido, para reaplicar quando a janela mudar. */
  let last: ResizeMessage | null = null

  // Montada a cada envio, e nao uma vez so: entre o carregamento da pagina e o
  // `ack` a pessoa pode ter mudado a janela de tamanho ou o site pode ter trocado
  // de rota sem recarregar, e o quadro guarda o que chegou no primeiro `init`.
  function send(): void {
    const init: InitMessage = {
      source: MESSAGE_SOURCE,
      type: 'init',
      key,
      route: currentRoute(),
      origin: window.location.host,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      // O quadro so oferece capturar se este carregador disser que sabe.
      capabilities: [CAPTURE_CAPABILITY],
    }

    frame.contentWindow?.postMessage(init, origin)
  }

  const capture = createCaptureHandler({
    frameStyle: style,
    focusFrame: () => frame.focus(),
    openPicker: () => openAreaPicker(),
    loadModule: loadCaptureModule,
    // So para o nosso quadro, e so para a origem dele: o print e da pagina do
    // cliente, e nao pode sair para outra janela.
    reply: (message) => frame.contentWindow?.postMessage(message, origin),
  })

  /** Distancia que o quadro sempre deixa ate a borda da janela. */
  const GUTTER = 20

  function apply(message: ResizeMessage): void {
    const expanded = message.width >= FRAME_SIZE.expanded.width
    // O tamanho pedido e o desejado, nao o obtido: a janela de quem visita pode
    // ser menor que ele. Sem este limite o quadro transborda o topo numa tela
    // baixa e a pessoa perde o inicio do formulario — visto acontecendo em
    // janela de 513px de altura.
    const maxWidth = window.innerWidth - GUTTER * 2
    const maxHeight = window.innerHeight - GUTTER * 2
    style.width = `${Math.min(message.width, maxWidth)}px`
    style.height = `${Math.min(message.height, maxHeight)}px`
    // O gatilho e redondo; o formulario aberto, nao.
    style.borderRadius = expanded ? '14px' : '999px'
    style.boxShadow = expanded ? '0 10px 40px rgb(0 0 0 / 18%)' : 'none'

    // O canto vem em toda mensagem, e as duas bordas sao escritas sempre: trocar
    // de lado sem apagar a anterior deixaria o quadro preso nas duas.
    const left = message.position === 'BottomLeft'
    style.left = left ? '20px' : ''
    style.right = left ? '' : '20px'

    // No meio de uma captura o quadro fica escondido — girar o telefone nao o traz
    // de volta para baixo do veu. A captura o devolve quando termina.
    if (!capture.isCapturing()) style.visibility = 'visible'
  }

  window.addEventListener('message', (event) => {
    // 1. a origem de onde servimos o quadro.
    if (event.origin !== origin) return
    // 2. a janela exata: outro quadro da MESMA origem nao passa por aqui.
    if (event.source !== frame.contentWindow) return
    // 3. o carimbo.
    if (!isOurMessage(event.data)) return

    if (event.data.type === 'ack') {
      acked = true
      return
    }

    if (event.data.type === 'resize') {
      last = event.data as unknown as ResizeMessage
      apply(last)
      return
    }

    if (isCaptureRequest(event.data)) void capture(event.data)
  })

  // A janela muda de tamanho com o quadro aberto: girar o telefone basta.
  window.addEventListener('resize', () => {
    if (last) apply(last)
  })

  send()
  const retry = setInterval(() => {
    if (acked) return clearInterval(retry)
    send()
  }, 150)

  // Desistir e melhor do que reenviar para sempre numa aba esquecida aberta.
  setTimeout(() => clearInterval(retry), 10_000)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}
