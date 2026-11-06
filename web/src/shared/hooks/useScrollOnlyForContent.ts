import { type RefObject, useLayoutEffect } from 'react'

/**
 * A area que rola para o lado so rola quando ha conteudo escondido, e nao pela folga.
 *
 * O bloco de codigo tem uma folga vazia a direita de cada linha. Quando a linha mais
 * longa cabia e so a folga passava da largura (por 1 px de arredondamento, ou por uns
 * poucos), o bloco ganhava rolagem lateral para mostrar espaco em branco, e a barra
 * aparecia sob o mouse. Aqui, se o que passa e no maximo a folga, a area deixa de rolar
 * (`overflow-x: hidden` no proprio elemento); o que fica escondido e a folga, vazia,
 * entao nada some. Confere de novo quando a area ou o conteudo mudam de tamanho.
 *
 * Sem `ResizeObserver` (o jsdom dos testes), nao faz nada: a area rola como antes.
 */
export function useScrollOnlyForContent(ref: RefObject<HTMLElement | null>, folga: number): void {
  useLayoutEffect(() => {
    const area = ref.current
    if (!area || typeof ResizeObserver === 'undefined') return
    const conferir = () => {
      area.style.removeProperty('overflow-x')
      const sobra = area.scrollWidth - area.clientWidth
      if (sobra > 0 && sobra <= folga) area.style.overflowX = 'hidden'
    }
    conferir()
    // A propria area (a janela mudou) e o que esta dentro dela (o codigo trocou).
    const observador = new ResizeObserver(conferir)
    observador.observe(area)
    for (const filho of area.children) observador.observe(filho)
    return () => observador.disconnect()
  }, [ref, folga])
}
