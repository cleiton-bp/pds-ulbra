// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MiniBoard } from '@/shared/components/MiniBoard'

/**
 * O QUE ESTES TESTES TRAVAM: o quadro de exemplo da previa de Colunas.
 *
 * - As colunas na ordem, com as marcas ("Encerra") ditas por extenso.
 * - **O card de exemplo numa coluna so**: a escolhida, senao a primeira.
 * - Embaixo de cada coluna, o que quem relatou ve — e nada quando a tela nao diz.
 */
describe('o quadro de exemplo', () => {
  afterEach(cleanup)

  const colunas = [
    { id: 'a', name: 'Entrada', publicStage: 'Recebido' },
    { id: 'b', name: 'Fazendo', publicStage: 'Em andamento' },
    { id: 'c', name: 'Feito', tags: ['Encerra'], publicStage: null },
  ]

  it('as colunas na ordem, com as marcas e o que quem relatou ve', () => {
    render(<MiniBoard columns={colunas} />)

    const itens = screen.getAllByRole('listitem')
    expect(itens.map((item) => within(item).getByRole('heading').textContent)).toEqual([
      'Entrada',
      'Fazendo',
      'Feito',
    ])
    expect(within(itens[2] as HTMLElement).getByText('Encerra')).toBeTruthy()
    expect(itens[1]?.textContent).toContain('Quem relatou vê: Em andamento')
    expect(itens[2]?.textContent).toContain('Quem relatou vê: nenhuma etapa')
  })

  it('o card de exemplo aparece so na coluna escolhida', () => {
    render(<MiniBoard columns={colunas} card={{ title: 'Card de exemplo' }} cardColumnId="b" />)

    const [entrada, fazendo] = screen.getAllByRole('listitem')
    expect(within(fazendo as HTMLElement).getByText('Card de exemplo')).toBeTruthy()
    expect(within(entrada as HTMLElement).queryByText('Card de exemplo')).toBeNull()
  })

  it('sem coluna escolhida, o card fica na primeira; sem etapa, sem faixa', () => {
    render(<MiniBoard columns={[{ id: 'x', name: 'Única' }]} card={{ title: 'Card de exemplo' }} />)

    expect(screen.getByText('Card de exemplo')).toBeTruthy()
    expect(screen.queryByText(/Quem relatou vê/)).toBeNull()
  })
})
