/**
 * A rolagem que acompanha o que abre.
 *
 * **Ja no clique, e devagar.** O que abre com animacao (o historico, o "Vincular") cresce
 * por alguns centesimos de segundo, e esperar ele terminar para so entao rolar dava a
 * sensacao de demora. Aqui a rolagem comeca no mesmo quadro do clique, e o destino e
 * recalculado a cada quadro: enquanto o conteudo cresce, a tela vai junto, e chega ao
 * destino final quando ele termina de crescer.
 *
 * **Quem mexe manda.** A roda do mouse, o toque ou uma tecla no meio param a animacao, para
 * a tela nao brigar com a pessoa. Com pouco movimento pedido ao sistema, vai direto.
 */
export function rolarAte(
  area: HTMLElement,
  destino: () => number,
  { duracao = 700 }: { duracao?: number } = {},
): () => void {
  if (semMovimento()) {
    area.scrollTop = limitar(destino(), area)
    return () => {}
  }

  const de = area.scrollTop
  const inicio = performance.now()
  let quadro = 0
  let parado = false

  const parar = () => {
    parado = true
    cancelAnimationFrame(quadro)
    area.removeEventListener('wheel', parar)
    area.removeEventListener('touchstart', parar)
    area.removeEventListener('keydown', parar)
  }
  area.addEventListener('wheel', parar, { passive: true })
  area.addEventListener('touchstart', parar, { passive: true })
  area.addEventListener('keydown', parar)

  const passo = (agora: number) => {
    if (parado) return
    const t = Math.min((agora - inicio) / duracao, 1)
    area.scrollTop = de + (limitar(destino(), area) - de) * suavizar(t)
    if (t < 1) quadro = requestAnimationFrame(passo)
    else parar()
  }
  quadro = requestAnimationFrame(passo)
  return parar
}

/** Sai na hora e assenta devagar: responde ao clique sem tranco, e chega macio. */
function suavizar(t: number): number {
  return 1 - (1 - t) ** 4
}

function limitar(valor: number, area: HTMLElement): number {
  return Math.max(0, Math.min(valor, area.scrollHeight - area.clientHeight))
}

/** Onde o elemento comeca, medido dentro do conteudo da area (e nao da janela). */
export function topoDentro(elemento: HTMLElement, area: HTMLElement): number {
  return elemento.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop
}

/** A area que rola em volta do elemento: a coluna do card, no computador e no celular. */
export function areaQueRola(elemento: HTMLElement | null): HTMLElement | null {
  let atual = elemento?.parentElement ?? null
  while (atual) {
    const { overflowY } = getComputedStyle(atual)
    if (overflowY === 'auto' || overflowY === 'scroll') return atual
    atual = atual.parentElement
  }
  return null
}

/**
 * Sem animacao: quem pediu menos movimento ao sistema, e o ambiente sem `matchMedia` (os
 * testes), onde nao ha quadro nem transicao para esperar.
 */
export function semMovimento(): boolean {
  if (typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
