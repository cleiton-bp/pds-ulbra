// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useKeepFocus } from '@/features/reports/useKeepFocus'

/**
 * O QUE ESTES TESTES TRAVAM: o foco do card que sai da tela por outra pessoa.
 *
 * - **O card que so mudou de coluna leva o foco junto** — tambem quando ele some e
 *   reaparece logo, porque a coluna de destino foi relida depois.
 * - **O que saiu da tela deixa o foco no vizinho da mesma posicao**, ou na coluna vazia.
 * - **Quem estava com o foco em outro lugar nao e puxado de volta.**
 */
function Quadro({ colunas }: { colunas: Record<string, string[]> }) {
  const area = useRef<HTMLDivElement>(null)
  useKeepFocus(area)
  return (
    <div data-work-area>
      <button type="button">Fora do quadro</button>
      <div ref={area}>
        {Object.entries(colunas).map(([nome, cards]) => (
          <section key={nome} aria-label={nome} data-focus-group>
            {cards.map((card) => (
              <a key={card} href={`/p/p-1/reports/${card}`}>
                {card}
              </a>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

describe('o foco do card que sai da tela', () => {
  afterEach(cleanup)

  it('o card que mudou de coluna leva o foco junto', () => {
    const { rerender } = render(<Quadro colunas={{ A: ['c1', 'c2'], B: [] }} />)
    screen.getByText('c1').focus()

    rerender(<Quadro colunas={{ A: ['c2'], B: ['c1'] }} />)

    expect(document.activeElement?.textContent).toBe('c1')
    expect(document.activeElement?.closest('section')?.getAttribute('aria-label')).toBe('B')
  })

  it('o que saiu da tela deixa o foco no vizinho da mesma posicao, ou na coluna vazia', () => {
    const { rerender } = render(<Quadro colunas={{ A: ['c1', 'c2', 'c3'] }} />)
    screen.getByText('c2').focus()

    rerender(<Quadro colunas={{ A: ['c1', 'c3'] }} />)
    expect(document.activeElement?.textContent).toBe('c3')

    // O ultimo da coluna saiu: o foco fica no que virou o ultimo.
    rerender(<Quadro colunas={{ A: ['c1'] }} />)
    expect(document.activeElement?.textContent).toBe('c1')

    rerender(<Quadro colunas={{ A: [] }} />)
    expect(document.activeElement?.getAttribute('aria-label')).toBe('A')
  })

  it('o card que sumiu e reaparece logo noutra coluna — a de destino foi relida depois — leva o foco de volta', () => {
    const { rerender } = render(<Quadro colunas={{ A: ['c1', 'c2'], B: ['c3'] }} />)
    screen.getByText('c1').focus()

    // A coluna de onde ele saiu chega primeiro: o foco fica no vizinho.
    rerender(<Quadro colunas={{ A: ['c2'], B: ['c3'] }} />)
    expect(document.activeElement?.textContent).toBe('c2')

    // A de destino chega depois: o foco vai atras do card.
    rerender(<Quadro colunas={{ A: ['c2'], B: ['c1', 'c3'] }} />)
    expect(document.activeElement?.textContent).toBe('c1')
    expect(document.activeElement?.closest('section')?.getAttribute('aria-label')).toBe('B')
  })

  it('quem ja saiu do vizinho por conta propria nao e puxado para o card que reapareceu', () => {
    const { rerender } = render(<Quadro colunas={{ A: ['c1', 'c2'], B: ['c3'] }} />)
    screen.getByText('c1').focus()
    rerender(<Quadro colunas={{ A: ['c2'], B: ['c3'] }} />)
    screen.getByText('c3').focus()

    rerender(<Quadro colunas={{ A: ['c2'], B: ['c1', 'c3'] }} />)
    expect(document.activeElement?.textContent).toBe('c3')
  })

  it('quem estava com o foco em outro lugar nao e puxado de volta', () => {
    const { rerender } = render(<Quadro colunas={{ A: ['c1', 'c2'] }} />)
    screen.getByText('c1').focus()
    screen.getByRole('button', { name: 'Fora do quadro' }).focus()

    rerender(<Quadro colunas={{ A: ['c2'] }} />)

    expect(document.activeElement?.textContent).toBe('Fora do quadro')
  })
})
