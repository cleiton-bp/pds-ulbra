// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CardLabelViewModel } from '@/contracts'
import { CardLabels, MiniCard, PointsChip, PriorityIcon } from '@/shared/components/cardFace'

/**
 * O QUE ESTES TESTES TRAVAM: as pecas da frente do card que as previas tambem usam.
 *
 * - Ate tres etiquetas, e "+N" com as outras ditas por extenso.
 * - Os pontos curtos na tela e por extenso para leitor de tela; sem estimativa, nada.
 * - A prioridade desativada vem marcada.
 * - **O card de exemplo** com titulo, etiquetas, prioridade, prazo, pontos e iniciais.
 */

const etiqueta = (nome: string): CardLabelViewModel => ({
  PublicId: nome,
  Name: nome,
  Color: 'Blue',
})

describe('as pecas da frente do card', () => {
  afterEach(cleanup)

  it('ate tres etiquetas, e o resto contado', () => {
    render(<CardLabels labels={['UI', 'API', 'Login', 'Pagamento', 'Mobile'].map(etiqueta)} />)

    expect(screen.getByText('UI')).toBeTruthy()
    expect(screen.getByText('Login')).toBeTruthy()
    expect(screen.queryByText('Pagamento')).toBeNull()
    expect(screen.getByTitle('Pagamento, Mobile').textContent).toBe(
      '+2 etiquetas: Pagamento, Mobile',
    )
  })

  it('sem etiqueta, nem a linha', () => {
    const { container } = render(<CardLabels labels={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('os pontos: curtos na tela, por extenso para quem ouve', () => {
    render(<PointsChip points={2.5} />)
    expect(screen.getByTitle('2,5 pontos').textContent).toBe('2,5 pts2,5 pontos')

    cleanup()
    const { container } = render(<PointsChip points={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('a prioridade desativada vem marcada', () => {
    render(
      <PriorityIcon priority={{ PublicId: 'p', Name: 'Alta', Color: 'Red', IsActive: false }} />,
    )
    expect(screen.getByTitle('Prioridade Alta (desativada)')).toBeTruthy()
  })

  it('o card de exemplo mostra o que recebe', () => {
    render(
      <MiniCard
        title="O botão de pagar não responde"
        labels={['UI', 'API', 'Login', 'Mobile'].map(etiqueta)}
        priority={{ PublicId: 'p', Name: 'Alta', Color: 'Red', IsActive: true }}
        due={{ day: '2099-01-10', soonDays: 2 }}
        points={3}
        assignee="Ana Souza"
      />,
    )

    expect(screen.getByText('O botão de pagar não responde')).toBeTruthy()
    expect(screen.getByTitle('Mobile')).toBeTruthy()
    expect(screen.getByTitle('Prioridade Alta')).toBeTruthy()
    expect(screen.getByText(/^Prazo /)).toBeTruthy()
    expect(screen.getByTitle('3 pontos')).toBeTruthy()
    expect(screen.getByText('AS')).toBeTruthy()
  })

  it('so com o titulo, so o titulo', () => {
    const { container } = render(<MiniCard title="Só o título" />)
    expect(container.textContent).toBe('Só o título')
  })
})
