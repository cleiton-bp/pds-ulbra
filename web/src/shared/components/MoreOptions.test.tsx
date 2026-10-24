// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeChanges, MoreOptions } from '@/shared/components/MoreOptions'

/**
 * O QUE ESTES TESTES TRAVAM: o "Mais opções" diz, fechado, o que ja mudou do padrao — e
 * "Voltar ao padrão" so aparece quando ha o que voltar. Sem padrao (um identificador, um
 * arquivamento), o resumo e o que a tela disser, e nao ha botao.
 */
describe('MoreOptions', () => {
  afterEach(cleanup)

  it('o resumo conta as mudanças, e mais de três viram contagem', () => {
    expect(describeChanges([])).toBe('Tudo no padrão')
    expect(describeChanges(['Tema'])).toBe('1 mudança: Tema')
    expect(describeChanges(['Tema', 'Sombra', 'Formato'])).toBe('3 mudanças: Tema, Sombra, Formato')
    expect(describeChanges(['Tema', 'Sombra', 'Formato', 'Tamanho'])).toBe(
      '4 mudanças: Tema, Sombra e mais 2',
    )
  })

  it('fechado, diz o que mudou; "Voltar ao padrão" só aparece com mudança', () => {
    const voltar = vi.fn()
    const { rerender } = render(
      <MoreOptions id="mais" changes={[]} onReset={voltar}>
        <p>campo</p>
      </MoreOptions>,
    )
    const detalhes = document.getElementById('mais') as HTMLDetailsElement
    expect(detalhes.tagName).toBe('DETAILS')
    expect(detalhes.open).toBe(false)
    expect(detalhes.querySelector('summary')?.textContent).toContain('Tudo no padrão')
    expect(screen.queryByRole('button', { name: 'Voltar ao padrão' })).toBeNull()

    rerender(
      <MoreOptions id="mais" changes={['Tema']} onReset={voltar}>
        <p>campo</p>
      </MoreOptions>,
    )
    expect(detalhes.querySelector('summary')?.textContent).toContain('1 mudança: Tema')
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao padrão' }))
    expect(voltar).toHaveBeenCalledTimes(1)
  })

  it('sem padrão, o resumo é o da tela e não há "Voltar ao padrão"', () => {
    render(
      <MoreOptions id="mais" summary="Identificador e arquivamento">
        <p>campo</p>
      </MoreOptions>,
    )
    expect(document.getElementById('mais')?.querySelector('summary')?.textContent).toContain(
      'Identificador e arquivamento',
    )
    expect(screen.queryByRole('button', { name: 'Voltar ao padrão' })).toBeNull()
  })
})
