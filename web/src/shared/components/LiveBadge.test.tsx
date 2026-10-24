// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LiveBadge } from '@/shared/components/LiveBadge'

/**
 * O QUE ESTE TESTE TRAVA: o selo diz como a tela grava, em palavras — o ponto verde e
 * so enfeite, escondido de quem usa leitor de tela.
 */
describe('o selo de quem grava na hora', () => {
  afterEach(cleanup)

  it('diz em palavras, e o ponto fica fora do leitor de tela', () => {
    render(<LiveBadge />)

    const selo = screen.getByText('Cada mudança vale na hora')
    expect(selo.textContent).toBe('Cada mudança vale na hora')
    expect(selo.querySelector('[aria-hidden]')).not.toBeNull()
  })
})
