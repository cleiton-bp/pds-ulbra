/**
 * A camada de cima do navegador (o "top layer"). **`z-index` nenhum passa por cima de um
 * `<dialog>` aberto com `showModal()` nem de um `popover`**: eles vivem numa camada
 * propria, acima da pagina inteira. E o modal ainda deixa **inerte** tudo o que nao esta
 * dentro dele, inclusive um popover por cima: aparece, mas nao recebe clique nem foco. A
 * gaveta de filtros de um site, feita assim, cobria o formulario e o botao.
 *
 * O caminho e um `<dialog>` nosso, de tamanho zero, que guarda o quadro e o botao:
 *
 * - **Formulario fechado e sem modal do site**, ele fica fora da camada, com o `z-index`
 *   de sempre: o botao parado no canto nao cobre aviso de cookie nem de consentimento.
 * - **Formulario aberto, sem modal do site**, ele e um `popover="manual"`: fica por cima
 *   de tudo e nao trava nada. O manual nao fecha com clique fora nem com Esc, so quando a
 *   gente pede.
 * - **Formulario aberto e modal do site aberto**, ele vira modal tambem, o ultimo aberto:
 *   o formulario e que recebe clique e teclado. Fechar o formulario devolve o site.
 * - Formulario fechado e modal do site aberto, ele e popover: o botao fica por cima mas
 *   inerte, e o clique no lugar dele e pego antes do site (ver `main.ts`).
 *
 * Na camada, **quem entrou por ultimo fica por cima**: quando o site abre um modal ou um
 * popover depois, sair e entrar de novo nos devolve ao topo. O navegador sem `popover`
 * nem `<dialog>` fica com o `z-index` de sempre, como antes.
 */

type Camada = HTMLDialogElement & { showPopover?(): void; hidePopover?(): void }

const MARCA = 'data-relatofacil-camada'

/** O fundo do nosso modal some: so o do site escurece a pagina. */
const ESTILO = `dialog[${MARCA}]::backdrop{background:transparent!important}`

export interface TopLayer {
  /** Onde o quadro e o botao entram. */
  readonly root: HTMLElement
  /** O formulario abriu ou fechou: decide entre popover e modal. */
  setFormOpen(open: boolean): void
  /** O site mexeu na camada: volta ao topo dela, no modo certo. */
  sync(): void
  /** Ha um modal do site aberto agora? */
  siteModalOpen(): boolean
}

function popoverOpen(el: Element): boolean {
  try {
    return el.matches(':popover-open')
  } catch {
    return false
  }
}

function modal(el: Element): boolean {
  try {
    return el.matches(':modal')
  } catch {
    return false
  }
}

function aplicarEstilo(doc: Document): void {
  try {
    const folha = new CSSStyleSheet()
    folha.replaceSync(ESTILO)
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, folha]
  } catch {
    // O CSP da pagina pode recusar o `<style>`; ai o fundo fica o de fabrica, bem claro.
    const estilo = doc.createElement('style')
    estilo.textContent = ESTILO
    doc.head.appendChild(estilo)
  }
}

export function createTopLayer(doc: Document = document): TopLayer {
  const root = doc.createElement('dialog') as Camada
  root.setAttribute(MARCA, '')
  root.setAttribute('aria-label', 'Relato')

  const suporta = typeof root.showPopover === 'function' && typeof root.showModal === 'function'

  // Com `important`: e um `<dialog>` na pagina do cliente, e uma regra dele como
  // `dialog { padding: 2rem; transform: ... }` nao pode mexer no nosso. Tamanho zero e sem
  // clique: so o quadro e o botao, la dentro, recebem.
  const fixar = (propriedade: string, valor: string) =>
    root.style.setProperty(propriedade, valor, 'important')
  fixar('position', 'fixed')
  fixar('inset', '0 auto auto 0')
  fixar('width', '0')
  fixar('height', '0')
  fixar('max-width', 'none')
  fixar('max-height', 'none')
  fixar('margin', '0')
  fixar('padding', '0')
  fixar('border', '0')
  fixar('background', 'transparent')
  fixar('overflow', 'visible')
  fixar('pointer-events', 'none')
  fixar('opacity', '1')
  fixar('visibility', 'visible')
  // `block` sempre: um `<dialog>` aberto como popover nao tem `[open]`, e a regra do
  // navegador o esconderia. Sem transformacao nem filtro, senao o `position: fixed` do
  // quadro passaria a contar a partir daqui, e nao da janela.
  fixar('display', 'block')
  fixar('transform', 'none')
  fixar('filter', 'none')
  fixar('contain', 'none')
  fixar('animation', 'none')
  fixar('transition', 'none')
  fixar('z-index', '2147483000')

  if (suporta) {
    root.setAttribute('popover', 'manual')
    aplicarEstilo(doc)
  }

  let formOpen = false

  const siteModalOpen = () =>
    Array.from(doc.querySelectorAll('dialog')).some((d) => d !== root && modal(d))

  function fora(): void {
    if (modal(root)) root.close()
    if (popoverOpen(root)) root.hidePopover?.()
  }

  function comoPopover(): void {
    if (modal(root)) root.close()
    if (popoverOpen(root)) root.hidePopover?.()
    root.showPopover?.()
  }

  function comoModal(): void {
    if (popoverOpen(root)) root.hidePopover?.()
    if (root.open) root.close()
    root.showModal()
  }

  function sync(): void {
    if (!suporta || !root.isConnected) return
    try {
      const modalDoSite = siteModalOpen()
      if (formOpen && modalDoSite) comoModal()
      else if (formOpen || modalDoSite) comoPopover()
      else fora()
    } catch {
      // Tela cheia, documento saindo: fica com o `z-index`.
    }
  }

  // O Esc no nosso modal e do formulario, e nao fecha a camada.
  root.addEventListener('cancel', (evento) => evento.preventDefault())
  // Alguem fechou a camada por fora (um script que fecha todo `<dialog>`): volta.
  root.addEventListener('close', () => {
    if (!root.open && !popoverOpen(root)) sync()
  })

  doc.body.appendChild(root)
  sync()

  return {
    root,
    setFormOpen(open) {
      if (formOpen === open) return
      formOpen = open
      sync()
    },
    sync,
    siteModalOpen,
  }
}

/**
 * Avisa quando o site mexe na camada de cima: um `<dialog>` que abriu ou fechou (o
 * atributo `open`) ou um popover que abriu (o evento `toggle`, que nao borbulha e por isso
 * e ouvido na captura). A nossa camada nao conta, senao subir ao topo chamaria de novo.
 */
export function watchTopLayer(nossa: () => Element | null, aviso: () => void): () => void {
  const doc = document
  let marcado = false
  const avisar = (alvo: unknown) => {
    const raiz = nossa()
    if (raiz && alvo instanceof Node && (alvo === raiz || raiz.contains(alvo))) return
    if (marcado) return
    marcado = true
    // Depois do site terminar de abrir o dele, e uma vez so por rodada.
    queueMicrotask(() => {
      marcado = false
      aviso()
    })
  }

  const observador = new MutationObserver((mudancas) => {
    for (const mudanca of mudancas) {
      if (mudanca.target instanceof HTMLDialogElement) avisar(mudanca.target)
    }
  })
  observador.observe(doc.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['open'],
  })

  const aoAlternar = (evento: Event) => {
    if ((evento as Event & { newState?: string }).newState === 'open') avisar(evento.target)
  }
  doc.addEventListener('toggle', aoAlternar, true)

  return () => {
    observador.disconnect()
    doc.removeEventListener('toggle', aoAlternar, true)
  }
}
