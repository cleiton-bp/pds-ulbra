// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportStateCountViewModel, ReportSummaryViewModel } from '@/contracts'
import { PanelError } from '@/data'
import { CardDialogTitle } from '@/features/reports/CardDetailLayout'
import { CardSubtasks, ParentLink } from '@/features/reports/CardSubtasks'
import { Toaster } from '@/shared/components/Toaster'
import { useToastStore } from '@/shared/components/toastStore'

/**
 * O QUE ESTES TESTES TRAVAM: as subtarefas do card aberto.
 *
 * - **A lista vem na ordem em que nasceram**, com o progresso — as feitas sao as que
 *   terminaram, pela regra do `Finished`.
 * - **Criar manda o pai**, e quem abriu o card fica sabendo para por a nova na tela.
 * - **Sem subtarefa, nem pergunta**: o contador da frente do card ja diz que nao ha.
 * - **No card arquivado, so se le.**
 * - **O circulo marca**: leva a subtarefa para a ultima coluna ativa, e o da feita a
 *   devolve para a primeira — com o aviso, a lista relida e o pai avisado. Com uma
 *   coluna ativa so (nao ha onde terminar), e no card arquivado, ele e so o sinal.
 * - **A subtarefa mostra o pai, com o link para ele.** O titulo do dialogo diz o que o
 *   card e: subtarefa, card do time, ou o relato, que e de fora.
 */
