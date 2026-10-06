// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReportSummaryViewModel } from '@/contracts'
import { BoardCardFace } from '@/features/reports/board/BoardCardFace'

/**
 * O QUE ESTES TESTES TRAVAM: a frente do card no quadro diz o bastante, e so isso.
 *
 * - O numero, o tipo e o titulo — o do time, senao o de quem relatou, senao o texto.
 * - A prioridade (a aposentada marcada) e ate tres etiquetas, com "+N".
 * - **Os contadores so quando ha**, com o que contam escrito para leitor de tela.
 * - **Quem esta com o card pelas iniciais**, com o nome dito — e a marca de quem saiu.
 */
function card(extra: Partial<ReportSummaryViewModel> = {}): ReportSummaryViewModel {
  return {
    PublicId: 'r-1',
    Kind: 'Report',
    Number: 42,
    Title: null,
    ReporterTitle: 'O botão travou',
    TrackingCode: 'ABCD-EFGH',
    Type: 'Bug',
    Text: 'Depois de escolher o cartao, nada acontece.',
    Route: '/checkout',
    Origin: null,
    StatePublicId: 's-1',
    StateName: 'Análise',
    PublicStageLabel: null,
    AcceptsQuestions: true,
    PublicStageDueAt: null,
    ArchivedAt: null,
    CreatedAt: '2026-10-02T12:00:00.000Z',
    Assignee: null,
    Priority: null,
    Labels: [],
    DueDate: null,
    CommentCount: 0,
    AttachmentCount: 0,
    Closed: false,
    Finished: false,
    Parent: null,
    SubtaskCount: 0,
    SubtasksDone: 0,
    ...extra,
  }
}

describe('a frente do card', () => {
  afterEach(cleanup)

  it('a subtarefa mostra o pai; o pai mostra o progresso, verde so com todas feitas', () => {
    render(
      <BoardCardFace
        card={card({ Parent: { PublicId: 'p-9', Number: 7, Headline: 'Pagar no Safari' } })}
        soonDays={2}
      />,
    )
    expect(screen.getByText('#7')).toBeTruthy()
    expect(screen.getByText('Pagar no Safari')).toBeTruthy()
    expect(screen.getByText('Subtarefa de', { exact: false })).toBeTruthy()
    cleanup()

    render(<BoardCardFace card={card({ SubtaskCount: 5, SubtasksDone: 2 })} soonDays={2} />)
    const parcial = screen.getByText('2/5')
    expect(screen.getByText('2 de 5 subtarefas feitas')).toBeTruthy()
    expect(parcial.parentElement?.className).not.toContain('chip-green')
    cleanup()

    render(<BoardCardFace card={card({ SubtaskCount: 3, SubtasksDone: 3 })} soonDays={2} />)
    expect(screen.getByText('3/3').parentElement?.className).toContain('chip-green')
    cleanup()

    render(<BoardCardFace card={card()} soonDays={2} />)
    expect(screen.queryByText(/subtarefa/)).toBeNull()
  })

  it('numero, tipo e o titulo de quem relatou quando o time nao deu outro', () => {
    render(<BoardCardFace card={card()} soonDays={2} />)
    expect(screen.getByText('#42')).toBeTruthy()
    expect(screen.getByText('Defeito')).toBeTruthy()
    expect(screen.getByText('O botão travou')).toBeTruthy()
    // Sem comentario, sem anexo e sem ninguem: o pe nem aparece.
    expect(screen.queryByText(/comentário/)).toBeNull()
  })

  it('a prioridade aposentada marcada, tres etiquetas e o resto contado', () => {
    render(
      <BoardCardFace
        card={card({
          Priority: { PublicId: 'p', Name: 'Alta', Color: 'Orange', IsActive: false },
          Labels: ['a', 'b', 'c', 'd', 'e'].map((nome) => ({
            PublicId: nome,
            Name: nome,
            Color: 'Blue' as const,
          })),
        })}
        soonDays={2}
      />,
    )
    expect(screen.getByText('Alta (aposentada)')).toBeTruthy()
    expect(screen.getByText('c')).toBeTruthy()
    expect(screen.queryByText('d')).toBeNull()
    expect(screen.getByText('+2')).toBeTruthy()
  })

  it('os contadores so quando ha, com o que contam escrito; quem esta com o card pelas iniciais, e quem saiu marcado', () => {
    render(
      <BoardCardFace
        card={card({
          CommentCount: 3,
          AttachmentCount: 1,
          Assignee: { UserPublicId: 'u', Name: 'Bruno Membro', AvatarUrl: null, InTeam: false },
        })}
        soonDays={2}
      />,
    )
    // O numero e o que ele conta juntos: "3" para quem ve, "3 comentários" para o leitor de tela.
    expect(screen.getByText('comentários', { exact: false }).parentElement?.textContent).toBe(
      '3 comentários',
    )
    expect(screen.getByText(/anexo$/).parentElement?.textContent).toBe('1 anexo')
    expect(screen.getByText('BM')).toBeTruthy()
    expect(screen.getByText('Com Bruno Membro (saiu do time)')).toBeTruthy()
  })
})
