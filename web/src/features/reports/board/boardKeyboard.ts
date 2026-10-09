import type { ClientRect, KeyboardCoordinateGetter } from '@dnd-kit/core'
import type { RefObject } from 'react'
import { isVisibleIn, visibleArea } from '@/features/reports/board/boardCollision'
import {
  type BoardColumn,
  type BoardItems,
  cellKey,
  columnOf,
  splitCell,
} from '@/features/reports/board/boardState'

/**
 * Para onde as setas levam o card no quadro, quando ele e arrastado pelo teclado.
 *
 * **Pela ordem das colunas e dos cards, e nao pela distancia na tela.** A conta
 * pronta da biblioteca escolhe o alvo mais perto em cada direcao — e a propria coluna
 * do card, que comeca uns pixels a esquerda dele, contava como "a esquerda": o card do
 * fundo da coluna nao saia do lugar. E a seta para baixo podia pular para um card da
 * coluna ao lado, se ele estivesse mais perto que o de baixo.
 *
 * **O lugar devolvido e um ponto dentro do alvo**: a conta de onde o card cai, no
 * teclado, olha a ponta de cima dele (`boardCollision`). Na metade de cima do alvo, o
 * card fica antes dele; na de baixo, depois.
 *
 * - **Para cima e para baixo**: o vizinho na mesma coluna — a partir de onde o card
 *   esta agora, que e o card sobre o qual ele esta.
 * - **Para os lados**: a proxima coluna que recebe card, **na altura em que o card
 *   esta**, entre os cards dela a vista — antes do mais perto dessa altura, ou depois
 *   do ultimo. "Sem coluna" e a aposentada ficam para tras. O topo da coluna ficava
 *   fora da tela com a pagina rolada; o card ia para la e voltava, sem parar, e a tela
 *   inteira caia.
 *
 * **Com raias**, `items` sao as celulas (coluna e raia). Para cima e para baixo, na
 * ponta da celula, o card passa para a raia de cima ou de baixo, na mesma coluna —
 * para o fim dela subindo, para o comeco descendo; a raia recolhida fica para tras.
 * Para os lados, a mesma raia da proxima coluna que recebe.
 *
 * As referencias sao lidas na hora de cada tecla: as colunas mudam com a contagem, e
 * a ordem muda enquanto o card passa de uma coluna para a outra.
 */
export function boardKeyboardCoordinates(
  columns: RefObject<BoardColumn[]>,
  items: RefObject<BoardItems>,
  lanes?: RefObject<string[] | null>,
): KeyboardCoordinateGetter {
  return (
    evento,
    { context: { active, over, collisionRect, droppableRects, droppableContainers } },
  ) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(evento.code)) return undefined
    evento.preventDefault()
    if (!active || !collisionRect) return undefined

    const itens = items.current
    const id = String(active.id)
    const aqui = columnOf(itens, id)
    if (aqui === undefined) return undefined
    const { coluna: colunaAqui, raia } = splitCell(aqui)

    /** Antes do card: a ponta de cima dele. */
    const antes = (rect: ClientRect) => ({ x: rect.left, y: rect.top })
    /** Depois do card: a metade de baixo dele. */
    const depois = (rect: ClientRect) => ({ x: rect.left, y: rect.top + rect.height / 2 + 1 })

    if (evento.code === 'ArrowUp' || evento.code === 'ArrowDown') {
      const ids = itens[aqui] ?? []
      const referencia = over && ids.includes(String(over.id)) ? String(over.id) : id
      const indice = ids.indexOf(referencia)
      const alvo = evento.code === 'ArrowUp' ? ids[indice - 1] : ids[indice + 1]
      if (alvo === undefined) return paraOutraRaia(evento.code === 'ArrowUp' ? -1 : 1)
      const rect = droppableRects.get(alvo)
      if (!rect) return undefined
      // Na mesma celula, o lugar e o do vizinho: a biblioteca arruma pela ordem.
      return antes(rect)
    }

    const colunas = columns.current
    const ordem = colunas.map((coluna) => coluna.key)
    const passo = evento.code === 'ArrowRight' ? 1 : -1

    for (let j = ordem.indexOf(colunaAqui) + passo; j >= 0 && j < ordem.length; j += passo) {
      const coluna = colunas[j]
      if (!coluna?.accepts) continue
      return naAltura(cellKey(coluna.key, raia))
    }

    return undefined

    /**
     * O lugar na celula vizinha na altura em que o card esta agora: antes do card dela
     * mais perto dessa altura, ou depois do ultimo, quando o card esta abaixo de todos.
     * So os cards a vista contam; sem nenhum, o mais perto e rolado ate a vista antes.
     * Na celula vazia, a propria celula.
     */
    function naAltura(celula: string) {
      const caixa = droppableRects.get(celula)
      if (!caixa || !collisionRect) return undefined
      const altura = collisionRect.top + 1

      const cards = (itens[celula] ?? []).flatMap((card) => {
        const rect = droppableRects.get(card)
        return card !== id && rect ? [{ card, rect }] : []
      })
      if (cards.length === 0) return { x: caixa.left, y: Math.max(caixa.top, 0) }

      const aVista = cards.filter(({ card, rect }) =>
        isVisibleIn(rect, visibleArea(droppableContainers?.get?.(card))),
      )
      const distancia = (rect: ClientRect) =>
        altura < rect.top ? rect.top - altura : altura > rect.bottom ? altura - rect.bottom : 0
      const perto = (aVista.length > 0 ? aVista : cards).reduce((melhor, item) =>
        distancia(item.rect) < distancia(melhor.rect) ? item : melhor,
      )

      // Nenhum a vista: o mais perto vem para a vista, e o retangulo dele ja diz o
      // lugar novo (a biblioteca o corrige pela rolagem).
      if (aVista.length === 0)
        droppableContainers?.get?.(perto.card)?.node.current?.scrollIntoView({ block: 'nearest' })
      const rect = droppableRects.get(perto.card) ?? perto.rect
      const ultimo = cards.at(-1)
      return perto.card === ultimo?.card && altura > rect.top + rect.height / 2
        ? depois(rect)
        : antes(rect)
    }

    /** Na ponta da celula: a celula da raia vizinha, na mesma coluna, que esteja na tela. */
    function paraOutraRaia(sentido: 1 | -1) {
      const raias = lanes?.current
      if (!raias || raia === null) return undefined
      for (let k = raias.indexOf(raia) + sentido; k >= 0 && k < raias.length; k += sentido) {
        const celula = cellKey(colunaAqui, raias[k] ?? '')
        const caixa = droppableRects.get(celula)
        if (!caixa) continue
        const cards = itens[celula] ?? []
        const ponta = sentido === 1 ? cards[0] : cards.at(-1)
        const rect = ponta === undefined ? undefined : droppableRects.get(ponta)
        if (!rect) return { x: caixa.left, y: caixa.top }
        return sentido === 1 ? antes(rect) : depois(rect)
      }
      return undefined
    }
  }
}