const dublê = vi.hoisted(() => ({ listar: vi.fn(), criar: vi.fn(), mover: vi.fn() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectReportService: {
      listReports: dublê.listar,
      createTeamCard: dublê.criar,
      moveReport: dublê.mover,
    },
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
    ClosureConfirmed: false,
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

function montar(
  pai: ReportSummaryViewModel,
  aoCriar = vi.fn(),
  colunas: ReportStateCountViewModel[] | null = null,
  aoMoverSubtarefa = vi.fn(),
) {
  render(
    <MemoryRouter>
      <CardSubtasks
        projectPublicId="p-1"
        card={pai}
        colunas={colunas}
        versao={0}
        aoCriar={aoCriar}
        aoMoverSubtarefa={aoMoverSubtarefa}
      />
      <Toaster />
    </MemoryRouter>,
  )
  return aoCriar
}

/** A fila do time: tres ativas e uma desativada no fim, que nao e onde se termina. */
const colunas: ReportStateCountViewModel[] = [
  { StatePublicId: 's-1', StateName: 'A fazer', IsActive: true, ClosesReport: false, Total: 1 },
  { StatePublicId: 's-2', StateName: 'Fazendo', IsActive: true, ClosesReport: false, Total: 0 },
  { StatePublicId: 's-3', StateName: 'Feito', IsActive: true, ClosesReport: true, Total: 1 },
  { StatePublicId: 's-4', StateName: 'Antiga', IsActive: false, ClosesReport: false, Total: 0 },
]

describe('as subtarefas do card aberto', () => {
  afterEach(() => {
    cleanup()
    useToastStore.setState({ toasts: [], hosts: [] })
  })
  beforeEach(() => {
    dublê.listar.mockReset()
    dublê.criar.mockReset()
    dublê.mover.mockReset()
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

  it('o circulo marca: leva para a ultima coluna ativa, avisa, rele a lista e avisa o pai', async () => {
    dublê.listar.mockResolvedValue({
      reports: [filha(12, 'Trocar o botão'), filha(14, 'Testar no Safari', true)],
      total: 2,
    })
    const movida = { ...filha(12, 'Trocar o botão', true), StatePublicId: 's-3' }
    dublê.mover.mockResolvedValue(movida)
    const aoMoverSubtarefa = vi.fn()
    montar(card({ SubtaskCount: 2, SubtasksDone: 1 }), vi.fn(), colunas, aoMoverSubtarefa)

    fireEvent.click(await screen.findByRole('button', { name: 'Marcar #12 como feita' }))
    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'f-12', { StatePublicId: 's-3' }),
    )
    expect(await screen.findByText('#12 marcada como feita.')).toBeTruthy()
    await waitFor(() => expect(aoMoverSubtarefa).toHaveBeenCalledWith(movida))
    expect(dublê.listar).toHaveBeenCalledTimes(2)
  })

  it('o circulo da feita reabre: volta para a primeira coluna', async () => {
    dublê.listar.mockResolvedValue({
      reports: [filha(14, 'Testar no Safari', true)],
      total: 1,
    })
    dublê.mover.mockResolvedValue(filha(14, 'Testar no Safari'))
    montar(card({ SubtaskCount: 1, SubtasksDone: 1 }), vi.fn(), colunas)

    fireEvent.click(await screen.findByRole('button', { name: 'Reabrir #14' }))
    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'f-14', { StatePublicId: 's-1' }),
    )
    expect(await screen.findByText('#14 voltou para A fazer.')).toBeTruthy()
  })

  it('marcar que falha diz o que nao foi feito, e o circulo volta a responder', async () => {
    dublê.listar.mockResolvedValue({ reports: [filha(12, 'Trocar o botão')], total: 1 })
    dublê.mover.mockRejectedValue(new PanelError('Esta coluna foi desativada.', 409))
    const aoMoverSubtarefa = vi.fn()
    montar(card({ SubtaskCount: 1 }), vi.fn(), colunas, aoMoverSubtarefa)

    const circulo = await screen.findByRole('button', { name: 'Marcar #12 como feita' })
    fireEvent.click(circulo)
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /^Não deu para marcar como feita a #12\./,
    )
    expect(aoMoverSubtarefa).not.toHaveBeenCalled()
    await waitFor(() => expect((circulo as HTMLButtonElement).disabled).toBe(false))
  })

  it('com uma coluna ativa so, nao ha onde terminar: o circulo e so o sinal', async () => {
    dublê.listar.mockResolvedValue({
      reports: [filha(12, 'Trocar o botão'), filha(14, 'Testar no Safari', true)],
      total: 2,
    })
    montar(card({ SubtaskCount: 2, SubtasksDone: 1 }), vi.fn(), [
      colunas[0] as ReportStateCountViewModel,
      colunas[3] as ReportStateCountViewModel,
    ])

    await screen.findByText('Trocar o botão')
    expect(screen.queryByRole('button', { name: /^Marcar #|^Reabrir #/ })).toBeNull()
    // A palavra continua para quem nao ve o circulo.
    expect(screen.getByText('Por fazer')).toBeTruthy()
    expect(screen.getByText('Feita')).toBeTruthy()
  })

  it('no pai arquivado, e na subtarefa arquivada, o circulo nao marca', async () => {
    const arquivada = { ...filha(13, 'Rever o texto'), ArchivedAt: '2026-10-03T12:00:00.000Z' }
    dublê.listar.mockResolvedValue({ reports: [filha(12, 'Trocar o botão'), arquivada], total: 2 })
    montar(card({ SubtaskCount: 2 }), vi.fn(), colunas)

    expect(await screen.findByRole('button', { name: 'Marcar #12 como feita' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Marcar #13 como feita' })).toBeNull()
    cleanup()

    montar(card({ SubtaskCount: 2, ArchivedAt: '2026-10-03T12:00:00.000Z' }), vi.fn(), colunas)
    await screen.findByText('Trocar o botão')
    expect(screen.queryByRole('button', { name: /^Marcar #/ })).toBeNull()
  })

  it('o card aberto da subtarefa se chama Subtarefa; o relato diz que e de fora', () => {
    render(<CardDialogTitle card={filha(12, 'Trocar o botão')} />)
    expect(screen.getByText('Subtarefa')).toBeTruthy()
    expect(screen.queryByText('Relato de fora')).toBeNull()
    cleanup()
    render(<CardDialogTitle card={card()} />)
    expect(screen.getByText('Card do time')).toBeTruthy()
    expect(screen.queryByText('Relato de fora')).toBeNull()
    cleanup()
    render(<CardDialogTitle card={card({ Kind: 'Report', Type: 'Bug' })} />)
    expect(screen.getByText('Relato de fora')).toBeTruthy()
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
