import type { CaptureArea } from '@/capture/area'

/** Menor area que conta como area, em pixels. Menos que isso e clique. */
export const MIN_AREA = 12

/**
 * A camada em que a pessoa marca o que quer mostrar, por cima da pagina.
 *
 * **Tres saidas, e as tres do mesmo tamanho**: arrastar sobre a area; "Tela
 * inteira", que e o caminho de quem usa teclado — arrastar nao se faz pelo teclado;
 * e "Cancelar", ou Esc. **Cancelar vale ate o fim**, inclusive enquanto a imagem e
 * gerada: uma pagina pesada ou uma rede parada nao podem prender a pessoa debaixo
 * do veu.
 *
 * **O estilo mora numa sombra (`attachShadow`).** A camada entra na pagina do
 * cliente: sem a sombra, o CSS dele mudaria os nossos botoes, e o nosso poderia
 * vazar para a pagina dele.
 *
 * **A pagina fica parada, e sem ouvir a camada, enquanto a pessoa marca.** A area e
 * medida na janela; se a pagina rolasse no meio, o que foi marcado e o que seria
 * desenhado seriam lugares diferentes. E os cliques de marcar nao chegam aos
 * ouvintes da pagina: um menu que fecha com clique fora fecharia antes do print — e
 * era ele que a pessoa queria mostrar.
 */
export interface AreaPicker {
  /** A area marcada, `'viewport'` para a tela inteira, ou nulo se a pessoa desistiu. */
  readonly chosen: Promise<CaptureArea | null>
  /**
   * A pessoa desistiu **depois** de marcar, enquanto a imagem era gerada. Quem
   * espera a imagem para de esperar.
   */
  readonly aborted: Promise<void>
  /** Diz que a imagem esta sendo gerada. A camada fica — e fora do print. */
  busy(): void
  /** Tira a camada da pagina. */
  close(): void
}

/**
 * **As cores sao declaradas uma vez, no topo, e so ali.** A camada mora na pagina
 * do cliente, onde os tokens do produto nao existem — e por isso a paleta dela e
 * propria, neutra, e conferida por teste (`designSystem.test.ts`): qualquer cor que
 * nao esteja aqui reprova.
 */
const STYLE = `
  :host {
    all: initial;
    --veu: rgb(15 23 42 / 0.35);
    --barra: #111827;
    --tinta: #ffffff;
    --contorno: rgb(0 0 0 / 0.5);
    --sombra: rgb(0 0 0 / 0.3);
    --linha: rgb(255 255 255 / 0.35);
    --realce: rgb(255 255 255 / 0.1);
  }
  .camada {
    position: fixed; inset: 0; cursor: crosshair; touch-action: none;
    background: var(--veu);
  }
  .camada.marcando { background: transparent; }
  .camada.ocupada { cursor: progress; }
  .area {
    position: fixed; pointer-events: none;
    border: 2px solid var(--tinta); outline: 1px solid var(--contorno);
    box-shadow: 0 0 0 100vmax var(--veu);
  }
  .barra {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px;
    max-width: calc(100vw - 32px); box-sizing: border-box; padding: 8px 12px;
    background: var(--barra); color: var(--tinta); border-radius: 10px; cursor: default;
    font: 14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
    box-shadow: 0 10px 30px var(--sombra);
  }
  button {
    font: inherit; color: inherit; background: transparent; cursor: pointer;
    padding: 6px 10px; border-radius: 8px; border: 1px solid var(--linha);
  }
  button:hover { background: var(--realce); }
  button:focus-visible { outline: 2px solid var(--tinta); outline-offset: 2px; }
  [hidden] { display: none !important; }
`

/**
 * Os eventos que param na camada. Sem isto eles saem da sombra e chegam aos
 * ouvintes da pagina — ver o comentario do tipo. Ouvinte da pagina que escuta na
 * captura (`capture: true`) ainda ouve: esse, nenhum elemento consegue calar.
 */
const EVENTOS_DA_CAMADA = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'contextmenu',
  'touchstart',
  'touchend',
]

/**
 * Poe o estilo na sombra. **Por folha construida, e nao por `<style>`**: a pagina do
 * cliente pode proibir estilo embutido pelo CSP, e ai a camada sairia sem forma — o
 * veu sem posicao, e arrastar sem efeito. A folha construida o CSP deixa. O
 * `<style>` fica para o navegador que nao sabe construir folha.
 */
function aplicarEstilo(doc: Document, sombra: ShadowRoot): void {
  try {
    const folha = new (doc.defaultView as Window & typeof globalThis).CSSStyleSheet()
    folha.replaceSync(STYLE)
    sombra.adoptedStyleSheets = [folha]
  } catch {
    const estilo = doc.createElement('style')
    estilo.textContent = STYLE
    sombra.appendChild(estilo)
  }
}

/** Um elemento com classe, e texto quando houver. Sem `innerHTML`: ver `openAreaPicker`. */
function criar(doc: Document, tag: string, classe: string, texto = ''): HTMLElement {
  const elemento = doc.createElement(tag)
  if (classe) elemento.className = classe
  if (texto) elemento.textContent = texto
  return elemento
}

/**
 * Abre a camada. Mora num elemento marcado com `data-pds-captura`, que e o que o
 * print deixa de fora.
 *
 * **Montada elemento a elemento, e nao por `innerHTML`**: pagina com Trusted Types
 * recusa `innerHTML`, e a captura nem abriria.
 */
