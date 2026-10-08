import { describe, expect, it } from 'vitest'
import { type ReportStateCountViewModel, WITHOUT_STATE_FILTER } from '@/contracts'
import {
  boardCells,
  boardColumns,
  boardLanes,
  cardAbove,
  cellKey,
  columnOf,
  laneOfCard,
  moveBetween,
  moveToCell,
  NO_LANE,
  splitCell,
} from '@/features/reports/board/boardState'

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

/**
 * As raias: quais aparecem e em que ordem, as celulas (coluna x raia) e o lugar de um
 * card solto numa celula, na ordem da coluna inteira.
 */
describe('as raias do quadro', () => {
  const pessoa = (id: string, nome: string | null) => ({
    UserPublicId: id,
    Name: nome,
    AvatarUrl: null,
    InTeam: true,
  })
  const prioridade = (id: string, nome: string) => ({
    PublicId: id,
    Name: nome,
    Color: 'Red' as const,
    IsActive: true,
  })

  it('por responsavel: as pessoas com card em ordem alfabetica, e "Sem responsavel" sempre por ultimo', () => {
    const raias = boardLanes(
      [
        { Assignee: pessoa('u2', 'Bruno'), Priority: null },
        { Assignee: pessoa('u1', 'Ana'), Priority: null },
        { Assignee: pessoa('u2', 'Bruno'), Priority: null },
        { Assignee: pessoa('u3', null), Priority: null },
      ],
      'assignee',
      null,
    )
    expect(raias.map((raia) => raia.name)).toEqual([
      'Ana',
      'Bruno',
      'Pessoa sem nome',
      'Sem responsável',
    ])
    expect(raias.at(-1)?.key).toBe(NO_LANE)
    // Sem card nenhum, so a raia "sem": e onde se solta para tirar o campo.
    expect(boardLanes([], 'assignee', null)).toEqual([
      { key: NO_LANE, name: 'Sem responsável', accepts: true },
    ])
    // Quem saiu do time aparece com os cards dele, mas nao recebe.
    const saiu = boardLanes(
      [{ Assignee: { ...pessoa('u9', 'Zeca'), InTeam: false }, Priority: null }],
      'assignee',
      null,
    )
    expect(saiu[0]).toEqual({ key: 'u9', name: 'Zeca', accepts: false })
  })

  it('por prioridade: todas as ativas do projeto, da mais para a menos urgente, com card ou nao; a aposentada com card aparece sem receber', () => {
    const raias = boardLanes(
      [
        { Assignee: null, Priority: prioridade('baixa', 'Baixa') },
        { Assignee: null, Priority: { ...prioridade('velha', 'Antiga'), IsActive: false } },
        { Assignee: null, Priority: null },
      ],
      'priority',
      [
        { PublicId: 'baixa', Name: 'Baixa', Position: 0, IsActive: true },
        { PublicId: 'urgente', Name: 'Urgente', Position: 3, IsActive: true },
        { PublicId: 'velha', Name: 'Antiga', Position: 1, IsActive: false },
        { PublicId: 'sumida', Name: 'Sumida', Position: 2, IsActive: false },
      ],
    )
    expect(raias.map((raia) => raia.key)).toEqual(['urgente', 'velha', 'baixa', NO_LANE])
    expect(raias.find((raia) => raia.key === 'urgente')?.accepts).toBe(true)
    expect(raias.find((raia) => raia.key === 'velha')?.accepts).toBe(false)
    expect(raias.at(-1)?.name).toBe('Sem prioridade')
  })

  it('a raia do card vem do dado dele, e a chave da celula volta a coluna e a raia', () => {
    expect(laneOfCard({ Assignee: pessoa('u1', 'Ana'), Priority: null }, 'assignee')).toBe('u1')
    expect(laneOfCard({ Assignee: null, Priority: null }, 'priority')).toBe(NO_LANE)
    expect(laneOfCard(undefined, 'assignee')).toBe(NO_LANE)
    expect(splitCell(cellKey('col', 'u1'))).toEqual({ coluna: 'col', raia: 'u1' })
    expect(splitCell(cellKey('col', null))).toEqual({ coluna: 'col', raia: null })
  })

  it('as celulas guardam a ordem da coluna; sem raias, sao as proprias colunas', () => {
    const itens = { a: ['c1', 'c2', 'c3', 'c4'], b: ['c5'] }
    const raia: Record<string, string> = { c1: 'u1', c2: NO_LANE, c3: 'u1', c4: 'u2', c5: 'u2' }
    const celulas = boardCells(
      itens,
      ['a', 'b'],
      ['u1', 'u2', NO_LANE],
      (id) => raia[id] ?? NO_LANE,
    )
    expect(celulas[cellKey('a', 'u1')]).toEqual(['c1', 'c3'])
    expect(celulas[cellKey('a', NO_LANE)]).toEqual(['c2'])
    expect(celulas[cellKey('b', 'u1')]).toEqual([])
    expect(celulas[cellKey('b', 'u2')]).toEqual(['c5'])
    expect(boardCells(itens, ['a', 'b'], null, () => NO_LANE)).toBe(itens)
  })

  it('soltar numa celula: logo abaixo do de cima na celula; sem ninguem acima, antes do primeiro; vazia, no topo', () => {
    const itens = { a: ['c1', 'x', 'c2', 'y'], b: ['c3'] }
    // A celula de destino em "a" tem c1 e c2 (x e y sao de outra raia).
    expect(moveToCell(itens, 'c3', 'a', ['c1', 'c2'], 1).a).toEqual(['c1', 'c3', 'x', 'c2', 'y'])
    expect(moveToCell(itens, 'c3', 'a', ['c1', 'c2'], 0).a).toEqual(['c3', 'c1', 'x', 'c2', 'y'])
    expect(moveToCell(itens, 'c3', 'a', ['c1', 'c2'], 2).a).toEqual(['c1', 'x', 'c2', 'c3', 'y'])
    expect(moveToCell(itens, 'c3', 'a', [], 0).a).toEqual(['c3', 'c1', 'x', 'c2', 'y'])
    // O card sai de onde estava, e o quadro de entrada nao muda.
    expect(moveToCell(itens, 'c3', 'a', ['c1', 'c2'], 1).b).toEqual([])
    expect(itens.b).toEqual(['c3'])
    // Dentro da propria celula: o lugar final e o pedido.
    expect(moveToCell(itens, 'c1', 'a', ['c1', 'c2'], 1).a).toEqual(['x', 'c2', 'c1', 'y'])
    // Sem raias, a celula e a coluna: o mesmo que mover entre colunas.
    expect(moveToCell(itens, 'c3', 'a', itens.a, 2).a).toEqual(moveBetween(itens, 'c3', 'a', 2).a)
  })
})
