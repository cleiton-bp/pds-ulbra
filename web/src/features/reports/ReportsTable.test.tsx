// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReportSummaryViewModel } from '@/contracts'
import type { ReportSort } from '@/data'
import { ReportsTable } from '@/features/reports/ReportsTable'

/**
 * O QUE ESTES TESTES TRAVAM: a coluna do dado por que a pessoa ordenou **nunca sai
 * pela largura** — ordenar pelo prazo e nao ver o prazo deixava a ordem sem
 * explicacao —, e o que ficou na tela sai de debaixo do titulo. A ordem de sempre nao
 * segura a data na area estreita.
 */
function card(extra: Partial<ReportSummaryViewModel> = {}): ReportSummaryViewModel {
  return {
    PublicId: 'r-1',
    Kind: 'Team',
    Number: 7,
    Title: 'Revisar o frete',
    ReporterTitle: null,
    TrackingCode: null,
    Type: null,
    Text: null,
    Route: null,
    Origin: null,
    StatePublicId: 's-1',
    StateName: 'Análise',
    PublicStageLabel: null,
    AcceptsQuestions: false,
    PublicStageDueAt: null,
    ArchivedAt: null,
    CreatedAt: '2026-09-01T12:00:00.000Z',
    Assignee: null,
    Priority: { PublicId: 'p-1', Name: 'Alta', Color: 'Red', Position: 2 },
    Labels: [],
    DueDate: '2026-10-11',
    CommentCount: 0,
    AttachmentCount: 0,
    Closed: false,
    ClosureConfirmed: false,
    BlockedOrigin: false,
    Finished: false,
    Parent: null,
    SubtaskCount: 0,
    SubtasksDone: 0,
    BlockedBy: [],
    DuplicateOf: null,
    DuplicateReporters: 0,
    Sprint: null,
    StoryPoints: null,
    UpdatedAt: '2026-10-03T12:00:00.000Z',
    ...extra,
  } as ReportSummaryViewModel
}

function montar(ordem: ReportSort | null) {
  render(
    <MemoryRouter>
      <ReportsTable reports={[card()]} colunas={null} soonDays={2} ordem={ordem} />
    </MemoryRouter>,
  )
}

/** Quantos dados vem debaixo do titulo na area estreita (prioridade, prazo). */
function debaixoDoTitulo(): number {
  const titulo = screen.getByRole('link', { name: 'Revisar o frete' }).closest('td') as HTMLElement
  return titulo.querySelectorAll('[class*="@min-[52rem]:hidden"]').length
}

const cabecalho = (nome: string) =>
  screen.getByRole('columnheader', { name: new RegExp(`^${nome}`) })

describe('a coluna da ordem escolhida', () => {
  afterEach(cleanup)

  it('nao sai pela largura, e o que ela mostra sai de debaixo do titulo', () => {
    montar({ field: 'due', dir: 'asc' })
    // O prazo fica; a prioridade, que divide a regra de largura com ele, nao.
    expect(cabecalho('Prazo').className).not.toMatch(/(^|\s)hidden(\s|$)/)
    expect(cabecalho('Prioridade').className).toMatch(/(^|\s)hidden(\s|$)/)
    expect(cabecalho('Coluna').className).toMatch(/(^|\s)hidden(\s|$)/)
    // O prazo debaixo do titulo nao se repete: a coluna dele esta na tela. A
    // prioridade, que saiu pela largura, continua debaixo do titulo.
    expect(debaixoDoTitulo()).toBe(1)
  })

  it('a ordem de sempre nao segura a data na area estreita', () => {
    montar(null)
    expect(cabecalho('Criado').className).toMatch(/(^|\s)hidden(\s|$)/)
    // A prioridade e o prazo perto vem os dois debaixo do titulo na area estreita.
    expect(debaixoDoTitulo()).toBe(2)
  })

  it('ordenar pelo responsavel segura a coluna dele', () => {
    montar({ field: 'assignee', dir: 'asc' })
    expect(cabecalho('Responsável').className).not.toMatch(/(^|\s)hidden(\s|$)/)
  })
})
