import {
  FRAME_SIZE,
  type InitMessage,
  isOurMessage,
  MESSAGE_SOURCE,
  type ResizeMessage,
} from '@/embed/protocol'

/**
 * O CARREGADOR — a unica linha que o cliente cola no site dele.
 *
 * <script src="https://.../v1/pds.js" data-key="pk_..." defer></script>
 *
 * **Ele nao desenha nada na pagina.** Cria um `iframe` e cuida de posicao e
 * tamanho, e mais nada — o gatilho, o formulario e as cores moram dentro do
 * quadro. E o que mantem o site do cliente livre do nosso CSS, e o nosso livre do
 * dele.
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
  style.right = '20px'
  style.width = `${FRAME_SIZE.collapsed.width}px`
  style.height = `${FRAME_SIZE.collapsed.height}px`
  style.border = '0'
  style.borderRadius = '999px'
  style.colorScheme = 'normal'
  // Alto o bastante para nao sumir debaixo de cabecalho fixo, e nao o maximo:
  // dialogo de consentimento e aviso de cookie tem de continuar por cima.
  style.zIndex = '2147483000'

  document.body.appendChild(frame)

  const init: InitMessage = {
    source: MESSAGE_SOURCE,
    type: 'init',
    key,
    route: currentRoute(),
    origin: window.location.host,
  }

  let acked = false
  /** O ultimo tamanho pedido, para reaplicar quando a janela mudar. */
  let last: ResizeMessage | null = null

  function send(): void {
    frame.contentWindow?.postMessage(init, origin)
  }

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
    }
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
