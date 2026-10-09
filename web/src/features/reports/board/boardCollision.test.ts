import type { Active, ClientRect, CollisionDetection, DroppableContainer } from '@dnd-kit/core'
import { describe, expect, it } from 'vitest'
import { boardCollision } from '@/features/reports/board/boardCollision'
import type { BoardItems } from '@/features/reports/board/boardState'

/**
 * O QUE ESTES TESTES TRAVAM: onde o card cai, com a geometria de um quadro de verdade
 * — colunas esticadas ate a altura da mais cheia.
 *
 * - **A coluna vazia recebe**: o ponteiro nela da a coluna, e nao um card da coluna
 *   ao lado (a conta pelos cantos dava).
 * - **Fora das colunas, nada**: soltar no cabecalho, ou numa coluna que nao recebe,
 *   devolve o card.
 * - **Numa coluna com cards, o card**: o de baixo do ponteiro, ou o mais perto.
 * - **O teclado usa um ponteiro na ponta de cima do card**, que as setas poem dentro
 *   do alvo: o card alto cobria dois vizinhos pelo retangulo inteiro, e o de baixo
 *   ganhava a conta — o card caia um lugar abaixo, ou ia e voltava.
 * - **So contam os cards a vista**: o card rolado para fora da lista da coluna fica com
 *   o retangulo debaixo do cabecalho, e mirar ali punha o card onde ninguem via.
 */
const retangulo = (left: number, top: number, width: number, height: number): ClientRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
})

// Tres colunas de 280 px, com 12 de folga; "Sem coluna" antes delas, que nao recebe.
const RETANGULOS = new Map<string, ClientRect>([
  ['a', retangulo(300, 100, 280, 800)],
  ['a1', retangulo(308, 104, 264, 80)],
  ['a2', retangulo(308, 192, 264, 80)],
  ['b', retangulo(592, 100, 280, 800)],
  ['c', retangulo(884, 100, 280, 800)],
  ['c1', retangulo(892, 104, 264, 80)],
])
const ITENS: BoardItems = { none: ['s1'], a: ['a1', 'a2'], b: [], c: ['c1'] }

function onde(ponteiro: { x: number; y: number } | null, card: ClientRect): string[] {
  const colisao: CollisionDetection = boardCollision({ current: ITENS })
  // So os alvos que recebem: a biblioteca nunca passa os desligados ("Sem coluna" e
  // os cards dela).
  const alvos = [...RETANGULOS.keys()].map((id) => ({ id }) as unknown as DroppableContainer)
  return colisao({
    active: { id: 'a2' } as unknown as Active,
    collisionRect: card,
    droppableRects: RETANGULOS,
    droppableContainers: alvos,
    pointerCoordinates: ponteiro,
  }).map((colisao) => String(colisao.id))
}

describe('onde o card arrastado cai', () => {
  it('o ponteiro na coluna vazia: a coluna, e nao um card da coluna ao lado', () => {
    expect(onde({ x: 700, y: 130 }, retangulo(600, 110, 264, 80))).toEqual(['b'])
  })

  it('o ponteiro sobre um card: o card', () => {
    expect(onde({ x: 400, y: 220 }, retangulo(320, 190, 264, 80))).toEqual(['a2'])
  })

  it('o ponteiro na coluna, longe dos cards: o card mais perto do arrastado', () => {
    expect(onde({ x: 1000, y: 800 }, retangulo(900, 760, 264, 80))).toEqual(['c1'])
  })

  it('fora das colunas — no cabecalho, ou em "Sem coluna" —, nada: soltar ali devolve o card', () => {
    expect(onde({ x: 700, y: 20 }, retangulo(600, 0, 264, 80))).toEqual([])
    expect(onde({ x: 150, y: 200 }, retangulo(20, 160, 264, 80))).toEqual([])
  })

  it('no teclado vale a ponta de cima do card: no alto da coluna vazia, a coluna; na que tem card, o card', () => {
    expect(onde(null, retangulo(592, 100, 264, 80))).toEqual(['b'])
    expect(onde(null, retangulo(884, 100, 264, 80))).toEqual(['c1'])
    // Parado sobre a coluna que nao recebe: nada.
    expect(onde(null, retangulo(20, 104, 264, 80))).toEqual([])
  })
})

describe('o teclado e a rolagem da coluna', () => {
  // Uma coluna com tres cards; o card na mao e alto (200 px).
  const caixas = new Map<string, ClientRect>([
    ['c', retangulo(884, 100, 280, 800)],
    ['c1', retangulo(892, 104, 264, 80)],
    ['c2', retangulo(892, 192, 264, 80)],
    ['c3', retangulo(892, 280, 264, 80)],
  ])
  const itens: BoardItems = { c: ['c1', 'c2', 'c3'] }

  /** Os alvos, com a janela que rola a lista mostrando so de `topo` a `fundo`. */
  const alvos = (topo: number, fundo: number) => {
    const no = { closest: () => ({ getBoundingClientRect: () => ({ top: topo, bottom: fundo }) }) }
    return [...caixas.keys()].map(
      (id) => ({ id, node: { current: no } }) as unknown as DroppableContainer,
    )
  }

  function onde2(
    ponteiro: { x: number; y: number } | null,
    card: ClientRect,
    containers = alvos(0, 2000),
  ) {
    return boardCollision({ current: itens })({
      active: { id: 'x' } as unknown as Active,
      collisionRect: card,
      droppableRects: caixas,
      droppableContainers: containers,
      pointerCoordinates: ponteiro,
    }).map((colisao) => String(colisao.id))
  }

  it('no teclado, a ponta de cima do card manda: o card alto posto em c2 fica em c2, e nao no de baixo', () => {
    // As setas poem a ponta de cima do card dentro de c2; o resto dele cobre c3.
    expect(onde2(null, retangulo(892, 192, 264, 200))).toEqual(['c2'])
    expect(onde2(null, retangulo(892, 104, 264, 200))).toEqual(['c1'])
  })

  it('o card rolado para fora da lista nao e alvo, mesmo com o ponteiro sobre o retangulo dele', () => {
    // A lista rolou: c1 saiu por cima (a vista, so de 190 para baixo). O ponteiro esta
    // sobre o retangulo de c1, que ficou debaixo do cabecalho: o alvo e o mais perto a vista.
    expect(onde2({ x: 900, y: 150 }, retangulo(892, 120, 264, 80), alvos(190, 900))).toEqual(['c2'])
    // Com tudo a vista, o de baixo do ponteiro.
    expect(onde2({ x: 900, y: 150 }, retangulo(892, 120, 264, 80))).toEqual(['c1'])
  })

  it('nenhum card a vista: a propria coluna', () => {
    expect(onde2({ x: 900, y: 150 }, retangulo(892, 120, 264, 80), alvos(1000, 1400))).toEqual([
      'c',
    ])
  })
})
