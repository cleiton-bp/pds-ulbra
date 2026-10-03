import { describe, expect, it } from 'vitest'
import { type ReportStateCountViewModel, WITHOUT_STATE_FILTER } from '@/contracts'
import { boardColumns, cardAbove, columnOf, moveBetween } from '@/features/reports/board/boardState'

/**
 * O QUE ESTES TESTES TRAVAM: quais colunas o quadro mostra, e a ordem dos cards.
 *
 * - **"Sem coluna" vem primeiro, so quando tem card, e nao recebe card.**
 * - **A aposentada so aparece se ainda segurar card**, marcada, e nao recebe.
 * - **A ultima ativa** e a da regra dos dias — com uma coluna so, nenhuma, porque ai
 *   ela e a entrada da fila; a que encerra vem da contagem.
 * - Mover um card nao muda o quadro de entrada, e o card de cima do topo e nenhum.
 */
const linha = (extra: Partial<ReportStateCountViewModel>): ReportStateCountViewModel => ({
  StatePublicId: 's',
  StateName: 'S',
  IsActive: true,
  ClosesReport: false,
  Total: 0,
  ...extra,
})

describe('as colunas do quadro', () => {
  it('sem coluna primeiro; a aposentada vazia some; a ultima ativa e a da regra dos dias', () => {
    const colunas = boardColumns([
      linha({ StatePublicId: 'a', StateName: 'Análise', Total: 2 }),
      linha({ StatePublicId: 'v', StateName: 'Velha', IsActive: false, Total: 0 }),
      linha({ StatePublicId: 'p', StateName: 'Parada', IsActive: false, Total: 3 }),
      linha({ StatePublicId: 'f', StateName: 'Feito', ClosesReport: true, Total: 9 }),
      linha({ StatePublicId: null, StateName: null, Total: 1 }),
    ])

    expect(colunas.map((coluna) => coluna.key)).toEqual([WITHOUT_STATE_FILTER, 'a', 'p', 'f'])
    expect(colunas.map((coluna) => coluna.accepts)).toEqual([false, true, false, true])
    expect(colunas.find((coluna) => coluna.key === 'p')?.retired).toBe(true)
    expect(colunas.filter((coluna) => coluna.last).map((coluna) => coluna.key)).toEqual(['f'])
    expect(colunas.find((coluna) => coluna.key === 'f')?.closes).toBe(true)
    expect(colunas[0]?.name).toBe('Sem coluna')
  })

  it('com uma coluna ativa so, a regra dos dias nao vale: ela e a entrada da fila', () => {
    const colunas = boardColumns([
      linha({ StatePublicId: 'a', StateName: 'Análise', Total: 30 }),
      linha({ StatePublicId: 'p', StateName: 'Parada', IsActive: false, Total: 3 }),
    ])
    expect(colunas.map((coluna) => coluna.key)).toEqual(['a', 'p'])
    expect(colunas.some((coluna) => coluna.last)).toBe(false)
  })

  it('sem card fora da fila, "Sem coluna" nem aparece', () => {
    const colunas = boardColumns([
      linha({ StatePublicId: 'a', Total: 0 }),
      linha({ StatePublicId: null, StateName: null, Total: 0 }),
    ])
    expect(colunas.map((coluna) => coluna.key)).toEqual(['a'])
  })
})

describe('a ordem dos cards', () => {
  it('mover tira de onde estava e poe no lugar pedido, sem mexer no quadro de entrada', () => {
    const quadro = { a: ['1', '2'], b: ['3'] }
    const novo = moveBetween(quadro, '2', 'b', 0)

    expect(novo).toEqual({ a: ['1'], b: ['2', '3'] })
    expect(quadro).toEqual({ a: ['1', '2'], b: ['3'] })
    expect(moveBetween(quadro, '1', 'b', 99)).toEqual({ a: ['2'], b: ['3', '1'] })
    expect(columnOf(novo, '2')).toBe('b')
    expect(columnOf(novo, 'x')).toBeUndefined()
  })

  it('o card de cima: nenhum no topo, o anterior no resto', () => {
    expect(cardAbove(['1', '2', '3'], '1')).toBeNull()
    expect(cardAbove(['1', '2', '3'], '3')).toBe('2')
  })
})
