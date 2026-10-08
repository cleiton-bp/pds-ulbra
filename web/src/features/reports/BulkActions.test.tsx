// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportStateCountViewModel, ReportSummaryViewModel } from '@/contracts'
import { PanelError } from '@/data/errors'
import { BulkActions, BulkFailures } from '@/features/reports/BulkActions'
import { ReportsTable } from '@/features/reports/ReportsTable'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

instalarRemendosDoRadix()

/**
 * O QUE ESTES TESTES TRAVAM: as acoes em lote da lista.
 *
 * - **Card por card, pelas rotas de sempre**, na ordem da lista; o card que ja esta
 *   como se pediu fica de fora.
 * - **O que nao mudou aparece com o porque**, e os outros ficam mudados.
 * - **A coluna que encerra pergunta uma vez**, e so os relatos abertos levam o desfecho.
 * - **Por etiqueta, a que o card tem fica**; tirar so oferece as que estao na selecao.
 * - **A subtarefa nao vai sozinha para a sprint.**
 * - **As caixas da lista**: o cabecalho marca todos, e a caixa nao abre o card.
 */
const dublê = vi.hoisted(() => ({
  mover: vi.fn(),
  responsavel: vi.fn(),
  prioridade: vi.fn(),
  etiquetas: vi.fn(),
  lerCard: vi.fn(),
  sprint: vi.fn(),
  time: vi.fn(),
  listaEtiquetas: vi.fn(),
  listaPrioridades: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectReportService: {
      moveReport: dublê.mover,
      setAssignee: dublê.responsavel,
      setPriority: dublê.prioridade,
      setLabels: dublê.etiquetas,
      refreshReport: dublê.lerCard,
      setSprint: dublê.sprint,
    },
    projectTeamService: { listMembers: dublê.time },
    projectLabelService: { listLabels: dublê.listaEtiquetas },
    projectPriorityService: { listPriorities: dublê.listaPrioridades },
  }
})

function card(id: string, extra: Partial<ReportSummaryViewModel> = {}): ReportSummaryViewModel {
  return {
    PublicId: id,
    Kind: 'Team',
    Number: Number(id.replace(/\D/g, '')) || 1,
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
  }
}

const COLUNAS: ReportStateCountViewModel[] = [
  { StatePublicId: 's-1', StateName: 'Análise', IsActive: true, ClosesReport: false, Total: 3 },
  { StatePublicId: 's-2', StateName: 'Feito', IsActive: true, ClosesReport: true, Total: 0 },
]

const ANA = { UserPublicId: 'u-ana', Name: 'Ana', AvatarUrl: null, InTeam: true }
const URGENTE = { PublicId: 'pr-u', Name: 'Urgente', Color: 'Red' as const, IsActive: true }

function montar(cards: ReportSummaryViewModel[], sprints = false) {
  const aoTerminar = vi.fn()
  render(
    <BulkActions
      projectPublicId="p-1"
      cards={cards}
      colunas={COLUNAS}
      sprints={
        sprints
          ? [
              {
                PublicId: 'sp-1',
                Number: 1,
                Name: 'Sprint 1',
                Goal: null,
                State: 'Planned',
                StartsOn: '2026-10-05',
                EndsOn: '2026-10-18',
                StartedAt: null,
                ClosedAt: null,
                Cards: 0,
                DoneCards: 0,
                Points: 0,
                DonePoints: 0,
              },
            ]
          : null
      }
      aoTerminar={aoTerminar}
      aoLimpar={vi.fn()}
    />,
  )
  return { aoTerminar }
}

