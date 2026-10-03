import {
  type CollisionDetection,
  closestCenter,
  pointerWithin,
  rectIntersection,
} from '@dnd-kit/core'
import type { RefObject } from 'react'
import type { BoardItems } from '@/features/reports/board/boardState'

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
 * **Teclado: o retangulo do card**, que as setas poem no lugar (`boardKeyboard`).
 *
 * **Sobre uma coluna com cards, vale o card mais perto**: e ele que diz o lugar. Sobre
 * a coluna vazia, a propria coluna.
 */
export function boardCollision(items: RefObject<BoardItems>): CollisionDetection {
  return (args) => {
    const colisoes = args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)
    const primeira = colisoes[0]
    if (!primeira) return []

    const daColuna = items.current[String(primeira.id)]
    if (!daColuna || daColuna.length === 0) return [primeira]

    const [maisPerto] = closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((alvo) =>
        daColuna.includes(String(alvo.id)),
      ),
    })
    return [maisPerto ?? primeira]
  }
}
