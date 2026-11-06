import { type RefObject, useLayoutEffect, useState } from 'react'

/**
 * Se a tela passa da altura da area mesmo com uma folga pequena no pe, a mesma do topo.
 *
 * A area das telas tem uma folga grande embaixo, para o fim da tela (o arquivar, o
 * salvar) subir longe da borda da janela. Numa tela curta, essa folga sozinha passava da
 * altura, e a pagina rolava uns poucos px so para mostrar espaco vazio, com a barra
 * aparecendo sob o mouse. Com isto, a folga grande so entra quando a tela ja rolaria de
 * qualquer jeito: a tela que cabe nao rola, e a que rola mostra conteudo de verdade.
 *
 * A medida nao muda com a folga: a altura do conteudo nao depende do respiro do pe, e a
 * da area tambem nao. Confere de novo quando a janela muda e quando o conteudo cresce ou
 * encolhe (a lista que chega, o grupo que abre). `chave` e a tela da vez: trocando, o
 * conteudo e outro elemento, e e ele que passa a ser observado.
 */
export function useNeedsBottomRoom(
  area: RefObject<HTMLElement | null>,
  conteudo: RefObject<HTMLElement | null>,
  chave: string,
): boolean {
  const [precisa, setPrecisa] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: a chave troca o elemento observado
  useLayoutEffect(() => {
    const caixa = area.current
    const dentro = conteudo.current
    if (!caixa || !dentro || typeof ResizeObserver === 'undefined') return
    const medir = () => {
      const topo = Number.parseFloat(getComputedStyle(caixa).paddingTop) || 0
      setPrecisa(dentro.offsetHeight + 2 * topo > caixa.clientHeight)
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(caixa)
    observador.observe(dentro)
    return () => observador.disconnect()
  }, [area, conteudo, chave])

  return precisa
}
