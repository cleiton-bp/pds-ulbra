import { isUsableAccent, prefersDarkInk, resolveTheme, watchSystemTheme } from '@/embed/appearance'
import {
  launcherFrame,
  launcherMode,
  launcherRadius,
  launcherSize,
  placeFrame,
  type WidgetLauncherViewModel,
} from '@/embed/launcher'
import { createLauncherIcon } from '@/embed/launcherIcons'
import { MESSAGE_SOURCE, type ResizeMessage } from '@/embed/protocol'

/**
 * O BOTAO NA PAGINA DO CLIENTE, desenhado pelo carregador — e a tela de "abrindo" que
 * aparece no lugar dele ate o quadro chegar.
 *
 * **Um elemento so na pagina do cliente**, `<pds-launcher>`, com tudo dentro de uma
 * sombra **fechada**: o CSS dele nao alcanca o nosso botao, o nosso nao vaza para a
 * pagina dele, e o script dele nao percorre o que esta la dentro. Nenhum estilo global,
 * nenhum outro no no documento.
 *
 * **As contas sao as de `embed/launcher.ts`**, as mesmas que o quadro usava para se
 * desenhar: o tamanho, os cantos, a regra do celular, as paginas escondidas, onde ele
 * fica. A previa do painel monta este mesmo modulo na pagina de mentira — o que ela
 * mostra e o que o site mostra.
 *
 * **Montado elemento a elemento, e nao por `innerHTML`**: pagina com Trusted Types
 * recusa `innerHTML`, e o botao nem apareceria.
 */

/**
 * **As cores sao declaradas uma vez, aqui, e so aqui.** O botao mora fora do nosso
 * documento, onde os tokens nao existem: estes valores repetem os de `tokens.css` (a
 * superficie, o acento e a tinta dele, o texto, a borda, nos dois temas, e o par fixo de
 * tintas sobre a cor do cliente), e `designSystem.test.ts` confere a lista. A cor do
 * cliente entra por variavel, no elemento: e dado, nao paleta.
 */
const STYLE = `
  :host {
    all: initial;
    --superficie: #fcfcfd;
    --acento: #1c2024;
    --tinta-do-acento: #ffffff;
    --texto: #1c2024;
    --texto-suave: #60646c;
    --borda: #d9d9e0;
    --tinta-escura: #1c2024;
    --tinta-clara: #ffffff;
    --sombra: rgb(0 0 0 / 18%);
  }
  :host([data-tema='escuro']) {
    --superficie: #111113;
    --acento: #edeef0;
    --tinta-do-acento: #111113;
    --texto: #edeef0;
    --texto-suave: #b0b4ba;
    --borda: #363a3f;
  }
  [hidden] { display: none !important; }
  /* Sem moldura: o anel com a cor da superficie em volta do botao virava uma borda
     escura grossa no tema escuro. O botao fica sozinho, e a sombra (quando ligada)
     acompanha a forma dele. */
  .anel {
    box-sizing: border-box; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    padding: 0;
    background: transparent;
    border-radius: var(--raio-anel, 999px);
  }
  /* No botao, e nao no anel: o anel e o espaco reservado, mais alto que o botao, e a
     sombra nele desenhava uma segunda pilula atras, com a pagina aparecendo entre as duas. */
  .botao.com-sombra { box-shadow: 0 4px 14px var(--sombra); }
  .botao {
    box-sizing: border-box; width: 100%; height: var(--altura, 40px); margin: 0;
    display: flex; align-items: center; justify-content: center; gap: var(--vao, 8px);
    padding: 0 var(--margem, 16px);
    border: 0; border-radius: var(--raio-botao, 999px);
    background: var(--cor-do-botao, var(--acento));
    color: var(--cor-do-texto, var(--tinta-do-acento));
    font: 500 var(--fonte, 14px) / 1 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    cursor: pointer; overflow: hidden;
    -webkit-tap-highlight-color: transparent;
  }
  .botao.so-icone { padding: 0; }
  .botao:hover { filter: brightness(0.94); }
  .botao:focus-visible { outline: 2px solid var(--texto); outline-offset: 1px; }
  .botao svg { flex: none; }
  .rotulo { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .painel {
    box-sizing: border-box; width: 100%;
    display: flex; align-items: center; gap: 12px;
    padding: 14px 12px 14px 16px;
    background: var(--superficie); color: var(--texto);
    border: 1px solid var(--borda); border-radius: 14px;
    box-shadow: 0 10px 40px var(--sombra);
    font: 400 14px / 1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .giro {
    flex: none; width: 16px; height: 16px; box-sizing: border-box;
    border: 2px solid var(--borda); border-top-color: var(--texto); border-radius: 50%;
    animation: girar 0.8s linear infinite;
  }
  .painel[aria-busy='false'] .giro { display: none; }
  .texto { flex: 1; min-width: 0; }
  .fechar {
    flex: none; margin: 0; padding: 4px 8px; border: 0; border-radius: 6px;
    background: transparent; color: var(--texto-suave); cursor: pointer;
    font: inherit;
  }
  .fechar:hover { color: var(--texto); }
  .fechar:focus-visible { outline: 2px solid var(--texto); outline-offset: 1px; }
  @keyframes girar { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .giro { animation-duration: 2.4s; } }
`

