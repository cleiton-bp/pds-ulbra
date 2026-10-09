import {
  type ClientRect,
  type CollisionDetection,
  closestCenter,
  type DroppableContainer,
  pointerWithin,
} from '@dnd-kit/core'
import type { RefObject } from 'react'
import type { BoardItems } from '@/features/reports/board/boardState'

/** A marca da janela que rola os cards: a lista da coluna, ou o quadro inteiro com raias. */
export const BOARD_SCROLL = 'data-board-scroll'

/**
 * O pedaco da tela em que o card esta a vista: a janela que rola a lista dele, ou
 * nulo quando nao ha nenhuma (nos testes, sem DOM).
 */
export function visibleArea(alvo: DroppableContainer | undefined): DOMRect | null {
  const no = alvo?.node?.current
  return no?.closest?.(`[${BOARD_SCROLL}]`)?.getBoundingClientRect() ?? null
}

/** O retangulo cruza o pedaco a vista: sem pedaco conhecido, conta como a vista. */
export function isVisibleIn(rect: ClientRect, area: DOMRect | null): boolean {
  return area === null || (rect.bottom > area.top && rect.top < area.bottom)
}

/**
 * Sobre o que o card arrastado esta — e, portanto, onde ele cai.
 *
 * **Mouse e toque: so o que esta debaixo do ponteiro.** Fora das colunas que recebem
 * card — no cabecalho, na lateral, em "Sem coluna" ou na aposentada —, nada, e soltar
 * ali devolve o card. A conta pronta da biblioteca escolhia sempre o alvo mais perto
 * pelos cantos: a coluna vazia, esticada ate a altura da mais cheia, nunca ganhava de
 * um card da coluna ao lado; soltar fora do quadro arrumava o card; e o card de "Sem
 * coluna" ia para a fila so de ser segurado.
 *
 * **Teclado: um ponteiro na ponta de cima do card**, que as setas poem dentro do alvo
 * (`boardKeyboard`). Pelo retangulo inteiro, o card alto cobria dois vizinhos, e o
 * de baixo ganhava a conta tanto quanto o de cima: o card caia um lugar abaixo, ou
 * ia e voltava entre duas colunas.
 *
 * **A celula (ou a coluna) debaixo do ponteiro manda**, e dentro dela o card debaixo
 * do ponteiro, ou o mais perto. So contam os cards a vista: a lista da coluna rola
 * por dentro, e o card rolado para fora continua com o retangulo debaixo do cabecalho
 * — mirar o cabecalho punha o card num lugar que ninguem via.
 */
export function boardCollision(items: RefObject<BoardItems>): CollisionDetection {
  return (args) => {
    const ponteiro =
      args.pointerCoordinates ??
      (args.collisionRect
        ? { x: args.collisionRect.left + 1, y: args.collisionRect.top + 1 }
        : null)
    const colisoes = pointerWithin({ ...args, pointerCoordinates: ponteiro })
    const celulas = items.current
    const primeira = colisoes.find((colisao) => String(colisao.id) in celulas) ?? colisoes[0]
    if (!primeira) return []

    const daCelula = celulas[String(primeira.id)]
    if (!daCelula || daCelula.length === 0) return [primeira]

    // Os cards desta celula a vista, pela janela que rola cada um.
    const aVista = args.droppableContainers.filter((alvo) => {
      if (!daCelula.includes(String(alvo.id))) return false
      const rect = args.droppableRects.get(alvo.id)
      return rect !== undefined && isVisibleIn(rect, visibleArea(alvo))
    })

    const debaixo = colisoes.find((colisao) => aVista.some((alvo) => alvo.id === colisao.id))
    if (debaixo) return [debaixo]
    if (aVista.length === 0) return [primeira]

    const [maisPerto] = closestCenter({ ...args, droppableContainers: aVista })
    return [maisPerto ?? primeira]
  }
}
