import { type RefObject, useCallback, useEffect, useLayoutEffect, useState } from 'react'

/**
 * A borda direita esmaece enquanto ha mais para ver rolando de lado. Rolar dentro da
 * caixa e de proposito (a tabela larga e as acoes em lote do Trabalho, as abas de
 * linguagem do editor de codigo), mas sem a dica ninguem sabe que ha mais: a ultima
 * coluna ou aba cortada parecia o fim.
 */
export const FADE_RIGHT =
  '[mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)]'

/**
 * Ate 8 px escondidos e so o respiro da ultima celula (ou do ultimo botao), nada que se
 * leia. Sem essa folga, a tabela que passava 3 px da moldura esmaecia a ultima coluna
 * inteira, e na tela larga perdia o cabecalho preso por causa de um respiro.
 */
const FOLGA = 8

/**
 * Mede a caixa que pode rolar de lado: se o conteudo passa da largura dela (`transborda`)
 * e se ainda falta ver a direita (`maisADireita`). Mede ao rolar, ao mudar de tamanho e a
 * cada render, porque um item novo muda a largura do conteudo sem mudar a da caixa.
 */
export function useSideScroll(ref: RefObject<HTMLElement | null>) {
  const [medida, setMedida] = useState({ transborda: false, maisADireita: false })

  const medir = useCallback(() => {
    const caixa = ref.current
    if (!caixa) return
    const transborda = caixa.scrollWidth - caixa.clientWidth > FOLGA
    const maisADireita = caixa.scrollWidth - caixa.scrollLeft - caixa.clientWidth > FOLGA
    setMedida((antes) =>
      antes.transborda === transborda && antes.maisADireita === maisADireita
        ? antes
        : { transborda, maisADireita },
    )
  }, [ref])

  // Sem lista de dependencias de proposito: o conteudo muda sem a caixa mudar de tamanho.
  useLayoutEffect(() => {
    medir()
  })

  useEffect(() => {
    const caixa = ref.current
    if (!caixa) return
    caixa.addEventListener('scroll', medir, { passive: true })
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir)
    observador?.observe(caixa)
    // O conteudo cresce sozinho (uma coluna que entra pela largura): observar so a caixa
    // nao veria a tabela ficar mais larga que ela.
    if (caixa.firstElementChild) observador?.observe(caixa.firstElementChild)
    return () => {
      caixa.removeEventListener('scroll', medir)
      observador?.disconnect()
    }
  }, [ref, medir])

  return medida
}
