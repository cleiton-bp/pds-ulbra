// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
  TeamMemberViewModel,
} from '@/contracts'
import type { RealtimeEvent, RealtimeHandlers, ReportListOptions, ReportPage } from '@/data'
import { ReportDetailRoute } from '@/features/reports/ReportDetailRoute'
import { ReportsScreen } from '@/features/reports/ReportsScreen'
import { TooltipProvider } from '@/shared/components/Tooltip'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: a subtarefa mora dentro do pai, e nao no quadro nem na lista.
 *
 * - **O aviso ao vivo de uma subtarefa e ignorado** pelo quadro e pela lista: o pai tem
 *   aviso proprio. Reler as colunas por causa dela traria leituras a toa — e, com a
 *   coluna da subtarefa no aviso, a coluna errada.
 * - **A subtarefa aberta que muda nao entra na lista**: quem muda e a frente do pai (o
 *   progresso), relida sem gravar leitura, e a contagem das colunas fica como estava.
 *
 * Cada teste de "nao rele" manda depois um aviso de card comum, que rele: sem isso, um
 * teste que espera pouco passaria sem provar nada.
 */
const dublê = vi.hoisted(() => ({
  listar:
    vi.fn<
      (
        publicId: string,
        page: number,
        state?: string | null,
        archived?: boolean,
        options?: ReportListOptions,
      ) => Promise<ReportPage>
    >(),
  contar: vi.fn(),
  abrir: vi.fn(),
  mover: vi.fn(),
  atualizar: vi.fn(),
  ciclo: vi.fn(),
  historico: vi.fn(),
  comentarios: vi.fn(),
  anexos: vi.fn(),
  etiquetas: vi.fn(async () => []),
  time: vi.fn(async (): Promise<TeamMemberViewModel[]> => []),
  prioridades: vi.fn(async () => []),
  sprints: vi.fn(async () => []),
}))

/** A conexao em tempo real de mentira: guarda quem ouve, e o teste manda os avisos. */
const aoVivo = vi.hoisted(() => {
  const estado: { handlers: RealtimeHandlers | null } = { handlers: null }
  return {
    estado,
    conectar: vi.fn((_projeto: string, handlers: RealtimeHandlers) => {
      estado.handlers = handlers
      return { stop: async () => {} }
    }),
  }
})
const avisar = (evento: RealtimeEvent) => act(() => aoVivo.estado.handlers?.onEvent(evento))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectReportService: {
      listReports: dublê.listar,
      listReportCounts: dublê.contar,
      openReport: dublê.abrir,
      moveReport: dublê.mover,
      refreshReport: dublê.atualizar,
      listReportHistory: dublê.historico,
      listComments: dublê.comentarios,
      listLinks: vi.fn().mockResolvedValue([]),
    },
    realtimeService: { connectWork: aoVivo.conectar },
    projectReportAttachmentService: { listAttachments: dublê.anexos },
    projectCycleSettingsService: { getCycleSettings: dublê.ciclo },
    projectLabelService: { listLabels: dublê.etiquetas },
    projectTeamService: { listMembers: dublê.time },
    projectPriorityService: { listPriorities: dublê.prioridades },
    sprintService: { listSprints: dublê.sprints },
  }
})

function projeto(publicId: string): ProjectViewModel {
  return {
    PublicId: publicId,
    Name: `Projeto ${publicId}`,
    Status: 'Active',
    CreatedAt: '2026-08-01T12:00:00.000Z',
    UpdatedAt: '2026-08-01T12:00:00.000Z',
    Account: { PublicId: 'conta-1', Name: 'Conta de teste' },
    Role: 'Administrator',
    IsAccountOwner: true,
    LastReportReceivedAt: null,
    LastActivityAt: null,
  }
}

