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
 * - **A conexao que nunca abriu e a que caiu dizem coisas diferentes**, as duas
 *   comecando por "Sem atualizacao ao vivo" (o que ficou velho na tela), e a explicacao
 *   vai em texto, e nao so no `title`.
 * - **O mesmo anuncio duas vezes e anunciado duas vezes.**
 * - **No quadro, o anuncio diz o que aconteceu e onde** ("chegou em", "foi para",
 *   "mudou", "saiu do quadro"), um por um ate tres; na lista, so o numero.
 */
describe('o que a tela diz do tempo real', () => {
  afterEach(cleanup)

  it('a regiao do selo existe sem texto, e o texto entra e sai dentro dela', () => {
    const { rerender } = render(<LiveBadge estado={null} />)
    const regiao = screen.getByRole('status')
    expect(regiao.textContent).toBe('')

    rerender(<LiveBadge estado="caiu" />)
    expect(screen.getByRole('status')).toBe(regiao)
    expect(regiao.textContent).toContain('Sem atualização ao vivo — reconectando…')
    expect(regiao.textContent).toContain('aparecem quando a conexão voltar')
    expect(regiao.textContent).toContain('O que você faz continua sendo salvo.')

    rerender(<LiveBadge estado="nunca-conectou" />)
    expect(screen.getByRole('status')).toBe(regiao)
    expect(regiao.textContent).toContain('Sem atualização ao vivo — tentando conectar…')
    expect(regiao.textContent).toContain('só aparecem ao recarregar a tela')

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

  it('no quadro, o anuncio diz o que aconteceu com o card e em que coluna olhar', () => {
    expect(describeRemoteChange([{ numero: 97, coluna: 'A fazer', como: 'chegou' }])).toBe(
      'O card #97 chegou em A fazer.',
    )
    expect(describeRemoteChange([{ numero: 97, coluna: 'Fazendo', como: 'foi' }])).toBe(
      'O card #97 foi para Fazendo.',
    )
    expect(describeRemoteChange([{ numero: 97, coluna: 'Fazendo', como: 'mudou' }])).toBe(
      'O card #97 mudou.',
    )
    expect(describeRemoteChange([{ numero: 97, como: 'saiu' }])).toBe('O card #97 saiu do quadro.')
    // Sem o numero, "Um card"; sem a coluna, nao inventa onde.
    expect(describeRemoteChange([{ coluna: 'Fazendo', como: 'foi' }])).toBe(
      'Um card foi para Fazendo.',
    )
    expect(describeRemoteChange([{ numero: 3, como: 'chegou' }])).toBe('O card #3 mudou.')
  })

  it('ate tres cards sao ditos um por um; mais que isso, so quantos', () => {
    expect(
      describeRemoteChange([
        { numero: 1, coluna: 'A fazer', como: 'chegou' },
        { numero: 2, como: 'saiu' },
      ]),
    ).toBe('O card #1 chegou em A fazer. O card #2 saiu do quadro.')
    const quatro = [1, 2, 3, 4].map((numero) => ({ numero, coluna: 'Feito', como: 'foi' as const }))
    expect(describeRemoteChange(quatro)).toBe('4 cards mudaram no quadro.')
    // Na lista (sem o que aconteceu), o de sempre.
    expect(describeRemoteChange([{ numero: 5 }])).toBe('O card #5 foi atualizado.')
  })
})