/** O tamanho da letra de cada tamanho do botao — os mesmos do quadro (`text-detail`, `text-body`, `text-dialog`). */
const FONTE = { Small: 13, Medium: 14, Large: 16 } as const

/** A largura da tela de "abrindo", e a altura usada para a conta do canto. */
const PAINEL = { width: 280, height: 64 } as const

/** Acima de quase tudo, e abaixo do maximo: aviso de cookie tem de continuar por cima. */
const Z_INDEX = '2147483000'

export type LauncherViewMode = 'button' | 'loading' | 'error' | 'hidden'

export interface LauncherViewOptions {
  /** Onde o elemento entra: o `body` da pagina, ou a pagina de mentira da previa. */
  parent: HTMLElement
  /** `fixed` na pagina do cliente; `absolute` dentro da pagina de mentira. */
  placement: 'fixed' | 'absolute'
  /** O tamanho de agora de onde o botao fica: a janela, ou a pagina de mentira. */
  viewport: () => { width: number; height: number }
  /**
   * A largura que decide se e celular. **Na previa nao e a da area**: a pagina de
   * mentira do computador pode ser estreita no painel e continua sendo computador.
   */
  ruleWidth?: () => number
  /** A pessoa clicou no botao. */
  onOpen: () => void
  /** A pessoa mostrou que vai clicar — passou o mouse, focou, tocou. */
  onIntent?: () => void
  /** A pessoa fechou a tela de "abrindo" (ou a de erro). */
  onCancel?: () => void
}

export interface LauncherView {
  /** O que esta sendo mostrado agora. */
  readonly mode: LauncherViewMode
  /** A aparencia do botao. Nula, so a tela de "abrindo" pode aparecer, com o de fabrica. */
  setAppearance(appearance: WidgetLauncherViewModel | null): void
  /** O caminho da pagina de agora, para as paginas escondidas. Nulo, nada se esconde. */
  setRoute(route: string | null): void
  /** Mostra uma das telas — ou nenhuma. O botao respeita as paginas e o celular. */
  show(mode: LauncherViewMode, message?: string): void
  /** Conta de novo: a janela mudou, o tema do sistema mudou. */
  refresh(): void
  /** Poe o foco no botao, se ele estiver a mostra. */
  focusButton(): boolean
  /** O foco esta dentro do nosso elemento? */
  hasFocus(): boolean
  /** Tira o elemento da pagina. */
  destroy(): void
}

/** Por folha construida, e nao por `<style>`: o CSP da pagina pode proibir estilo embutido. */
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

const px = (valor: number | null) => (valor === null ? 'auto' : `${valor}px`)

