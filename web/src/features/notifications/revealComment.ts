/** Quanto tempo esperar o comentario aparecer: o card abre e le os comentarios depois. */
const ESPERA_MS = 10_000

/** De quanto em quanto tempo olhar de novo. */
const PASSO_MS = 150

/** Quanto tempo o comentario fica aceso. */
const ACESO_MS = 2_000

/** O identificador do comentario na tela: o card aberto o poe em cada comentario. */
export function commentAnchorId(commentPublicId: string): string {
  return `comentario-${commentPublicId}`
}

/**
 * Leva ate o comentario da mencao, no card que acabou de abrir: rola ate ele, poe o foco
 * nele e o acende por dois segundos. **Num card longo, a mencao ficava abaixo da dobra**,
 * e a pessoa tinha de caca-la entre subtarefas, vinculos e comentarios.
 *
 * O card le os comentarios depois de abrir: aqui se espera o comentario aparecer, por
 * alguns segundos. Se nao aparecer — o comentario saiu, ou a pessoa ja foi para outro
 * card —, nada acontece. Devolve quem desiste de esperar.
 */
export function revealComment(commentPublicId: string): () => void {
  const inicio = Date.now()
  let timer: ReturnType<typeof setTimeout> | null = null

  const procurar = () => {
    timer = null
    const alvo = document.getElementById(commentAnchorId(commentPublicId))
    if (!alvo) {
      if (Date.now() - inicio < ESPERA_MS) timer = setTimeout(procurar, PASSO_MS)
      return
    }
    alvo.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    if (alvo.tabIndex >= 0 || alvo.hasAttribute('tabindex')) alvo.focus({ preventScroll: true })
    // A cor do destaque vem do tema, na hora: o escuro tem a dele.
    const cor = getComputedStyle(alvo).getPropertyValue('--warn-surface').trim() || 'transparent'
    alvo.animate?.(
      [
        { backgroundColor: cor, boxShadow: `0 0 0 6px ${cor}` },
        { backgroundColor: cor, boxShadow: `0 0 0 6px ${cor}`, offset: 0.7 },
        { backgroundColor: 'transparent', boxShadow: '0 0 0 6px transparent' },
      ],
      { duration: ACESO_MS, easing: 'ease-out' },
    )
  }

  timer = setTimeout(procurar, PASSO_MS)
  return () => {
    if (timer !== null) clearTimeout(timer)
  }
}
