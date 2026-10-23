// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReportSummaryViewModel } from '@/contracts'
import { BoardCardFace } from '@/features/reports/board/BoardCardFace'
import { SubtaskMatchMark } from '@/features/reports/cardLook'
import { ReportsTable } from '@/features/reports/ReportsTable'

/**
 * O QUE ESTES TESTES TRAVAM: a subtarefa mora dentro do pai.
 *
 * Ela nao aparece sozinha na lista nem no quadro; quando o filtro de responsavel ou a
 * busca casam com ela, quem entra e o pai, com a marca dizendo por que:
 *
 * - "1 subtarefa sua" / "2 subtarefas suas" para quem esta olhando, "2 subtarefas de
 *   Ana" (so o primeiro nome) para os outros, e "na subtarefa" para a busca — juntos
 *   por " · ".
 * - Sem nada que case, nenhuma marca.
 * - A marca aparece na linha da lista e na frente do card do quadro.
 */

/** O porque do pai, como o resumo do card o traz. */
type SubtaskMatchViewModel = NonNullable<ReportSummaryViewModel['SubtaskMatch']>

function card(extra: Partial<ReportSummaryViewModel> = {}): ReportSummaryViewModel {
  return {
    PublicId: 'r-1',
    Kind: 'Report',
    Number: 42,
    Title: 'Pagamento no Safari',
    ReporterTitle: null,
    TrackingCode: 'ABCD-EFGH',
    Type: { PublicId: 'tipo-defeito', Name: 'Defeito', Color: 'Red', Icon: 'Bug', IsActive: true },
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
    ClosureConfirmed: false,
    BlockedOrigin: false,
    Finished: false,
    Parent: null,
    SubtaskCount: 3,
    SubtasksDone: 1,
    BlockedBy: [],
    DuplicateOf: null,
    DuplicateReporters: 0,
    Sprint: null,
    StoryPoints: null,
    UpdatedAt: '2026-10-03T12:00:00.000Z',
    ...extra,
  }
}

function pessoa(Name: string, Count: number, IsMe = false) {
  return { UserPublicId: `u-${Name}`, Name, IsMe, Count }
}

function marca(SubtaskMatch: SubtaskMatchViewModel | null | undefined) {
  const { container } = render(<SubtaskMatchMark card={{ SubtaskMatch }} />)
  return container
}

describe('SubtaskMatchMark', () => {
  afterEach(cleanup)

  it('para quem esta olhando, diz "sua" e "suas"', () => {
    marca({ Assignees: [pessoa('Eu Mesmo', 1, true)], Search: false })
    expect(screen.getByText('1 subtarefa sua')).toBeTruthy()
    cleanup()

    marca({ Assignees: [pessoa('Eu Mesmo', 3, true)], Search: false })
    expect(screen.getByText('3 subtarefas suas')).toBeTruthy()
  })

  it('para os outros, diz quantas e o primeiro nome', () => {
    marca({ Assignees: [pessoa('Ana Paula Souza', 2), pessoa('Bruno', 1)], Search: false })
    expect(screen.getByText('2 subtarefas de Ana · 1 subtarefa de Bruno')).toBeTruthy()
  })

  it('a busca que casou na subtarefa diz "na subtarefa", depois das pessoas', () => {
    marca({ Assignees: [], Search: true })
    expect(screen.getByText('na subtarefa')).toBeTruthy()
    cleanup()

    marca({ Assignees: [pessoa('Eu', 1, true)], Search: true })
    const texto = screen.getByText('1 subtarefa sua · na subtarefa')
    // A dica explica o porque inteiro.
    expect(texto.parentElement?.getAttribute('title')).toBe(
      'Achado pela subtarefa: 1 subtarefa sua · na subtarefa',
    )
  })

  it('sem nada que case, nao ha marca', () => {
    expect(marca(null).innerHTML).toBe('')
    cleanup()
    expect(marca(undefined).innerHTML).toBe('')
    cleanup()
    expect(marca({ Assignees: [], Search: false }).innerHTML).toBe('')
  })
})

describe('a marca na lista e no quadro', () => {
  afterEach(cleanup)

  const achado: SubtaskMatchViewModel = { Assignees: [pessoa('Ana Paula', 2)], Search: true }

  it('a linha do pai na lista diz por que ele entrou', () => {
    render(
      <MemoryRouter>
        <ReportsTable
          reports={[
            card({ SubtaskMatch: achado }),
            card({ PublicId: 'r-2', Number: 43, Title: 'Outro card', SubtaskMatch: null }),
          ]}
          colunas={null}
          soonDays={2}
        />
      </MemoryRouter>,
    )

    const pai = screen.getByRole('link', { name: 'Pagamento no Safari' }).closest('tr')
    const outro = screen.getByRole('link', { name: 'Outro card' }).closest('tr')
    if (!pai || !outro) throw new Error('as linhas da tabela')
    expect(within(pai).getByText('2 subtarefas de Ana · na subtarefa')).toBeTruthy()
    expect(within(outro).queryByText(/subtarefas? de|na subtarefa/)).toBeNull()
  })

  it('a frente do card do pai no quadro diz por que ele entrou', () => {
    render(<BoardCardFace card={card({ SubtaskMatch: achado })} soonDays={2} />)
    expect(screen.getByText('2 subtarefas de Ana · na subtarefa')).toBeTruthy()
    cleanup()

    render(<BoardCardFace card={card()} soonDays={2} />)
    expect(screen.queryByText(/subtarefas? de|na subtarefa/)).toBeNull()
  })
})
