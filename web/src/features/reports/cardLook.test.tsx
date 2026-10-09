// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReportStateCountViewModel } from '@/contracts'
import {
  CardTypeIcon,
  cardHeadline,
  headlineText,
  initialsOf,
  MoreLabels,
  ParentLine,
  PriorityIcon,
  statusTone,
} from '@/features/reports/cardLook'

function coluna(
  statePublicId: string | null,
  isActive = true,
  closesReport = false,
): ReportStateCountViewModel {
  return {
    StatePublicId: statePublicId,
    StateName: statePublicId,
    IsActive: isActive,
    ClosesReport: closesReport,
    Total: 1,
  }
}

describe('o tom da coluna', () => {
  // A ordem da contagem e a do quadro: sem coluna, depois as colunas na ordem.
  const colunas = [
    coluna(null),
    coluna('aposentada', false),
    coluna('a-fazer'),
    coluna('fazendo'),
    coluna('feito', true, true),
  ]

  it('a primeira ativa e o por fazer, as do meio o fazendo, e a que encerra o feito', () => {
    expect(statusTone('a-fazer', colunas)).toBe('todo')
    expect(statusTone('fazendo', colunas)).toBe('doing')
    expect(statusTone('feito', colunas)).toBe('done')
  })

  it('sem coluna, aposentada, desconhecida ou sem a contagem, o tom neutro', () => {
    expect(statusTone(null, colunas)).toBe('todo')
    expect(statusTone('aposentada', colunas)).toBe('todo')
    expect(statusTone('de-outro-projeto', colunas)).toBe('todo')
    expect(statusTone('fazendo', null)).toBe('todo')
  })

  it('com uma coluna ativa so, nada e feito — nem a unica, que tambem encerra', () => {
    // E o projeto que acabou de nascer: a "Analise" de fabrica e a coluna que encerra.
    const nascendo = [coluna(null), coluna('analise', true, true), coluna('velha', false)]
    expect(statusTone('analise', nascendo)).toBe('todo')
  })

  it('o projeto que encerra por botao nao tem coluna verde', () => {
    const porBotao = [coluna('a-fazer'), coluna('fazendo'), coluna('ultima')]
    expect(statusTone('ultima', porBotao)).toBe('doing')
  })
})

describe('as iniciais', () => {
  it('a primeira letra do primeiro e do ultimo nome', () => {
    expect(initialsOf('Ana Maria Souza')).toBe('AS')
    expect(initialsOf('Bruno')).toBe('B')
  })

  it('o pedaco sem letra nao vira inicial', () => {
    // Era "A(": a ultima palavra comecava por um parentese.
    expect(initialsOf('Ana Souza (teste)')).toBe('AS')
    expect(initialsOf('Carla — Financeiro')).toBe('CF')
  })

  it('sem nome, a inicial do e-mail', () => {
    expect(initialsOf('davi@exemplo.com')).toBe('d')
  })
})

describe('o desenho do tipo e da prioridade', () => {
  afterEach(cleanup)

  it('cada tipo diz o nome para quem nao ve o desenho', () => {
    render(
      <>
        <CardTypeIcon card={{ Kind: 'Team', Type: null }} />
        <CardTypeIcon card={{ Kind: 'Report', Type: 'Bug' }} />
        <CardTypeIcon card={{ Kind: 'Report', Type: 'Improvement' }} />
        <CardTypeIcon card={{ Kind: 'Report', Type: 'Question' }} />
      </>,
    )

    for (const nome of ['Do time', 'Defeito', 'Melhoria', 'Dúvida'])
      expect(screen.getByText(nome)).toBeTruthy()
  })

  it('a prioridade vem com o nome escrito, e a desativada marcada', () => {
    render(
      <PriorityIcon
        priority={{ PublicId: 'p-1', Name: 'Alta', Color: 'Orange', IsActive: false }}
      />,
    )

    expect(screen.getByText('Alta (desativada)')).toBeTruthy()
  })
})

describe('o titulo da linha e da frente', () => {
  it('o titulo do time, senao o de quem relatou', () => {
    expect(cardHeadline({ Title: 'Do time', ReporterTitle: 'Dela', Text: 'texto' })).toEqual({
      text: 'Do time',
      titled: true,
    })
    expect(cardHeadline({ Title: null, ReporterTitle: 'Dela', Text: 'texto' })).toEqual({
      text: 'Dela',
      titled: true,
    })
  })

  it('sem titulo, o comeco do texto — e nao o texto inteiro, que viraria o nome do link', () => {
    const longo = `${'palavra '.repeat(150)}fim`
    const { text, titled } = cardHeadline({ Title: null, ReporterTitle: null, Text: longo })

    expect(titled).toBe(false)
    expect(text.length).toBeLessThanOrEqual(141)
    expect(text.endsWith('…')).toBe(true)
    // Corta no fim de uma palavra.
    expect(text).toMatch(/palavra…$/)
  })

  it('o texto curto vem inteiro, sem as quebras de linha', () => {
    expect(cardHeadline({ Title: null, ReporterTitle: null, Text: 'o botao\n\nsome' }).text).toBe(
      'o botao some',
    )
  })

  it('na tela, o relato sem titulo vem entre aspas; o titulo de verdade, como esta', () => {
    expect(headlineText({ text: 'O carrinho some', titled: false })).toBe('“O carrinho some”')
    expect(headlineText({ text: 'Pagar no Safari', titled: true })).toBe('Pagar no Safari')
  })
})

describe('as etiquetas que nao couberam', () => {
  afterEach(cleanup)

  it('dizem quantas e quais, e nao so o numero', () => {
    render(
      <MoreLabels
        labels={[
          { PublicId: 'l-1', Name: 'frete', Color: 'Blue' },
          { PublicId: 'l-2', Name: 'celular', Color: 'Green' },
        ]}
      />,
    )

    const mais = screen.getByText('+2')
    expect(mais.getAttribute('title')).toBe('frete, celular')
    expect(mais.textContent).toBe('+2 etiquetas: frete, celular')
  })
})

describe('o pai da subtarefa e o original do duplicado', () => {
  afterEach(cleanup)
  const original = { PublicId: 'c-6', Number: 6, Headline: 'Pagar no Safari' }

  it('o original do duplicado vem com "Duplicado de" escrito; o pai da subtarefa, so para o leitor de tela', () => {
    const { rerender } = render(<ParentLine parent={original} kind="duplicate" />)
    // Com a seta da subtarefa, o duplicado se lia como subtarefa do original (L-17).
    const duplicado = screen.getByText('Duplicado de')
    expect(duplicado.className).not.toContain('sr-only')
    expect(duplicado.closest('[title]')?.getAttribute('title')).toBe(
      'Duplicado de #6 Pagar no Safari',
    )

    rerender(<ParentLine parent={original} />)
    expect(screen.queryByText('Duplicado de')).toBeNull()
    const subtarefa = screen.getByText(/^Subtarefa de/)
    expect(subtarefa.className).toContain('sr-only')
    expect(subtarefa.closest('[title]')?.getAttribute('title')).toBe(
      'Subtarefa de #6 Pagar no Safari',
    )
  })
})