function card(
  publicId: string,
  title: string,
  extra: Partial<ReportSummaryViewModel> = {},
): ReportSummaryViewModel {
  return {
    PublicId: publicId,
    Kind: 'Team',
    Number: [...publicId].reduce((soma, letra) => soma + letra.charCodeAt(0), 0),
    Title: title,
    ReporterTitle: null,
    TrackingCode: null,
    Type: { PublicId: 'tipo-defeito', Name: 'Defeito', Color: 'Red', Icon: 'Bug', IsActive: true },
    Text: title,
    Route: null,
    Origin: null,
    StatePublicId: 's-1',
    StateName: 'Análise',
    PublicStageLabel: null,
    AcceptsQuestions: true,
    PublicStageDueAt: null,
    ArchivedAt: null,
    CreatedAt: '2026-09-01T12:00:00.000Z',
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

const PAI = card('r-1', 'Pagamento no Safari', { SubtaskCount: 2, SubtasksDone: 0 })
const SUBTAREFA = card('sub-1', 'Trocar o botao', {
  Parent: { PublicId: 'r-1', Number: PAI.Number, Headline: 'Pagamento no Safari' },
})

function contagem(StatePublicId: string, StateName: string, Total: number) {
  return {
    StatePublicId,
    StateName,
    IsActive: true,
    ClosesReport: false,
    Total,
  } satisfies ReportStateCountViewModel
}

function ProjetoDaRota() {
  const { publicId = '' } = useParams()
  return <Outlet context={{ project: projeto(publicId) }} />
}

function montar(endereco = '/p/p-1') {
  const router = createMemoryRouter(
    [
      {
        path: '/p/:publicId',
        element: <ProjetoDaRota />,
        children: [
          {
            path: '',
            element: <ReportsScreen />,
            children: [{ path: ':reportPublicId', element: <ReportDetailRoute /> }],
          },
        ],
      },
    ],
    { initialEntries: [endereco] },
  )
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  )
}

/** O aviso de que um card mudou; com o pai, e o aviso de uma subtarefa. */
const cardMudou = (ReportPublicId: string, StatePublicId: string, ParentPublicId?: string) =>
  avisar({
    kind: 'card',
    notice: {
      ProjectPublicId: 'p-1',
      ReportPublicId,
      StatePublicId,
      Archived: false,
      Origin: null,
      ...(ParentPublicId ? { ParentPublicId } : {}),
    },
  })

/** Mais do que a espera que junta os avisos (250 ms) antes de reler. */
const passarDaEspera = () => act(() => new Promise((pronto) => setTimeout(pronto, 600)))

instalarRemendosDoRadix()

describe('a subtarefa fica dentro do pai', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of [
      dublê.listar,
      dublê.contar,
      dublê.abrir,
      dublê.mover,
      dublê.atualizar,
      dublê.ciclo,
      dublê.historico,
      dublê.comentarios,
      dublê.anexos,
    ])
      mock.mockReset()
    dublê.ciclo.mockResolvedValue({ LastColumnVisibleDays: 14, DueSoonDays: 2 })
    dublê.historico.mockResolvedValue([])
    dublê.comentarios.mockResolvedValue({ Internal: [], Public: [] })
    dublê.anexos.mockResolvedValue([])
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 1), contagem('s-2', 'Pronto', 0)])
    aoVivo.estado.handlers = null
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('no quadro, o aviso de uma subtarefa nao rele coluna nem contagem; o de um card rele', async () => {
    dublê.listar.mockImplementation(async (_p, _pagina, estado) => {
      const reports = estado === 's-1' ? [PAI] : []
      return { reports, total: reports.length }
    })
    window.localStorage.setItem('pds.web.trabalho.vista.p-1', 'quadro')

    montar()
    await within(await screen.findByRole('region', { name: 'Análise' })).findByText(
      'Pagamento no Safari',
    )
    await waitFor(() => expect(aoVivo.estado.handlers).not.toBeNull())
    const antes = {
      listas: dublê.listar.mock.calls.length,
      contagens: dublê.contar.mock.calls.length,
    }

    // A subtarefa do pai foi para Pronto: o quadro nao tem o que reler por ela.
    cardMudou('sub-1', 's-2', 'r-1')
    await passarDaEspera()

    expect(dublê.listar.mock.calls.length).toBe(antes.listas)
    expect(dublê.contar.mock.calls.length).toBe(antes.contagens)
    expect(
      within(screen.getByRole('region', { name: 'Pronto' })).queryByText('Trocar o botao'),
    ).toBeNull()

    // O mesmo aviso de um card comum rele: a espera acima bastava.
    cardMudou('r-1', 's-2')
    await waitFor(() => expect(dublê.listar.mock.calls.length).toBeGreaterThan(antes.listas))
    await waitFor(() => expect(dublê.contar.mock.calls.length).toBeGreaterThan(antes.contagens))
  })

  it('na lista, o aviso de uma subtarefa nao rele a pagina; o de um card rele', async () => {
    dublê.listar.mockResolvedValue({ reports: [PAI], total: 1 })

    montar()
    await screen.findByRole('link', { name: 'Pagamento no Safari' })
    await waitFor(() => expect(aoVivo.estado.handlers).not.toBeNull())
    const antes = {
      listas: dublê.listar.mock.calls.length,
      contagens: dublê.contar.mock.calls.length,
    }

    cardMudou('sub-1', 's-1', 'r-1')
    await passarDaEspera()

    expect(dublê.listar.mock.calls.length).toBe(antes.listas)
    expect(dublê.contar.mock.calls.length).toBe(antes.contagens)

    cardMudou('r-1', 's-1')
    await waitFor(() => expect(dublê.listar.mock.calls.length).toBeGreaterThan(antes.listas))
  })

  it('a subtarefa aberta que muda de coluna nao entra na lista: o pai e relido, com o progresso novo', async () => {
    dublê.listar.mockResolvedValue({ reports: [PAI], total: 1 })
    dublê.abrir.mockResolvedValue({
      ...SUBTAREFA,
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })
    dublê.mover.mockResolvedValue({ ...SUBTAREFA, StatePublicId: 's-2', StateName: 'Pronto' })
    dublê.atualizar.mockResolvedValue({ ...PAI, SubtasksDone: 1 })

    montar('/p/p-1/sub-1')

    // Com o dialogo aberto, o resto da pagina fica escondido do leitor de tela: a busca
    // pela lista atras dele precisa de `hidden`.
    const linhaDoPai = (
      await screen.findByRole('link', { name: 'Pagamento no Safari', hidden: true })
    ).closest('tr')
    if (!linhaDoPai) throw new Error('a linha do pai')
    expect(within(linhaDoPai).getByText('0 de 2 subtarefas feitas')).toBeTruthy()
    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    const contagensAntes = dublê.contar.mock.calls.length

    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')

    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'sub-1', { StatePublicId: 's-2' }),
    )
    // Quem e relido e o pai, e a frente dele mostra o progresso novo.
    await waitFor(() => expect(dublê.atualizar).toHaveBeenCalledWith('p-1', 'r-1'))
    await waitFor(() =>
      expect(within(linhaDoPai).getByText('1 de 2 subtarefas feitas')).toBeTruthy(),
    )
    // A subtarefa nao virou linha da lista, e a contagem das colunas nao mudou por ela.
    const tabela = screen.getByRole('table', { hidden: true })
    expect(within(tabela).getAllByRole('row', { hidden: true }).length).toBe(2)
    expect(within(tabela).queryByText('Trocar o botao')).toBeNull()
    expect(dublê.contar.mock.calls.length).toBe(contagensAntes)
  })
})
