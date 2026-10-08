// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportSummaryViewModel } from '@/contracts'
import { CardDialogTitle } from '@/features/reports/CardDetailLayout'
import { CardSubtasks, ParentLink } from '@/features/reports/CardSubtasks'

/**
 * O QUE ESTES TESTES TRAVAM: as subtarefas do card aberto.
 *
 * - **A lista vem na ordem em que nasceram**, com o progresso — as feitas sao as que
 *   terminaram, pela regra do `Finished`.
 * - **Criar manda o pai**, e quem abriu o card fica sabendo para por a nova na tela.
 * - **Sem subtarefa, nem pergunta**: o contador da frente do card ja diz que nao ha.
 * - **No card arquivado, so se le.**
 * - **A subtarefa mostra o pai, com o link para ele.**
 */
const dublê = vi.hoisted(() => ({ listar: vi.fn(), criar: vi.fn() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectReportService: { listReports: dublê.listar, createTeamCard: dublê.criar },
  }
})

function card(extra: Partial<ReportSummaryViewModel> = {}): ReportSummaryViewModel {
  return {
    PublicId: 'pai',
    Kind: 'Team',
    Number: 10,
    Title: 'Lançar o checkout novo',
    ReporterTitle: null,
    TrackingCode: null,
    Type: null,
    Text: null,
    Route: null,
    Origin: null,
    StatePublicId: 's-1',
    StateName: 'A fazer',
    PublicStageLabel: null,
    AcceptsQuestions: null,
    PublicStageDueAt: null,
    ArchivedAt: null,
    CreatedAt: '2026-10-03T12:00:00.000Z',
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
  }
}

const filha = (numero: number, Title: string, Finished = false) =>
  card({
    PublicId: `f-${numero}`,
    Number: numero,
    Title,
    Finished,
    Parent: { PublicId: 'pai', Number: 10, Headline: 'x' },
  })

function montar(pai: ReportSummaryViewModel, aoCriar = vi.fn()) {
  render(
    <MemoryRouter>
      <CardSubtasks projectPublicId="p-1" card={pai} colunas={null} versao={0} aoCriar={aoCriar} />
    </MemoryRouter>,
  )
  return aoCriar
}

describe('as subtarefas do card aberto', () => {
  afterEach(cleanup)
  beforeEach(() => {
    dublê.listar.mockReset()
    dublê.criar.mockReset()
  })

  it('vem na ordem em que nasceram, com o progresso das que terminaram', async () => {
    dublê.listar.mockResolvedValue({
      reports: [
        filha(14, 'Testar no Safari', true),
        filha(12, 'Trocar o botão'),
        filha(13, 'Rever o texto'),
      ],
      total: 3,
    })
    montar(card({ SubtaskCount: 3, SubtasksDone: 1 }))

    const lista = await screen.findByRole('list')
    const titulos = within(lista)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(titulos).toEqual(['Trocar o botão', 'Rever o texto', 'Testar no Safari'])
    expect(screen.getByText('1 de 3 feitas')).toBeTruthy()
    expect(
      screen.getByRole('progressbar', { name: 'Subtarefas feitas' }).getAttribute('aria-valuenow'),
    ).toBe('1')
    expect(dublê.listar).toHaveBeenCalledWith('p-1', 1, null, false, {
      pageSize: 100,
      parent: 'pai',
    })
  })

  it('sem subtarefa, nem pergunta; criar manda o pai, e avisa quem abriu o card', async () => {
    dublê.criar.mockResolvedValue({ ...filha(15, 'Escrever o teste'), Description: null })
    const aoCriar = montar(card())
    expect(dublê.listar).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Criar subtarefa' }), {
      target: { value: '  Escrever o teste ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }))

    await waitFor(() =>
      expect(dublê.criar).toHaveBeenCalledWith('p-1', {
        Title: 'Escrever o teste',
        Description: null,
        StatePublicId: null,
        ParentPublicId: 'pai',
      }),
    )
    await waitFor(() =>
      expect(aoCriar).toHaveBeenCalledWith(expect.objectContaining({ Number: 15 })),
    )
    expect(
      (screen.getByRole('textbox', { name: 'Criar subtarefa' }) as HTMLInputElement).value,
    ).toBe('')
  })

  it('no card arquivado, so se le: sem o campo de criar', async () => {
    dublê.listar.mockResolvedValue({ reports: [filha(12, 'Trocar o botão')], total: 1 })
    montar(card({ ArchivedAt: '2026-10-03T12:00:00.000Z', SubtaskCount: 1 }))
    await screen.findByText('Trocar o botão')
    expect(screen.queryByRole('textbox', { name: 'Criar subtarefa' })).toBeNull()
  })

  it('o card aberto da subtarefa se chama Subtarefa', () => {
    render(<CardDialogTitle card={filha(12, 'Trocar o botão')} />)
    expect(screen.getByText('Subtarefa')).toBeTruthy()
    cleanup()
    render(<CardDialogTitle card={card()} />)
    expect(screen.getByText('Card do time')).toBeTruthy()
  })

  it('a subtarefa mostra o pai, com o link para ele — na rota do card, como no app', () => {
    render(
      <MemoryRouter initialEntries={['/p/p-1/reports/f-12']}>
        <Routes>
          <Route path="/p/:publicId/reports" element={<Outlet />}>
            <Route
              path=":reportPublicId"
              element={
                <ParentLink
                  parent={{ PublicId: 'pai', Number: 10, Headline: 'Lançar o checkout novo' }}
                />
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /#10 Lançar o checkout novo/ })
    expect(link.getAttribute('href')).toBe('/p/p-1/reports/pai')
  })
})
