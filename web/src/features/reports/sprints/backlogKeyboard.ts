import type { KeyboardCoordinateGetter } from '@dnd-kit/core'
import type { RefObject } from 'react'

/**
 * As setas no arraste pelo teclado do backlog. **Atravessam as listas**: para cima, o
 * card vai para cima do vizinho, e do primeiro da lista sobe para o fim da lista de
 * cima; para baixo, o contrario. O calculo de fabrica para listas ordenadas nao sai da
 * lista em que o card comecou.
 */
export function backlogKeyboardCoordinates(
  secoes: RefObject<string[]>,
  listas: RefObject<Record<string, string[]> | null>,
): KeyboardCoordinateGetter {
  return (evento, { context: { active, over, collisionRect, droppableRects } }) => {
    if (evento.code !== 'ArrowUp' && evento.code !== 'ArrowDown') return undefined
    evento.preventDefault()
    if (!active || !collisionRect) return undefined

    const todas = listas.current ?? {}
    const ordem = secoes.current ?? []
    const id = String(active.id)
    const aqui = ordem.find((secao) => todas[secao]?.includes(id))
    if (aqui === undefined) return undefined

    const ids = todas[aqui] ?? []
    const referencia = over && ids.includes(String(over.id)) ? String(over.id) : id
    const indice = ids.indexOf(referencia)
    const subindo = evento.code === 'ArrowUp'

    const vizinho = subindo ? ids[indice - 1] : ids[indice + 1]
    if (vizinho !== undefined) {
      const rect = droppableRects.get(vizinho)
      if (!rect) return undefined
      return subindo
        ? { x: rect.left, y: rect.top }
        : { x: rect.left, y: rect.top + rect.height - collisionRect.height }
    }

    // Saiu da lista: o fim da de cima, ou o comeco da de baixo — ou a lista vazia.
    const outra = ordem[ordem.indexOf(aqui) + (subindo ? -1 : 1)]
    if (outra === undefined) return undefined
    const daOutra = todas[outra] ?? []
    const encosto = subindo ? daOutra[daOutra.length - 1] : daOutra[0]
    const rect = droppableRects.get(encosto ?? outra)
    if (!rect) return undefined
    return subindo
      ? { x: rect.left, y: rect.top + rect.height - collisionRect.height }
      : { x: rect.left, y: rect.top }
  }
}