export function openAreaPicker(doc: Document = document): AreaPicker {
  const janela = doc.defaultView as Window

  const host = doc.createElement('div')
  host.setAttribute('data-pds-captura', '')
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.zIndex = '2147483647'

  const sombra = host.attachShadow({ mode: 'open' })
  aplicarEstilo(doc, sombra)

  const camada = criar(doc, 'div', 'camada')
  const barra = criar(doc, 'div', 'barra')
  barra.setAttribute('role', 'dialog')
  barra.setAttribute('aria-label', 'Capturar uma área da página')
  const texto = criar(doc, 'span', 'texto', 'Arraste para marcar o que quer mostrar.')
  const tela = criar(doc, 'button', '', 'Tela inteira') as HTMLButtonElement
  const cancelar = criar(doc, 'button', '', 'Cancelar') as HTMLButtonElement
  tela.type = 'button'
  cancelar.type = 'button'
  const caixa = criar(doc, 'div', 'area')
  caixa.hidden = true

  barra.append(texto, tela, cancelar)
  camada.append(barra, caixa)
  sombra.appendChild(camada)

  let resolver: (area: CaptureArea | null) => void = () => {}
  const chosen = new Promise<CaptureArea | null>((resolve) => {
    resolver = resolve
  })
  let abortar: () => void = () => {}
  const aborted = new Promise<void>((resolve) => {
    abortar = resolve
  })

  let decidido = false
  let ocupada = false
  let fechada = false

  function decidir(area: CaptureArea | null): void {
    if (decidido) return
    decidido = true
    resolver(area)
  }

  /** Desistir: antes de marcar, e escolher nada; depois, e parar de gerar. */
  function desistir(): void {
    if (decidido) abortar()
    else decidir(null)
  }

  /** O ponto dentro da janela: arrastar para fora dela marca ate a borda. */
  function dentro(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.min(Math.max(0, x), janela.innerWidth),
      y: Math.min(Math.max(0, y), janela.innerHeight),
    }
  }

  let inicio: { x: number; y: number } | null = null

  function desenhar(area: { x: number; y: number; width: number; height: number }): void {
    caixa.hidden = false
    caixa.style.left = `${area.x}px`
    caixa.style.top = `${area.y}px`
    caixa.style.width = `${area.width}px`
    caixa.style.height = `${area.height}px`
  }

  camada.addEventListener('pointerdown', (evento) => {
    // Os botoes da barra sao botoes, e nao o comeco de uma area.
    if (decidido || barra.contains(evento.target as Node)) return
    inicio = dentro(evento.clientX, evento.clientY)
    camada.setPointerCapture?.(evento.pointerId)
    camada.classList.add('marcando')
    desenhar({ ...inicio, width: 0, height: 0 })
  })

  camada.addEventListener('pointermove', (evento) => {
    if (!inicio) return
    desenhar(normalizeArea(inicio, dentro(evento.clientX, evento.clientY)))
  })

  camada.addEventListener('pointerup', (evento) => {
    if (!inicio) return
    const area = normalizeArea(inicio, dentro(evento.clientX, evento.clientY))
    inicio = null

    // Pequena demais e clique: volta ao comeco, em vez de capturar um ponto.
    if (area.width < MIN_AREA || area.height < MIN_AREA) {
      caixa.hidden = true
      camada.classList.remove('marcando')
      return
    }

    decidir(area)
  })

  // A pagina parada enquanto a pessoa marca. Ver o comentario do tipo.
  const segurar = (evento: Event) => evento.preventDefault()
  camada.addEventListener('wheel', segurar, { passive: false })
  camada.addEventListener('touchmove', segurar, { passive: false })

  // E sem ouvir a camada. Ver EVENTOS_DA_CAMADA.
  const calar = (evento: Event) => evento.stopPropagation()
  for (const tipo of EVENTOS_DA_CAMADA) host.addEventListener(tipo, calar)

  tela.addEventListener('click', () => decidir('viewport'))
  cancelar.addEventListener('click', desistir)

  const tecla = (evento: KeyboardEvent) => {
    if (evento.key === 'Escape') {
      evento.preventDefault()
      evento.stopPropagation()
      desistir()
      return
    }

    // O Tab fica na camada: sair dela seria andar por links escondidos debaixo do
    // veu, sem ver onde esta.
    if (evento.key === 'Tab') {
      const visiveis = [tela, cancelar].filter((botao) => !botao.hidden)
      if (visiveis.length === 0) return
      evento.preventDefault()
      const atual = visiveis.indexOf(sombra.activeElement as HTMLButtonElement)
      const passo = evento.shiftKey ? -1 : 1
      const proximo = visiveis[(atual + passo + visiveis.length) % visiveis.length]
      proximo?.focus()
    }
  }
  doc.addEventListener('keydown', tecla, true)

  doc.body.appendChild(host)
  // O foco na primeira saida que o teclado alcanca: Enter captura a tela inteira.
  tela.focus()

  return {
    chosen,
    aborted,
    busy: () => {
      if (ocupada) return
      ocupada = true
      camada.classList.add('ocupada')
      texto.textContent = 'Gerando a imagem…'
      // "Tela inteira" nao faz mais sentido; "Cancelar" continua valendo.
      tela.hidden = true
      cancelar.focus()
    },
    close: () => {
      if (fechada) return
      fechada = true
      doc.removeEventListener('keydown', tecla, true)
      host.remove()
      // Fechar sem escolher e desistir: quem espera nao fica esperando.
      decidir(null)
    },
  }
}

/** O retangulo entre dois pontos, qualquer que seja a direcao do arrastar. */
export function normalizeArea(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}
