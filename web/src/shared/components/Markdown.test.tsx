// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Markdown } from '@/shared/components/Markdown'

/**
 * A descricao desenhada. O que importa: **nada vira HTML** — o que alguem escreve
 * com sinal de menor e maior aparece como texto —, e o link abre fora sem levar a
 * pagina junto.
 */
describe('Markdown', () => {
  afterEach(cleanup)

  it('HTML escrito na descricao aparece como texto, e nenhum elemento novo nasce', () => {
    const { container } = render(
      <Markdown source={'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>'} />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy()
  })

  it('o link abre fora, sem opener e sem referrer', () => {
    render(<Markdown source="[o guia](https://exemplo.com/guia)" />)
    const link = screen.getByRole('link', { name: 'o guia' })
    expect(link.getAttribute('href')).toBe('https://exemplo.com/guia')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('link com javascript: nao vira link', () => {
    render(<Markdown source="[clique](javascript:alert(1))" />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('titulo, lista e codigo viram os elementos de cada um', () => {
    const { container } = render(<Markdown source={'# Plano\n\n1. um\n2. dois\n\n```\nx\n```'} />)
    expect(screen.getByRole('heading', { name: 'Plano' })).toBeTruthy()
    expect(container.querySelectorAll('ol li')).toHaveLength(2)
    expect(container.querySelector('pre code')?.textContent).toBe('x')
  })
})
