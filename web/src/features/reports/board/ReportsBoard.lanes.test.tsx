// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReportSummaryViewModel } from '@/contracts'
import type { BoardColumn } from '@/features/reports/board/boardState'
import { ReportsBoard } from '@/features/reports/board/ReportsBoard'
import type { Board } from '@/features/reports/board/useBoard'

/**
 * O QUE ESTES TESTES TRAVAM: o quadro com raias, como ele se desenha.
 *
 * - **Uma raia por pessoa com card**, em ordem alfabetica, e "Sem responsavel" por
 *   ultimo; cada uma diz quantos cards tem, e recolhe.
 * - **O cabecalho das colunas aparece uma vez**, em cima de todas as raias, e cada card
 *   fica na celula da coluna e da raia dele.
 * - **Sem raias, o quadro de antes**: uma regiao por coluna.
 * O arraste entre raias fica na prova do navegador: o jsdom nao mede nada.
 */
const pessoa = (id: string, nome: string) => ({
  UserPublicId: id,
  Name: nome,
  AvatarUrl: null,
  InTeam: true,
})

function card(id: string, extra: Partial<ReportSummaryViewModel> = {}) {
  return {
    PublicId: id,
    Kind: 'Team',
    Number: Number(id.replace(/\D/g, '')),
    Title: `Card ${id}`,
    ReporterTitle: null,
    TrackingCode: null,
    Type: null,
    Text: null,
    Route: null,
    Origin: null,
    StatePublicId: 's-1',
    StateName: 'Análise',
    PublicStageLabel: null,
    AcceptsQuestions: null,
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
    BlockedBy: [],
    DuplicateOf: null,
    DuplicateReporters: 0,
    Sprint: null,
    StoryPoints: null,
    ...extra,
  } as ReportSummaryViewModel
}

const coluna = (key: string, name: string): BoardColumn => ({
  key,
  name,
  accepts: true,
  retired: false,
  closes: false,
  last: false,
  total: 2,
})

function quadro(): Board {
  const items = { 's-1': ['c1', 'c2'], 's-2': ['c3'] }
  const cards = {
    c1: card('c1', { Assignee: pessoa('u-b', 'Bruno') }),
    c2: card('c2'),
    c3: card('c3', { StatePublicId: 's-2', Assignee: pessoa('u-a', 'Ana') }),
  }
  const pronto = { total: 2, end: true, loading: false, loadingMore: false, failed: false }
  return {
    items,
    itemsRef: { current: items },
    setItems: vi.fn(),
    cards,
    state: { 's-1': pronto, 's-2': { ...pronto, total: 1 } },
    loadColumn: vi.fn(),
    loadMore: vi.fn(),
    reloadColumn: vi.fn(),
    adjustTotal: vi.fn(),
    apply: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    remoteChange: vi.fn(),
    reloadAll: vi.fn(),
    hold: () => () => {},
  } as unknown as Board
}

function montar(agrupar: 'none' | 'assignee') {
  render(
    <MemoryRouter>
      <ReportsBoard
        projectPublicId="p-1"
        board={quadro()}
        columns={[coluna('s-1', 'Análise'), coluna('s-2', 'Feito')]}
        soonDays={2}
        lastColumnDays={0}
        aoMudarColunas={vi.fn()}
        aoVerNaLista={vi.fn()}
        aoCriar={vi.fn()}
        destacados={new Set()}
        agrupar={agrupar}
      />
    </MemoryRouter>,
  )
}

describe('o quadro com raias', () => {
  afterEach(cleanup)

  it('uma raia por pessoa, em ordem alfabetica, e "Sem responsavel" por ultimo; cada card na sua celula', () => {
    montar('assignee')
    const raias = screen
      .getAllByRole('button', { expanded: true })
      .map((botao) => botao.textContent)
    expect(raias).toEqual(['Ana1', 'Bruno1', 'Sem responsável1'])
    // O cabecalho de cada coluna, uma vez so.
    expect(screen.getAllByRole('heading', { level: 2, name: 'Análise' })).toHaveLength(1)

    const celula = screen.getByRole('region', { name: 'Análise, Bruno' })
    expect(within(celula).getByText('Card c1')).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: 'Feito, Ana' })).getByText('Card c3'),
    ).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: 'Análise, Sem responsável' })).getByText('Card c2'),
    ).toBeTruthy()
    // O "Criar" de cada coluna, embaixo de todas as raias.
    expect(screen.getAllByRole('button', { name: /^Criar card em/ })).toHaveLength(2)
  })

  it('a raia recolhe e abre', () => {
    montar('assignee')
    const ana = screen.getByRole('button', { name: /^Ana/ })
    fireEvent.click(ana)
    expect(ana.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region', { name: 'Feito, Ana' })).toBeNull()
    fireEvent.click(ana)
    expect(screen.getByRole('region', { name: 'Feito, Ana' })).toBeTruthy()
  })

  it('sem raias, uma regiao por coluna, como antes', () => {
    montar('none')
    expect(screen.getByRole('region', { name: 'Análise' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Feito' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: /Sem responsável/ })).toBeNull()
  })
})
