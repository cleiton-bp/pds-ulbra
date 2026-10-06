// @vitest-environment jsdom

import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  describeRemoteChange,
  LiveAnnouncer,
  LiveBadge,
  useAnnouncer,
} from '@/features/reports/LiveStatus'

/**
 * O QUE ESTES TESTES TRAVAM: o que a tela diz do tempo real.
 *
 * - **A regiao do selo fica sempre montada**, e so o texto entra e sai: leitor de tela
 *   anuncia a mudanca dentro de uma regiao que ja existia.
 * - **A conexao que nunca abriu e a que caiu dizem coisas diferentes**, e a explicacao
 *   vai em texto, e nao so no `title`.
 * - **O mesmo anuncio duas vezes e anunciado duas vezes.**
 */
describe('o que a tela diz do tempo real', () => {
  afterEach(cleanup)

  it('a regiao do selo existe sem texto, e o texto entra e sai dentro dela', () => {
    const { rerender } = render(<LiveBadge estado={null} />)
    const regiao = screen.getByRole('status')
    expect(regiao.textContent).toBe('')

    rerender(<LiveBadge estado="caiu" />)
    expect(screen.getByRole('status')).toBe(regiao)
    expect(regiao.textContent).toContain('Reconectando…')
    expect(regiao.textContent).toContain('aparecem quando a conexão voltar')

    rerender(<LiveBadge estado="nunca-conectou" />)
    expect(regiao.textContent).toContain('Sem atualização ao vivo')

    rerender(<LiveBadge estado={null} />)
    expect(regiao.textContent).toBe('')
  })

  it('o mesmo anuncio duas vezes vira um no novo na regiao — e e anunciado de novo', () => {
    const { result } = renderHook(() => useAnnouncer())
    const { rerender } = render(<LiveAnnouncer anuncio={result.current[0]} />)

    act(() => result.current[1]('O card #4 foi atualizado.'))
    rerender(<LiveAnnouncer anuncio={result.current[0]} />)
    const primeiro = screen.getByText('O card #4 foi atualizado.')

    act(() => result.current[1]('O card #4 foi atualizado.'))
    rerender(<LiveAnnouncer anuncio={result.current[0]} />)
    expect(screen.getByText('O card #4 foi atualizado.')).not.toBe(primeiro)
  })

  it('o anuncio diz o numero do card quando se sabe, e quantos quando sao varios', () => {
    expect(describeRemoteChange([42])).toBe('O card #42 foi atualizado.')
    expect(describeRemoteChange([undefined])).toBe('Um card foi atualizado.')
    expect(describeRemoteChange([1, 2, undefined])).toBe('3 cards foram atualizados.')
  })
})