export function createLauncherView(options: LauncherViewOptions): LauncherView {
  const doc = options.parent.ownerDocument
  const host = doc.createElement('pds-launcher')
  host.setAttribute('data-pds-launcher', '')

  /**
   * Com `important`: e o unico elemento nosso na pagina do cliente, e uma regra dele
   * como `div, * { position: static !important }` nao pode tira-lo do canto. A
   * sombra protege o que esta dentro; o elemento em si so o estilo dele protege.
   */
  const fixar = (propriedade: string, valor: string) =>
    host.style.setProperty(propriedade, valor, 'important')

  fixar('position', options.placement)
  fixar('display', 'none')
  fixar('margin', '0')
  fixar('padding', '0')
  fixar('border', '0')
  fixar('box-sizing', 'border-box')
  fixar('z-index', Z_INDEX)

  // Fechada: o script da pagina nao chega ao botao por `host.shadowRoot`.
  const sombra = host.attachShadow({ mode: 'closed' })
  aplicarEstilo(doc, sombra)

  const anel = doc.createElement('div')
  anel.className = 'anel'
  const botao = doc.createElement('button')
  botao.type = 'button'
  botao.className = 'botao'
  const rotulo = doc.createElement('span')
  rotulo.className = 'rotulo'
  anel.appendChild(botao)

  const painel = doc.createElement('div')
  painel.className = 'painel'
  painel.setAttribute('role', 'status')
  painel.setAttribute('aria-live', 'polite')
  const giro = doc.createElement('span')
  giro.className = 'giro'
  giro.setAttribute('aria-hidden', 'true')
  const texto = doc.createElement('span')
  texto.className = 'texto'
  const fechar = doc.createElement('button')
  fechar.type = 'button'
  fechar.className = 'fechar'
  fechar.textContent = 'Fechar'
  painel.append(giro, texto, fechar)
  painel.hidden = true

  sombra.append(anel, painel)

  botao.addEventListener('click', () => options.onOpen())
  // A intencao adianta o quadro: quando o clique chega, ele ja esta a caminho.
  const intencao = () => options.onIntent?.()
  botao.addEventListener('pointerenter', intencao)
  botao.addEventListener('focus', intencao)
  botao.addEventListener('touchstart', intencao, { passive: true })
  fechar.addEventListener('click', () => options.onCancel?.())

  let aparencia: WidgetLauncherViewModel | null = null
  let rota: string | null = null
  let modo: LauncherViewMode = 'hidden'
  /**
   * O que esta dentro do botao agora (forma, icone, rotulo, tamanho). **Os filhos so sao
   * trocados quando isto muda.** Reconstrui-los a cada desenho tirava de baixo do mouse o
   * `<span>` em que o `mousedown` aconteceu: o foco que o `mousedown` da ao botao dispara
   * a intencao, a intencao confere a rota, a rota redesenha — e o Chrome nao dispara o
   * `click` quando o no do `mousedown` saiu do documento antes do `mouseup`. O primeiro
   * clique no botao nao abria nada.
   */
  let composicao = ''
  let pararTema: () => void = () => {}

  function tema(): void {
    const escuro = resolveTheme(aparencia?.Theme ?? 'Auto') === 'dark'
    host.setAttribute('data-tema', escuro ? 'escuro' : 'claro')
  }

  function esconder(): void {
    fixar('display', 'none')
  }

  /** Aplica onde fica e o tamanho, pela conta de sempre (`placeFrame`). */
  function posicionar(pedido: ResizeMessage, altura: 'fixa' | 'auto'): number {
    const lugar = placeFrame(pedido, options.viewport())
    fixar('width', px(lugar.width))
    fixar('height', altura === 'fixa' ? px(lugar.height) : 'auto')
    fixar('top', px(lugar.top))
    fixar('bottom', px(lugar.bottom))
    fixar('left', px(lugar.left))
    fixar('right', px(lugar.right))
    return lugar.radius
  }

  /** Desenha o botao. Falso quando a regra o esconde nesta pagina. */
  function desenharBotao(): boolean {
    const a = aparencia
    if (!a) return false

    const janela = options.viewport()
    const forma = launcherMode(a, rota, options.ruleWidth?.() ?? janela.width)
    if (forma === 'hidden') return false

    const soIcone = forma === 'icon'
    const medidas = launcherSize(a.LauncherSize)
    const cantos = launcherRadius(a.LauncherShape)

    const proximaComposicao = `${forma}|${a.LauncherIcon}|${a.LauncherLabel}|${a.LauncherSize}`
    if (proximaComposicao !== composicao) {
      composicao = proximaComposicao
      botao.replaceChildren()
      if (a.LauncherIcon !== 'None')
        botao.appendChild(createLauncherIcon(doc, a.LauncherIcon, medidas.icon))
      if (!soIcone) {
        rotulo.textContent = a.LauncherLabel
        botao.appendChild(rotulo)
      }
    }
    // O nome sempre: so o icone, o texto vira o nome e a dica — como no quadro.
    botao.setAttribute('aria-label', a.LauncherLabel)
    if (soIcone) botao.title = a.LauncherLabel
    else botao.removeAttribute('title')
    botao.classList.toggle('so-icone', soIcone)

    // A cor do cliente e a tinta: a escolhida vence; sem ela, a de maior contraste,
    // pela mesma conta do quadro; sem cor nenhuma, o acento do produto e a tinta dele.
    const escura = prefersDarkInk(a.AccentColor)
    const automatica =
      escura === null
        ? 'var(--tinta-do-acento)'
        : escura
          ? 'var(--tinta-escura)'
          : 'var(--tinta-clara)'
    host.style.setProperty(
      '--cor-do-botao',
      isUsableAccent(a.AccentColor) ? a.AccentColor.trim() : 'var(--acento)',
    )
    host.style.setProperty(
      '--cor-do-texto',
      isUsableAccent(a.LauncherTextColor) ? a.LauncherTextColor.trim() : automatica,
    )
    host.style.setProperty('--altura', `${medidas.button}px`)
    host.style.setProperty('--margem', `${medidas.paddingX}px`)
    host.style.setProperty('--vao', `${medidas.gap}px`)
    host.style.setProperty('--fonte', `${FONTE[a.LauncherSize] ?? FONTE.Medium}px`)
    host.style.setProperty('--raio-botao', `${cantos.button}px`)
    botao.classList.toggle('com-sombra', a.LauncherShadow)

    painel.hidden = true
    anel.hidden = false

    // Medido ja na pagina, e invisivel: a largura acompanha o texto, como no quadro.
    fixar('visibility', 'hidden')
    fixar('display', 'block')
    if (!host.isConnected) options.parent.appendChild(host)

    const quadro = launcherFrame(a, soIcone ? 'icon' : 'full', soIcone ? 0 : rotulo.scrollWidth)
    const raio = posicionar({ source: MESSAGE_SOURCE, type: 'resize', ...quadro }, 'fixa')
    host.style.setProperty('--raio-anel', `${raio}px`)

    fixar('visibility', 'visible')
    return true
  }

  /** A tela de "abrindo", ou a de erro, no canto do botao — ou no de fabrica, sem ele. */
  function desenharPainel(ocupado: boolean, mensagem: string): void {
    anel.hidden = true
    painel.hidden = false
    painel.setAttribute('aria-busy', ocupado ? 'true' : 'false')
    texto.textContent = mensagem

    fixar('visibility', 'visible')
    fixar('display', 'block')
    if (!host.isConnected) options.parent.appendChild(host)

    posicionar(
      {
        source: MESSAGE_SOURCE,
        type: 'resize',
        ...PAINEL,
        position: aparencia?.Position ?? 'BottomRight',
        offsetX: aparencia?.OffsetX,
        offsetY: aparencia?.OffsetY,
      },
      'auto',
    )
  }

  function render(mensagem?: string): void {
    tema()
    if (modo === 'button') {
      if (!desenharBotao()) esconder()
      return
    }
    if (modo === 'loading') {
      desenharPainel(true, mensagem ?? 'Abrindo o formulário…')
      return
    }
    if (modo === 'error') {
      desenharPainel(false, mensagem ?? 'Não deu para abrir agora. Tente de novo em instantes.')
      return
    }
    esconder()
  }

  /** Desenha de novo o que ja esta a mostra, com o texto que ja esta nele. */
  function redesenhar(): void {
    if (modo === 'loading' || modo === 'error') render(texto.textContent ?? undefined)
    else render()
  }

  return {
    get mode() {
      return modo
    },
    setAppearance(proxima) {
      aparencia = proxima
      // So `Auto` acompanha o sistema; trocar de aparencia troca o ouvinte.
      pararTema()
      pararTema = watchSystemTheme(proxima?.Theme ?? 'Auto', redesenhar)
      redesenhar()
    },
    setRoute(proxima) {
      // A mesma rota nao redesenha nada: a intencao de abrir (foco, mouse em cima)
      // confere a rota a cada vez, e redesenhar no meio de um clique o perdia.
      if (proxima === rota) return
      rota = proxima
      if (modo === 'button') render()
    },
    show(proximo, mensagem) {
      // O foco estava no botao e ele vai sumir: passa para o "Fechar" da tela nova,
      // e nao cai no `body` da pagina.
      const focoNoBotao = sombra.activeElement === botao
      modo = proximo
      render(mensagem)
      if (focoNoBotao && (proximo === 'loading' || proximo === 'error')) fechar.focus()
    },
    refresh() {
      if (modo !== 'hidden') redesenhar()
    },
    focusButton() {
      if (modo !== 'button' || anel.hidden || host.style.display === 'none') return false
      botao.focus()
      return true
    },
    hasFocus() {
      return sombra.activeElement !== null
    },
    destroy() {
      pararTema()
      host.remove()
    },
  }
}
