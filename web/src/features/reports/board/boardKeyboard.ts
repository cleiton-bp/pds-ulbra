import type { KeyboardCoordinateGetter } from '@dnd-kit/core'
import type { RefObject } from 'react'
import { type BoardColumn, type BoardItems, columnOf } from '@/features/reports/board/boardState'

/**
 * Para onde as setas levam o card no quadro, quando ele e arrastado pelo teclado.
 *
 * **Pela ordem das colunas e dos cards, e nao pela distancia na tela.** A conta
 * pronta da biblioteca escolhe o alvo mais perto em cada direcao — e a propria coluna
 * do card, que comeca uns pixels a esquerda dele, contava como "a esquerda": o card do
 * fundo da coluna nao saia do lugar. E a seta para baixo podia pular para um card da
 * coluna ao lado, se ele estivesse mais perto que o de baixo.
 *
 * - **Para cima e para baixo**: o vizinho na mesma coluna — a partir de onde o card
 *   esta agora, que e o card sobre o qual ele esta.
 * - **Para os lados**: o topo da proxima coluna que recebe card. "Sem coluna" e a
 *   aposentada ficam para tras.
 *
 * As referencias sao lidas na hora de cada tecla: as colunas mudam com a contagem, e
 * a ordem muda enquanto o card passa de uma coluna para a outra.
 */
export function boardKeyboardCoordinates(
  columns: RefObject<BoardColumn[]>,
  items: RefObject<BoardItems>,
): KeyboardCoordinateGetter {
  return (evento, { context: { active, over, collisionRect, droppableRects } }) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(evento.code)) return undefined
    evento.preventDefault()
    if (!active || !collisionRect) return undefined

    const itens = items.current
    const id = String(active.id)
    const aqui = columnOf(itens, id)
    if (aqui === undefined) return undefined

    if (evento.code === 'ArrowUp' || evento.code === 'ArrowDown') {
      const ids = itens[aqui] ?? []
      const referencia = over && ids.includes(String(over.id)) ? String(over.id) : id
      const indice = ids.indexOf(referencia)
      const alvo = evento.code === 'ArrowUp' ? ids[indice - 1] : ids[indice + 1]
      const rect = alvo === undefined ? undefined : droppableRects.get(alvo)
      if (!rect) return undefined

      // Descendo, a borda de baixo do card encosta na do vizinho: e o que o poe
      // depois dele. Subindo, as bordas de cima.
      return evento.code === 'ArrowDown'
        ? { x: rect.left, y: rect.top + rect.height - collisionRect.height }
        : { x: rect.left, y: rect.top }
    }

    const colunas = columns.current
    const ordem = colunas.map((coluna) => coluna.key)
    const passo = evento.code === 'ArrowRight' ? 1 : -1

    for (let j = ordem.indexOf(aqui) + passo; j >= 0 && j < ordem.length; j += passo) {
      const coluna = colunas[j]
      if (!coluna?.accepts) continue
      const rect = droppableRects.get(coluna.key)
      return rect ? { x: rect.left, y: rect.top } : undefined
    }

    return undefined
  }
}
