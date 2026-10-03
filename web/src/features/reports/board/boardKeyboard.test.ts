import type { KeyboardCoordinateGetter } from '@dnd-kit/core'
import { describe, expect, it, vi } from 'vitest'
import { boardKeyboardCoordinates } from '@/features/reports/board/boardKeyboard'
import type { BoardColumn, BoardItems } from '@/features/reports/board/boardState'

/**
 * O QUE ESTES TESTES TRAVAM: para onde as setas levam o card arrastado pelo teclado.
 *
 * - **Para cima e para baixo, o vizinho da mesma coluna** — a partir de onde o card
 *   esta agora (o card sobre o qual ele esta), e nunca um card da coluna ao lado.
 * - **Para os lados, o topo da proxima coluna que recebe card**, pulando "Sem coluna"
 *   e a aposentada.
 * - **No fim da linha nao ha para onde ir**, e as outras teclas nao sao com ela.
 */
const coluna = (key: string, accepts = true): BoardColumn => ({
  key,
  name: key,
  accepts,
  retired: !accepts,
  closes: false,
  last: false,
  total: 0,
})

const COLUNAS = [coluna('none', false), coluna('a'), coluna('velha', false), coluna('b')]
const ITENS: BoardItems = { none: ['n1'], a: ['a1', 'a2', 'a3'], velha: [], b: ['b1'] }

const rect = (left: number, top: number, height = 40) => ({
  left,
  top,
  width: 200,
  height,
  right: left + 200,
  bottom: top + height,
})

// Uma coluna por 300px; os cards a cada 50px, a partir de 100.
const RECTS = new Map<string, ReturnType<typeof rect>>([
  ['none', rect(0, 90, 400)],
  ['a', rect(300, 90, 400)],
  ['velha', rect(600, 90, 400)],
  ['b', rect(900, 90, 400)],
  ['n1', rect(0, 100)],
  ['a1', rect(300, 100)],
  ['a2', rect(300, 150)],
  ['a3', rect(300, 200)],
  ['b1', rect(900, 100)],
])

function setas(): KeyboardCoordinateGetter {
  return boardKeyboardCoordinates({ current: COLUNAS }, { current: ITENS })
}

function tecla(code: string, ativo: string, sobre: string | null = ativo) {
  const evento = { code, preventDefault: vi.fn() } as unknown as KeyboardEvent
  const contexto = {
    active: { id: ativo },
    over: sobre ? { id: sobre } : null,
    collisionRect: rect(0, 0),
    droppableRects: RECTS,
  }
  const resultado = setas()(evento, {
    active: ativo,
    currentCoordinates: { x: 0, y: 0 },
    context: contexto,
  } as never)
  return { resultado, evento }
}

describe('as setas no quadro', () => {
  it('para baixo e para cima: o vizinho na mesma coluna, a partir de onde o card esta agora', () => {
    // Descendo, a borda de baixo encosta na do vizinho.
    expect(tecla('ArrowDown', 'a1').resultado).toEqual({ x: 300, y: 150 + 40 - 40 })
    // Ja sobre a2, a proxima descida vai ate a3.
    expect(tecla('ArrowDown', 'a1', 'a2').resultado).toEqual({ x: 300, y: 200 })
    expect(tecla('ArrowUp', 'a3').resultado).toEqual({ x: 300, y: 150 })
    // No fundo, nao ha para onde descer — nem para um card da coluna ao lado.
    expect(tecla('ArrowDown', 'a3').resultado).toBeUndefined()
  })

  it('para os lados: o topo da proxima coluna que recebe card, pulando a aposentada e "Sem coluna"', () => {
    expect(tecla('ArrowRight', 'a2').resultado).toEqual({ x: 900, y: 90 })
    expect(tecla('ArrowLeft', 'b1').resultado).toEqual({ x: 300, y: 90 })
    expect(tecla('ArrowLeft', 'a1').resultado).toBeUndefined()
    // De "Sem coluna", a direita e a primeira que recebe.
    expect(tecla('ArrowRight', 'n1').resultado).toEqual({ x: 300, y: 90 })
  })

  it('as outras teclas nao sao com ela, e as setas nao rolam a pagina', () => {
    const { resultado, evento } = tecla('Enter', 'a1')
    expect(resultado).toBeUndefined()
    expect(evento.preventDefault).not.toHaveBeenCalled()
    expect(tecla('ArrowDown', 'a1').evento.preventDefault).toHaveBeenCalled()
  })
})