const abrir = async (rotulo: string) => {
  fireEvent.pointerDown(await screen.findByRole('button', { name: rotulo }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
}

describe('as acoes em lote', () => {
  afterEach(cleanup)
  beforeEach(() => {
    for (const d of Object.values(dublê)) d.mockReset()
    dublê.time.mockResolvedValue([{ ...ANA, Role: 'Member' }])
    dublê.listaEtiquetas.mockResolvedValue([
      { PublicId: 'l-bug', Name: 'bug', Color: 'Red' },
      { PublicId: 'l-ux', Name: 'ux', Color: 'Blue' },
    ])
    dublê.listaPrioridades.mockResolvedValue([
      {
        PublicId: 'pr-b',
        Name: 'Baixa',
        Color: 'Gray',
        Position: 0,
        IsActive: true,
        CreatedAt: '',
      },
      { ...URGENTE, Position: 3, CreatedAt: '' },
    ])
  })

  it('responsavel: card por card, pulando quem ja e da pessoa; o que nao mudou aparece com o porque', async () => {
    dublê.responsavel
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new PanelError('Card arquivado.', 409))
    const { aoTerminar } = montar([card('c1'), card('c2', { Assignee: ANA }), card('c3')])
    expect(screen.getByText('3 selecionados')).toBeTruthy()
    await abrir('Responsável')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ana' }))

    await waitFor(() => expect(aoTerminar).toHaveBeenCalled())
    expect(dublê.responsavel.mock.calls.map((chamada) => chamada[1])).toEqual(['c1', 'c3'])
    expect(dublê.responsavel).toHaveBeenCalledWith('p-1', 'c1', { UserPublicId: 'u-ana' })
    // O resultado vai para a tela, que mostra o que nao mudou — a barra pode sumir.
    const resultado = aoTerminar.mock.calls[0]?.[0]
    expect(resultado.mudaram).toBe(1)
    expect(resultado.falhas.map((f: { card: ReportSummaryViewModel }) => f.card.PublicId)).toEqual([
      'c3',
    ])
    expect(resultado.falhas[0].motivo).toBe('Card arquivado.')
    // Os botoes ficam na tela durante e depois do lote.
    expect(screen.getByRole('button', { name: 'Responsável' })).toBeTruthy()
  })

  it('a coluna que encerra pergunta uma vez; so o relato aberto leva o desfecho', async () => {
    dublê.mover.mockResolvedValue({})
    const { aoTerminar } = montar([
      card('c1', { Kind: 'Report' }),
      card('c2', { Kind: 'Report' }),
      card('c3'),
      card('c4', { Kind: 'Report', Closed: true }),
    ])
    await abrir('Mover para')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Feito' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Encerrar 2 relatos' })
    fireEvent.change(within(dialogo).getByRole('textbox'), {
      target: { value: 'Corrigido na 2.3.' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Encerrar' }))

    await waitFor(() => expect(aoTerminar).toHaveBeenCalled())
    expect(dublê.mover).toHaveBeenCalledTimes(4)
    expect(dublê.mover).toHaveBeenCalledWith('p-1', 'c1', {
      StatePublicId: 's-2',
      Outcome: 'Done',
      Reason: 'Corrigido na 2.3.',
    })
    expect(dublê.mover).toHaveBeenCalledWith('p-1', 'c3', { StatePublicId: 's-2' })
    expect(dublê.mover).toHaveBeenCalledWith('p-1', 'c4', { StatePublicId: 's-2' })
  })

  it('por etiqueta: sobre o que o card tem agora — a etiqueta que outra pessoa pos fica; tirar so oferece as da selecao', async () => {
    dublê.etiquetas.mockResolvedValue({})
    const bug = { PublicId: 'l-bug', Name: 'bug', Color: 'Red' as const }
    const ux = { PublicId: 'l-ux', Name: 'ux', Color: 'Blue' as const }
    // Na tela, c2 nao tem nada; lido na hora, outra pessoa ja lhe pos "bug".
    dublê.lerCard.mockImplementation(async (_p: string, id: string) =>
      id === 'c1' ? card('c1', { Labels: [bug] }) : card('c2', { Labels: [bug] }),
    )
    const { aoTerminar } = montar([card('c1', { Labels: [bug] }), card('c2')])
    await abrir('Pôr etiqueta')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'ux' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalledTimes(1))
    expect(dublê.etiquetas).toHaveBeenCalledWith('p-1', 'c1', { LabelPublicIds: ['l-bug', 'l-ux'] })
    expect(dublê.etiquetas).toHaveBeenCalledWith('p-1', 'c2', { LabelPublicIds: ['l-bug', 'l-ux'] })

    dublê.etiquetas.mockClear()
    dublê.lerCard.mockImplementation(async (_p: string, id: string) =>
      card(id, { Labels: id === 'c1' ? [bug, ux] : [] }),
    )
    await abrir('Tirar etiqueta')
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: 'ux' })).toBeNull()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'bug' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalledTimes(2))
    expect(dublê.etiquetas).toHaveBeenCalledTimes(1)
    // Tira so a escolhida, e deixa a que o card ganhou no meio.
    expect(dublê.etiquetas).toHaveBeenCalledWith('p-1', 'c1', { LabelPublicIds: ['l-ux'] })
  })

  it('a prioridade vem da mais urgente; a sprint so com as sprints ligadas, e a subtarefa fica de fora', async () => {
    dublê.sprint.mockResolvedValue({})
    const { aoTerminar } = montar(
      [card('c1'), card('c2', { Parent: { PublicId: 'c1', Number: 1, Headline: 'Pai' } })],
      true,
    )
    await abrir('Prioridade')
    const itens = within(await screen.findByRole('menu')).getAllByRole('menuitem')
    expect(itens.map((item) => item.textContent)).toEqual(['Urgente', 'Baixa', 'Sem prioridade'])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    await abrir('Sprint')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sprint 1' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalled())
    expect(aoTerminar.mock.calls[0]?.[0].falhas[0].motivo).toBe('A subtarefa vai com o card pai.')
    expect(dublê.sprint).toHaveBeenCalledTimes(1)
    expect(dublê.sprint).toHaveBeenCalledWith('p-1', 'c1', { SprintPublicId: 'sp-1' })
  })

  it('o dialogo do que nao mudou: com o porque, e sem dizer que os outros mudaram quando nenhum mudou', () => {
    const falhas = [{ card: card('c3'), motivo: 'Card arquivado.' }]
    const { rerender } = render(<BulkFailures mudaram={2} falhas={falhas} aoFechar={vi.fn()} />)
    const dialogo = screen.getByRole('dialog', { name: '1 card não mudou' })
    expect(within(dialogo).getByText('Card arquivado.')).toBeTruthy()
    expect(within(dialogo).getByText('#3')).toBeTruthy()
    expect(within(dialogo).getByText('Os outros mudaram. Estes ficaram como estavam:')).toBeTruthy()
    rerender(<BulkFailures mudaram={0} falhas={falhas} aoFechar={vi.fn()} />)
    expect(screen.getByText('Estes ficaram como estavam:')).toBeTruthy()
  })

  it('sem sprints ligadas, nao ha a acao de sprint', async () => {
    montar([card('c1')])
    expect(await screen.findByRole('button', { name: 'Responsável' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sprint' })).toBeNull()
  })
})

function Onde() {
  return <span data-testid="onde">{useLocation().pathname}</span>
}

describe('as caixas da lista', () => {
  afterEach(cleanup)

  it('o cabecalho marca todos; com alguns, fica pela metade; a caixa nao abre o card', () => {
    const definir = vi.fn()
    const { rerender } = render(
      <MemoryRouter initialEntries={['/p']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ReportsTable
                  reports={[card('c1'), card('c2')]}
                  colunas={COLUNAS}
                  soonDays={2}
                  selecao={{ marcados: new Set(['c1']), definir }}
                />
                <Onde />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    const todos = screen.getByRole('checkbox', {
      name: 'Selecionar todos os cards da lista',
    }) as HTMLInputElement
    expect(todos.indeterminate).toBe(true)
    expect(todos.checked).toBe(false)
    fireEvent.click(todos)
    expect(definir).toHaveBeenCalledWith(['c1', 'c2'], true)

    fireEvent.click(screen.getByRole('checkbox', { name: /^Selecionar #2:/ }))
    expect(definir).toHaveBeenCalledWith(['c2'], true)
    expect(screen.getByTestId('onde').textContent).toBe('/p')

    rerender(
      <MemoryRouter initialEntries={['/p']}>
        <ReportsTable
          reports={[card('c1'), card('c2')]}
          colunas={COLUNAS}
          soonDays={2}
          selecao={{ marcados: new Set(['c1', 'c2']), definir }}
        />
      </MemoryRouter>,
    )
    const cheio = screen.getByRole('checkbox', {
      name: 'Selecionar todos os cards da lista',
    }) as HTMLInputElement
    expect(cheio.checked).toBe(true)
    expect(cheio.indeterminate).toBe(false)
  })

  it('sem selecao, a lista nao tem caixas', () => {
    render(
      <MemoryRouter>
        <ReportsTable reports={[card('c1')]} colunas={COLUNAS} soonDays={2} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
