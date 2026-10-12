import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Por quanto tempo procurar a secao: o bastante para a tela terminar de ler a API. */
const PROCURAR_MS = 3000

/** Depois de achar, por quanto tempo acompanhar a secao, se o que vem antes dela crescer. */
const ACOMPANHAR_MS = 3000

/** O que a pessoa faz para tomar a rolagem de volta: dali em diante, nada se mexe sozinho. */
const GESTOS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/** Quanto tempo o campo fica aceso, quando quem levou ate ele pediu. */
const ACESO_MS = 2_000

/** O que recebe foco: o campo em si, quando o `#` aponta para um. */
const CONTROLES =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/**
 * O que vai junto no `state` da navegacao para o campo acender ao chegar. So a busca
 * e os primeiros passos pedem: o sino leva a uma secao inteira, e acender um bloco
 * do tamanho da tela chama mais atencao do que ajuda.
 */
export interface ScrollToHashState {
  realce?: boolean
}

/**
 * Rola ate a secao do `#` do endereco — o aviso do sino que leva a "Domínios" ou a
 * "Limites". O roteador nao faz isso sozinho, e a secao pode ainda nao existir quando a
 * tela monta (ela espera a API): procura a cada quadro, por alguns segundos, e desiste
 * calada — a tela abre no topo, como abriria sem o `#`.
 *
 * **Segue a secao enquanto a tela termina de carregar.** O que vem antes dela tambem le
 * a API, e cresce depois: a de Limites descia a pagina inteira quando o formulario de
 * cima chegava, e o sino levava a outro lugar. Ate a pessoa mexer na rolagem, a secao
 * volta para o topo da tela.
 *
 * **O foco vai para o campo, ou para o titulo da secao**, sem rolar de novo: quem chegou
 * pelo teclado continua dali, e o leitor de tela anuncia onde a pessoa esta. O `#` que
 * aponta para um campo (a busca da configuracao leva a `tela#campo`) foca o campo; o que
 * aponta para uma secao foca o titulo dela.
 *
 * **Abre o "Mais opções" fechado** em volta do alvo: o campo dentro de um `<details>`
 * fechado nao tem lugar na tela, e a rolagem nao teria para onde ir.
 *
 * Depende tambem da `key` do endereco: o segundo clique no mesmo aviso, com a tela ja
 * aberta, e uma navegacao nova com o mesmo `#`, e precisa rolar de novo.
 */
export function useScrollToHash() {
  const { hash, key, state } = useLocation()
  const realce = (state as ScrollToHashState | null)?.realce === true

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` e o gatilho do mesmo `#` clicado de novo; o `realce` vem junto dele
  useEffect(() => {
    let id: string
    try {
      id = decodeURIComponent(hash.replace(/^#/, ''))
    } catch {
      // `%` solto no endereco: nao ha secao com esse nome, e a tela abre no topo.
      return
    }
    if (id.length === 0) return

    const fimDaProcura = Date.now() + PROCURAR_MS
    let fimDoAcompanhamento = 0
    let alvo: HTMLElement | null = null
    let topo: number | null = null
    let parou = false
    let quadro = 0

    const parar = () => {
      parou = true
    }
    for (const gesto of GESTOS) window.addEventListener(gesto, parar, { passive: true })

    const rolar = (secao: HTMLElement) => {
      secao.scrollIntoView({ block: 'start' })
      topo = secao.getBoundingClientRect().top
    }

    const procurar = () => {
      if (parou) return

      alvo ??= document.getElementById(id)
      if (alvo) {
        if (topo === null) {
          abrirDetalhes(alvo)
          rolar(alvo)
          fimDoAcompanhamento = Date.now() + ACOMPANHAR_MS
          focar(alvo)
          if (realce) acender(alvo)
        } else if (Math.abs(alvo.getBoundingClientRect().top - topo) > 1) {
          rolar(alvo)
        }
        if (Date.now() < fimDoAcompanhamento) quadro = requestAnimationFrame(procurar)
        return
      }

      if (Date.now() < fimDaProcura) quadro = requestAnimationFrame(procurar)
    }
    quadro = requestAnimationFrame(procurar)

    return () => {
      cancelAnimationFrame(quadro)
      for (const gesto of GESTOS) window.removeEventListener(gesto, parar)
    }
  }, [hash, key])
}

/** Abre cada `<details>` fechado em volta do alvo, de dentro para fora. */
function abrirDetalhes(alvo: HTMLElement) {
  let detalhes = alvo.parentElement?.closest('details') ?? null
  while (detalhes) {
    detalhes.open = true
    detalhes = detalhes.parentElement?.closest('details') ?? null
  }
}

/**
 * O campo, se o alvo e um; o titulo da secao, se ele tem um — ou o botao que o
 * envolve, quando o titulo mora num botao de abrir e fechar; e o primeiro campo de
 * dentro, por ultimo. No grupo de escolhas, a escolha marcada, e nao a primeira.
 */
function focar(alvo: HTMLElement) {
  if (/^H[1-6]$/.test(alvo.tagName)) {
    focarTitulo(alvo)
    return
  }
  // O `<summary>` e o botao de abrir e fechar o grupo, e a ancora dele em O botão.
  if (alvo.matches(CONTROLES) || alvo.tagName === 'SUMMARY') {
    alvo.focus({ preventScroll: true })
    return
  }

  const titulo = alvo.querySelector<HTMLElement>('h1, h2, h3')
  if (titulo) {
    const dono = titulo.closest<HTMLElement>('button, a[href]')
    if (dono && alvo.contains(dono)) dono.focus({ preventScroll: true })
    else focarTitulo(titulo)
    return
  }

  const campo =
    alvo.querySelector<HTMLElement>('input[type="radio"]:checked') ??
    alvo.querySelector<HTMLElement>(CONTROLES)
  campo?.focus({ preventScroll: true })
}

function focarTitulo(titulo: HTMLElement) {
  if (!titulo.hasAttribute('tabindex')) titulo.tabIndex = -1
  titulo.focus({ preventScroll: true })
}

/**
 * Acende o alvo por dois segundos, como o comentario da mencao: numa tela longa, quem
 * chegou pela busca ve na hora qual e o campo. A cor vem do tema, na hora.
 */
function acender(alvo: HTMLElement) {
  const cor = getComputedStyle(alvo).getPropertyValue('--warn-surface').trim() || 'transparent'
  alvo.animate?.(
    [
      { boxShadow: `0 0 0 4px ${cor}` },
      { boxShadow: `0 0 0 4px ${cor}`, offset: 0.7 },
      { boxShadow: '0 0 0 4px transparent' },
    ],
    { duration: ACESO_MS, easing: 'ease-out' },
  )
}
