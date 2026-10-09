// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CardSprintViewModel,
  CreateTeamCardRequest,
  ProjectViewModel,
  ReportDetailViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
  SprintViewModel,
} from '@/contracts'
import type { RealtimeEvent, RealtimeHandlers, ReportListOptions, ReportPage } from '@/data'
import { PanelError } from '@/data/errors'
import { ReportsScreen } from '@/features/reports/ReportsScreen'
import { Toaster } from '@/shared/components/Toaster'
import { TooltipProvider } from '@/shared/components/Tooltip'
import { useToastStore } from '@/shared/components/toastStore'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: a tela de Trabalho com as sprints ligadas — a ligacao entre
 * a tela, o "Novo card" e as sprints. O que mora dentro dos dialogos de iniciar e de
 * concluir (as datas, o destino de cada um) e o Backlog por dentro ficam em
 * `sprints/sprints.test.tsx`; o dialogo "Novo card" sem as sprints, em `TeamCards.test.tsx`.
 *
 * - **O card novo diz onde entra** ("Entra em", S-02): o backlog de saida no "Novo card"
 *   do topo, a sprint em andamento no "Mais detalhes" de uma coluna do quadro, e a
 *   concluida nunca. A escolhida vai no proprio pedido (`SprintPublicId`); o backlog nao
 *   leva sprint nenhuma.
 * - **O aviso diz onde o card foi parar** (S-02, L-05). No quadro, o card que nasce fora
 *   da sprint em andamento nao aparece ali: o aviso diz isso e oferece "Levar para a
 *   Sprint 2", que o poe na sprint e no quadro — ou mostra o erro. Na lista, "criado no
 *   backlog." ou "criado na Sprint 3.", com "Abrir".
 * - **O filtro "Sprint" da Lista tem as concluidas** (decisao 83, S-06), num grupo
 *   proprio depois das abertas, lidas a parte (`closed`) so com a Lista na tela — o
 *   quadro, o Backlog e o card novo leem so as abertas. A concluida escolhida fica
 *   lembrada na aba; a sprint concluida com o filtro nela continua no filtro, agora no
 *   grupo; a apagada sai; e, falhando a leitura com as concluidas, o menu fica com as
 *   abertas.
 * - **O quadro sem sprint em andamento** (S-13) explica por que esta vazio, esconde o que
 *   ali nao serve (a busca, os filtros, a dica, as raias) e oferece iniciar a proxima ou
 *   ir ao Backlog.
 * - **As sprints que nao carregaram** (S-14) viram um aviso com "Tentar de novo", no
 *   quadro e no Backlog — e nao um carregando para sempre.
 * - **Concluir pela barra do quadro** (S-16) termina num aviso que oferece iniciar a
 *   proxima, e o botao abre o dialogo de iniciar.
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
  criar:
    vi.fn<(publicId: string, request: CreateTeamCardRequest) => Promise<ReportDetailViewModel>>(),
  porNaSprint: vi.fn(),
  ciclo: vi.fn(),
  time: vi.fn(),
  prioridades: vi.fn(),
  etiquetas: vi.fn(),
  listarSprints:
    vi.fn<(publicId: string, options?: { closed?: boolean }) => Promise<SprintViewModel[]>>(),
  iniciar: vi.fn(),
  concluir: vi.fn(),
}))

/** A conexao em tempo real de mentira: guarda quem ouve, e o teste manda os avisos. */
const aoVivo = vi.hoisted(() => {
  const estado: { handlers: RealtimeHandlers | null } = { handlers: null }
  return {
    estado,
    conectar: (_projeto: string, handlers: RealtimeHandlers) => {
      estado.handlers = handlers
      return { stop: async () => {} }
    },
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
      createTeamCard: dublê.criar,
      setSprint: dublê.porNaSprint,
    },
    realtimeService: { connectWork: aoVivo.conectar },
    projectCycleSettingsService: { getCycleSettings: dublê.ciclo },
    projectTeamService: { listMembers: dublê.time },
    projectPriorityService: { listPriorities: dublê.prioridades },
    projectLabelService: { listLabels: dublê.etiquetas },
    sprintService: {
      listSprints: dublê.listarSprints,
      startSprint: dublê.iniciar,
      closeSprint: dublê.concluir,
      createSprint: vi.fn(),
      updateSprint: vi.fn(),
      deleteSprint: vi.fn(),
    },
  }
})

function projeto(publicId: string): ProjectViewModel {
  return {
    PublicId: publicId,
    Name: 'Loja',
    Status: 'Active',
    CreatedAt: '2026-08-01T12:00:00.000Z',
    UpdatedAt: '2026-08-01T12:00:00.000Z',
    Account: { PublicId: 'conta-1', Name: 'Conta' },
    Role: 'Administrator',
    IsAccountOwner: true,
    LastReportReceivedAt: null,
    LastActivityAt: null,
  }
}

function ProjetoDaRota() {
  const { publicId = '' } = useParams()
  return <Outlet context={{ project: projeto(publicId) }} />
}

/** O card aberto, so pelo endereco: e o que o "Abrir" do aviso muda. */
function CardAberto() {
  const { reportPublicId = '' } = useParams()
  return <p>Card aberto: {reportPublicId}</p>
}

/** A tela, com a vista lembrada (lista, quadro ou backlog) e os avisos, como no app. */
function montar(vista?: 'lista' | 'quadro' | 'backlog') {
  if (vista) window.localStorage.setItem('pds.web.trabalho.vista.p-1', vista)
  const router = createMemoryRouter(
    [
      {
        path: '/p/:publicId',
        element: <ProjetoDaRota />,
        children: [
          {
            path: '',
            element: <ReportsScreen />,
            children: [{ path: ':reportPublicId', element: <CardAberto /> }],
          },
        ],
      },
    ],
    { initialEntries: ['/p/p-1'] },
  )
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
      <Toaster />
    </TooltipProvider>,
  )
  return router
}

function coluna(id: string, nome: string, total: number): ReportStateCountViewModel {
  return { StatePublicId: id, StateName: nome, IsActive: true, ClosesReport: false, Total: total }
}

const COLUNAS = [coluna('e-1', 'A fazer', 1), coluna('e-2', 'Fazendo', 0)]

function sprint(
  extra: Partial<SprintViewModel> & Pick<SprintViewModel, 'PublicId' | 'Number' | 'Name' | 'State'>,
): SprintViewModel {
  return {
    Goal: null,
    StartsOn: '2026-10-05',
    EndsOn: '2026-10-18',
    StartedAt: null,
    ClosedAt: null,
    Cards: 0,
    DoneCards: 0,
    Points: 0,
    DonePoints: 0,
    ...extra,
  }
}

const SPRINT_1 = sprint({
  PublicId: 'sp-1',
  Number: 1,
  Name: 'Sprint 1',
  State: 'Closed',
  StartsOn: '2026-09-21',
  EndsOn: '2026-10-04',
  StartedAt: '2026-09-21T12:00:00.000Z',
  ClosedAt: '2026-10-04T20:00:00.000Z',
})
const SPRINT_2 = sprint({
  PublicId: 'sp-2',
  Number: 2,
  Name: 'Sprint 2',
  State: 'Active',
  StartedAt: '2026-10-05T12:00:00.000Z',
  Cards: 3,
  DoneCards: 1,
})
const SPRINT_3 = sprint({
  PublicId: 'sp-3',
  Number: 3,
  Name: 'Sprint 3',
  State: 'Planned',
  StartsOn: '2026-10-19',
  EndsOn: '2026-11-01',
})
/** A Sprint 2 depois de concluida. */
const SPRINT_2_CONCLUIDA: SprintViewModel = {
  ...SPRINT_2,
  State: 'Closed',
  ClosedAt: '2026-10-08T15:00:00.000Z',
}

/** A sprint como o card a carrega. */
const daSprint = (item: SprintViewModel): CardSprintViewModel => ({
  PublicId: item.PublicId,
  Name: item.Name,
  State: item.State,
})

/**
 * As sprints do projeto: as que nao fecharam, sempre; as concluidas, depois delas, so
 * quando pedidas (`closed`) — como a API.
 */
function sprintsDoProjeto(abertas: SprintViewModel[], concluidas: SprintViewModel[] = []) {
  dublê.listarSprints.mockImplementation(async (_projeto, opcoes) =>
    opcoes?.closed ? [...abertas, ...concluidas] : abertas,
  )
}

function cardDoTime(
  publicId: string,
  titulo: string,
  extra: Partial<ReportSummaryViewModel> = {},
): ReportSummaryViewModel {
  return {
    PublicId: publicId,
    Kind: 'Team',
    Number: 7,
    Title: titulo,
    ReporterTitle: null,
    TrackingCode: null,
    Type: null,
    Text: null,
    Route: null,
    Origin: null,
    StatePublicId: 'e-1',
    StateName: 'A fazer',
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

function aberto(resumo: ReportSummaryViewModel): ReportDetailViewModel {
  return {
    ...resumo,
    Description: null,
    CreatedByName: 'Ana',
    CanArchive: true,
    ArchiveCloses: false,
    Closure: null,
    InfoRequest: null,
    CanAskInfo: false,
    ModerationState: 'Pending',
    Contexts: [],
    Reopenings: [],
  }
}

/** O card que ja esta no trabalho: na lista, e na coluna "A fazer" da Sprint 2. */
const NA_SPRINT = cardDoTime('t-1', 'Revisar o checkout', {
  Number: 30,
  Sprint: daSprint(SPRINT_2),
})

/**
 * A lista e cada coluna do quadro respondem o que o teste pos; as listas do Backlog vem
 * vazias.
 */
function cardsNaTela({
  lista = [NA_SPRINT],
  quadro = { 'e-1': [NA_SPRINT] },
}: {
  lista?: ReportSummaryViewModel[]
  quadro?: Record<string, ReportSummaryViewModel[]>
} = {}) {
  dublê.listar.mockImplementation(async (_projeto, _pagina, estado, _arquivados, opcoes) => {
    if (opcoes?.order === 'board') {
      const reports = quadro[estado ?? ''] ?? []
      return { reports, total: reports.length }
    }
    if (opcoes?.order === 'backlog') return { reports: [], total: 0 }
    return { reports: lista, total: lista.length }
  })
}

/**
 * O card novo como a API devolve: com o titulo, a coluna e a sprint do pedido, e o
 * numero seguinte a cada criacao (o primeiro e o #40).
 */
function criarCards() {
  let numero = 40
  dublê.criar.mockImplementation(async (_projeto, pedido) => {
    const sprintDoCard = [SPRINT_2, SPRINT_3].find(
      (item) => item.PublicId === pedido.SprintPublicId,
    )
    const estado = pedido.StatePublicId ?? 'e-1'
    const n = numero++
    return aberto(
      cardDoTime(`t-${n}`, pedido.Title, {
        Number: n,
        StatePublicId: estado,
        StateName: COLUNAS.find((item) => item.StatePublicId === estado)?.StateName ?? null,
        Sprint: sprintDoCard ? daSprint(sprintDoCard) : null,
      }),
    )
  })
}

// A caixa de escolha e o menu desenham a propria lista, e o jsdom nao tem o que eles
// usam para abrir.
instalarRemendosDoRadix()

beforeEach(() => {
  for (const mock of Object.values(dublê)) mock.mockReset()
  // A vista e as raias ficam neste navegador; os filtros, na aba.
  window.localStorage.clear()
  window.sessionStorage.clear()
  useToastStore.setState({ toasts: [] })
  aoVivo.estado.handlers = null
  // As sprints ligadas no Ciclo, com sprints de duas semanas.
  dublê.ciclo.mockResolvedValue({
    LastColumnVisibleDays: 14,
    DueSoonDays: 2,
    SprintsEnabled: true,
    SprintLengthWeeks: 2,
  })
  dublê.contar.mockResolvedValue(COLUNAS)
  dublê.time.mockResolvedValue([])
  dublê.prioridades.mockResolvedValue([])
  dublê.etiquetas.mockResolvedValue([])
  sprintsDoProjeto([SPRINT_2, SPRINT_3], [SPRINT_1])
  cardsNaTela()
  criarCards()
})

afterEach(() => {
  cleanup()
  // O teste que fixa o dia finge so o `Date`.
  vi.useRealTimers()
})

/** Abre um menu da barra de filtros. O Radix abre no `pointerdown`, e nao no clique. */
async function abrirMenu(nome: string | RegExp) {
  fireEvent.pointerDown(await screen.findByRole('button', { name: nome }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  return screen.findByRole('menu')
}

/** Fecha o menu aberto pelo Esc, como a pessoa faz. */
async function fecharMenu() {
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
}

/** Abre a caixa de escolha (o Radix abre no `pointerdown`) e devolve os nomes das opcoes. */
function abrirEscolha(campo: HTMLElement) {
  fireEvent.pointerDown(campo, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  return () => screen.getAllByRole('option').map((opcao) => opcao.textContent)
}

/** As leituras da Lista: as do quadro e as do Backlog levam a ordem delas. */
const leiturasDaLista = () =>
  dublê.listar.mock.calls.filter((chamada) => chamada[4]?.order === undefined)
const ultimaLeituraDaLista = () => leiturasDaLista().at(-1)
/**
 * A sprint da ultima leitura da Lista. Com a sprint, os filtros vao junto, todos vazios —
 * o que nao poe nada no endereco; aqui importa a sprint.
 */
const sprintDaUltimaLeitura = () => ultimaLeituraDaLista()?.[4]?.sprint
/** Quantas vezes as sprints foram lidas com as concluidas. */
const leiturasComConcluidas = () =>
  dublê.listarSprints.mock.calls.filter(([, opcoes]) => opcoes?.closed === true).length

/** O aviso com esta frase, como a pessoa o ve: a frase e os botoes dele. */
async function aviso(frase: string) {
  const texto = await screen.findByText(frase)
  return texto.closest('[role="status"], [role="alert"]') as HTMLElement
}

/** Espera o dialogo fechar: aberto, ele esconde o resto da pagina do leitor de tela. */
async function semDialogo() {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

/** A Lista pronta, com as sprints lidas: o menu "Sprint" so aparece com elas. */
async function listaPronta() {
  await screen.findByRole('link', { name: 'Revisar o checkout' })
  await screen.findByRole('button', { name: 'Sprint' })
}

/** O quadro pronto, com a sprint em andamento em cima. */
async function quadroPronto() {
  await screen.findByRole('region', { name: 'Sprint em andamento: Sprint 2' })
  const aFazer = await screen.findByRole('region', { name: 'A fazer' })
  await within(aFazer).findByText('Revisar o checkout')
  return aFazer
}

describe('o card novo, com as sprints ligadas', () => {
  it('o "Novo card" do topo pergunta onde o card entra: o backlog de saida, a em andamento e as planejadas — e o backlog nao leva sprint', async () => {
    montar()
    await listaPronta()

    fireEvent.click(screen.getByRole('button', { name: 'Novo card' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo card' })
    const entraEm = within(dialogo).getByRole('combobox', { name: 'Entra em' })
    expect(entraEm.textContent).toBe('Backlog')

    // A concluida nao recebe card: nem aparece.
    const opcoes = abrirEscolha(entraEm)
    await waitFor(() =>
      expect(opcoes()).toEqual(['Backlog', 'Sprint 2 (em andamento)', 'Sprint 3 (planejada)']),
    )
    fireEvent.click(screen.getByRole('option', { name: 'Backlog' }))

    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Título' }), {
      target: { value: 'Revisar a ajuda' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Criar card' }))

    // O backlog e a ausencia de sprint: o pedido e o de sempre.
    await waitFor(() =>
      expect(dublê.criar).toHaveBeenCalledWith('p-1', {
        Title: 'Revisar a ajuda',
        Description: null,
        StatePublicId: 'e-1',
      }),
    )
  })

  it('pelo "Mais detalhes" de uma coluna do quadro, o card entra de saida na sprint em andamento: o pedido a leva, e o card nasce no quadro', async () => {
    montar('quadro')
    await quadroPronto()
    const fazendo = screen.getByRole('region', { name: 'Fazendo' })

    fireEvent.click(within(fazendo).getByRole('button', { name: 'Criar card em Fazendo' }))
    fireEvent.change(
      within(fazendo).getByRole('textbox', { name: 'Título do card novo em Fazendo' }),
      { target: { value: 'Revisar o frete' } },
    )
    fireEvent.click(within(fazendo).getByRole('button', { name: 'Mais detalhes' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Novo card' })
    expect(within(dialogo).getByRole('combobox', { name: 'Entra em' }).textContent).toBe(
      'Sprint 2 (em andamento)',
    )
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Criar card' }))

    await waitFor(() =>
      expect(dublê.criar).toHaveBeenCalledWith('p-1', {
        Title: 'Revisar o frete',
        Description: null,
        StatePublicId: 'e-2',
        SprintPublicId: 'sp-2',
      }),
    )
    await semDialogo()
    // Na sprint do quadro, o card esta a vista na coluna de onde veio; o aviso diz onde.
    expect(await within(fazendo).findByText('Revisar o frete')).toBeTruthy()
    const criado = await aviso('#40 criado na Sprint 2.')
    expect(within(criado).getByRole('button', { name: 'Abrir' })).toBeTruthy()
  })

  it('no quadro, o card que nasce no backlog avisa que nao aparece ali, e "Levar para a Sprint 2" o poe na sprint e no quadro', async () => {
    dublê.porNaSprint.mockImplementation(async (_projeto: string, id: string) =>
      cardDoTime(id, 'Trocar o gateway', { Number: 40, Sprint: daSprint(SPRINT_2) }),
    )
    montar('quadro')
    const aFazer = await quadroPronto()

    fireEvent.click(screen.getByRole('button', { name: 'Novo card' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo card' })
    expect(within(dialogo).getByRole('combobox', { name: 'Entra em' }).textContent).toBe('Backlog')
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Título' }), {
      target: { value: 'Trocar o gateway' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Criar card' }))
    await semDialogo()

    // Criado no backlog, ele nao entra no quadro da sprint — e o aviso diz isso.
    const criado = await aviso('#40 criado no backlog — não aparece no quadro da sprint.')
    expect(within(aFazer).queryByText('Trocar o gateway')).toBeNull()

    fireEvent.click(within(criado).getByRole('button', { name: 'Levar para a Sprint 2' }))
    await waitFor(() =>
      expect(dublê.porNaSprint).toHaveBeenCalledWith('p-1', 't-40', { SprintPublicId: 'sp-2' }),
    )
    expect(await within(aFazer).findByText('Trocar o gateway')).toBeTruthy()
    expect(await aviso('#40 foi para a Sprint 2.')).toBeTruthy()
  })

  it('"Levar para a Sprint 2" que a API recusa mostra o erro, e o card continua fora do quadro', async () => {
    dublê.porNaSprint.mockRejectedValue(new PanelError('A sprint ja foi concluida.', 409))
    montar('quadro')
    const aFazer = await quadroPronto()

    fireEvent.click(screen.getByRole('button', { name: 'Novo card' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo card' })
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Título' }), {
      target: { value: 'Trocar o gateway' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Criar card' }))
    await semDialogo()

    const criado = await aviso('#40 criado no backlog — não aparece no quadro da sprint.')
    fireEvent.click(within(criado).getByRole('button', { name: 'Levar para a Sprint 2' }))

    // O texto da API, acentuado no painel, num aviso de erro.
    const erro = await screen.findByRole('alert')
    expect(erro.textContent).toContain('A sprint já foi concluída.')
    expect(within(aFazer).queryByText('Trocar o gateway')).toBeNull()
    expect(screen.queryByText('#40 foi para a Sprint 2.')).toBeNull()
  })

  it('na lista, o aviso diz onde o card entrou — "criado no backlog." ou "criado na Sprint 3." —, e "Abrir" abre o card', async () => {
    const router = montar()
    await listaPronta()

    // De saida, no backlog.
    fireEvent.click(screen.getByRole('button', { name: 'Novo card' }))
    let dialogo = await screen.findByRole('dialog', { name: 'Novo card' })
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Título' }), {
      target: { value: 'Revisar a ajuda' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Criar card' }))
    await semDialogo()
    const noBacklog = await aviso('#40 criado no backlog.')
    expect(within(noBacklog).getByRole('button', { name: 'Abrir' })).toBeTruthy()

    // Escolhida uma planejada, o pedido a leva, e o aviso diz qual.
    fireEvent.click(screen.getByRole('button', { name: 'Novo card' }))
    dialogo = await screen.findByRole('dialog', { name: 'Novo card' })
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Título' }), {
      target: { value: 'Medir o checkout' },
    })
    await escolherNoSelect(screen, fireEvent, 'Entra em', 'Sprint 3 (planejada)')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Criar card' }))
    await waitFor(() =>
      expect(dublê.criar).toHaveBeenLastCalledWith('p-1', {
        Title: 'Medir o checkout',
        Description: null,
        StatePublicId: 'e-1',
        SprintPublicId: 'sp-3',
      }),
    )
    await semDialogo()

    const naSprint = await aviso('#41 criado na Sprint 3.')
    fireEvent.click(within(naSprint).getByRole('button', { name: 'Abrir' }))
    expect(await screen.findByText('Card aberto: t-41')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/p/p-1/t-41')
  })
})

describe('o filtro "Sprint" da Lista', () => {
  it('tem as abertas e, depois, o grupo "Concluídas"; escolher uma concluida pede a lista dela, e o botao diz qual', async () => {
    montar()
    await listaPronta()

    const menu = await abrirMenu('Sprint')
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['Todas', 'Backlog', 'Sprint 2 (em andamento)', 'Sprint 3 (planejada)', 'Sprint 1'])
    // O grupo tem nome (o leitor de tela o anuncia) e vem depois de uma linha.
    const concluidas = within(menu).getByRole('group', { name: 'Concluídas' })
    expect(
      within(concluidas)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['Sprint 1'])
    expect(within(menu).getByRole('separator')).toBeTruthy()

    fireEvent.click(within(concluidas).getByRole('menuitemradio', { name: 'Sprint 1' }))
    await waitFor(() => expect(sprintDaUltimaLeitura()).toBe('sp-1'))
    expect(screen.getByRole('button', { name: 'Sprint: Sprint 1' }).textContent).toBe(
      'Sprint: Sprint 1',
    )
  })

  it('sem sprint concluida, o menu nao tem o grupo nem a linha', async () => {
    sprintsDoProjeto([SPRINT_2, SPRINT_3])
    montar()
    await listaPronta()

    const menu = await abrirMenu('Sprint')
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['Todas', 'Backlog', 'Sprint 2 (em andamento)', 'Sprint 3 (planejada)'])
    expect(within(menu).queryByRole('group', { name: 'Concluídas' })).toBeNull()
    expect(within(menu).queryByText('Concluídas')).toBeNull()
    expect(within(menu).queryByRole('separator')).toBeNull()
  })

  it('as concluidas so sao lidas com a Lista na tela: o quadro, o Backlog e o card novo leem so as abertas', async () => {
    montar('quadro')
    await quadroPronto()
    expect(leiturasComConcluidas()).toBe(0)

    // O card novo, aberto do quadro, fica com as abertas que a tela ja tem.
    fireEvent.click(screen.getByRole('button', { name: 'Novo card' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo card' })
    const opcoes = abrirEscolha(within(dialogo).getByRole('combobox', { name: 'Entra em' }))
    await waitFor(() =>
      expect(opcoes()).toEqual(['Backlog', 'Sprint 2 (em andamento)', 'Sprint 3 (planejada)']),
    )
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    await semDialogo()

    fireEvent.click(screen.getByRole('tab', { name: 'Backlog' }))
    expect(await screen.findByRole('list', { name: 'Cards do backlog' })).toBeTruthy()
    expect(leiturasComConcluidas()).toBe(0)

    // Na Lista, sim, uma vez ao entrar: e para o filtro.
    fireEvent.click(screen.getByRole('tab', { name: 'Lista' }))
    await listaPronta()
    expect(leiturasComConcluidas()).toBe(1)
    // As outras leituras foram sem o parametro.
    expect(
      dublê.listarSprints.mock.calls
        .filter(([, opcoes]) => opcoes?.closed !== true)
        .every(([projeto, opcoes]) => projeto === 'p-1' && opcoes === undefined),
    ).toBe(true)
  })

  it('aberta a tela na Lista, as concluidas sao lidas uma vez so', async () => {
    montar()
    await listaPronta()
    await abrirMenu('Sprint')
    await fecharMenu()

    // `useSprintsForFilter`: "a primeira leitura das abertas nao rele" — a do filtro
    // acabou de ser lida junto. Aqui a primeira leitura das abertas chega depois de a
    // tela saber que as sprints estao ligadas, e nao deve pedir as concluidas de novo.
    expect(leiturasComConcluidas()).toBe(1)
  })

  it('a concluida escolhida continua depois de recarregar a pagina', async () => {
    montar()
    await listaPronta()
    await abrirMenu('Sprint')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sprint 1' }))
    expect(await screen.findByRole('button', { name: 'Sprint: Sprint 1' })).toBeTruthy()
    cleanup()

    montar()
    expect(await screen.findByRole('button', { name: 'Sprint: Sprint 1' })).toBeTruthy()
    await waitFor(() => expect(sprintDaUltimaLeitura()).toBe('sp-1'))
  })

  it('concluir pela barra do quadro a sprint que esta no filtro nao a tira do filtro: ela passa ao grupo das concluidas', async () => {
    dublê.concluir.mockImplementation(async () => {
      sprintsDoProjeto([SPRINT_3], [SPRINT_2_CONCLUIDA, SPRINT_1])
      return { Sprint: SPRINT_2_CONCLUIDA, Moved: 2, Destination: SPRINT_3 }
    })
    montar()
    await listaPronta()
    await abrirMenu('Sprint')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sprint 2 (em andamento)' }))
    expect(await screen.findByRole('button', { name: 'Sprint: Sprint 2' })).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Quadro' }))
    const barra = await screen.findByRole('region', { name: 'Sprint em andamento: Sprint 2' })
    fireEvent.click(within(barra).getByRole('button', { name: 'Concluir sprint' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Concluir Sprint 2' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Concluir sprint' }))
    await semDialogo()

    fireEvent.click(screen.getByRole('tab', { name: 'Lista' }))
    expect(await screen.findByRole('button', { name: 'Sprint: Sprint 2' })).toBeTruthy()
    const menu = await abrirMenu('Sprint: Sprint 2')
    const concluidas = within(menu).getByRole('group', { name: 'Concluídas' })
    expect(
      within(concluidas)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['Sprint 2', 'Sprint 1'])
    expect(
      within(concluidas)
        .getByRole('menuitemradio', { name: 'Sprint 2' })
        .getAttribute('aria-checked'),
    ).toBe('true')
    await fecharMenu()
    await waitFor(() => expect(sprintDaUltimaLeitura()).toBe('sp-2'))
  })

  it('concluida por outra pessoa com a Lista na tela, a sprint do filtro passa ao grupo, e o filtro continua', async () => {
    montar()
    await listaPronta()
    await abrirMenu('Sprint')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sprint 2 (em andamento)' }))
    await waitFor(() => expect(sprintDaUltimaLeitura()).toBe('sp-2'))
    const leituras = leiturasComConcluidas()

    // A sprint mudou em outra aba: a API avisa o projeto, e a tela rele as sprints.
    sprintsDoProjeto([SPRINT_3], [SPRINT_2_CONCLUIDA, SPRINT_1])
    await avisar({ kind: 'project' })
    await waitFor(() => expect(leiturasComConcluidas()).toBeGreaterThan(leituras))

    const menu = await abrirMenu('Sprint: Sprint 2')
    await waitFor(() =>
      expect(
        within(within(menu).getByRole('group', { name: 'Concluídas' }))
          .getAllByRole('menuitemradio')
          .map((item) => item.textContent),
      ).toEqual(['Sprint 2', 'Sprint 1']),
    )
    await fecharMenu()
    expect(screen.getByRole('button', { name: 'Sprint: Sprint 2' })).toBeTruthy()
    expect(sprintDaUltimaLeitura()).toBe('sp-2')
  })

  it('a sprint apagada sai do filtro, e a lista volta sem ele', async () => {
    montar()
    await listaPronta()
    await abrirMenu('Sprint')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sprint 3 (planejada)' }))
    await waitFor(() => expect(sprintDaUltimaLeitura()).toBe('sp-3'))

    // Apagada em outra aba: a API avisa o projeto.
    sprintsDoProjeto([SPRINT_2], [SPRINT_1])
    await avisar({ kind: 'project' })

    expect(await screen.findByRole('button', { name: 'Sprint' })).toBeTruthy()
    await waitFor(() => expect(ultimaLeituraDaLista()).toEqual(['p-1', 1, null, false]))
  })

  it('falhando a leitura com as concluidas, o menu fica com as abertas, e a concluida escolhida sai do filtro', async () => {
    montar()
    await listaPronta()
    await abrirMenu('Sprint')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sprint 1' }))
    expect(await screen.findByRole('button', { name: 'Sprint: Sprint 1' })).toBeTruthy()
    cleanup()

    dublê.listarSprints.mockImplementation(async (_projeto, opcoes) => {
      if (opcoes?.closed) throw new PanelError('Erro interno.', 500)
      return [SPRINT_2, SPRINT_3]
    })
    montar()
    await screen.findByRole('link', { name: 'Revisar o checkout' })

    const menu = await abrirMenu('Sprint')
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['Todas', 'Backlog', 'Sprint 2 (em andamento)', 'Sprint 3 (planejada)'])
    await fecharMenu()
    await waitFor(() => expect(ultimaLeituraDaLista()).toEqual(['p-1', 1, null, false]))
  })
})

describe('as sprints no quadro e no Backlog', () => {
  it('sem sprint em andamento, o quadro diz por que esta vazio e esconde a busca, os filtros, a dica e as raias', async () => {
    const planejada = { ...SPRINT_2, State: 'Planned' as const, StartedAt: null }
    sprintsDoProjeto([planejada], [SPRINT_1])
    montar('quadro')

    expect(
      await screen.findByText(
        'Nenhuma sprint em andamento. O quadro mostra só a sprint em andamento: os cards em trabalho estão no Backlog e nas sprints planejadas.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('searchbox', { name: 'Buscar cards' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Meus cards' })).toBeNull()
    expect(screen.queryByText(/Arraste para mover/)).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Raias do quadro' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'A fazer' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Iniciar a Sprint 2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ir para o Backlog' })).toBeTruthy()
  })

  it('"Iniciar a Sprint 2" do quadro vazio abre o dialogo de iniciar, com a duracao do projeto; iniciada, o quadro mostra a sprint', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 8, 10, 0))
    // Sprints de tres semanas neste projeto: o dialogo aberto pela tela usa a do Ciclo.
    dublê.ciclo.mockResolvedValue({
      LastColumnVisibleDays: 14,
      DueSoonDays: 2,
      SprintsEnabled: true,
      SprintLengthWeeks: 3,
    })
    const planejada = { ...SPRINT_2, State: 'Planned' as const, StartedAt: null }
    sprintsDoProjeto([planejada], [SPRINT_1])
    dublê.iniciar.mockImplementation(async () => {
      sprintsDoProjeto([SPRINT_2], [SPRINT_1])
      return SPRINT_2
    })
    montar('quadro')

    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar a Sprint 2' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Iniciar Sprint 2' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Iniciar' }))
    await waitFor(() =>
      expect(dublê.iniciar).toHaveBeenCalledWith(
        'p-1',
        'sp-2',
        expect.objectContaining({
          StartsOn: '2026-10-08',
          EndsOn: '2026-10-28',
          Today: '2026-10-08',
        }),
      ),
    )
    await semDialogo()

    // Iniciada, a tela rele as sprints: o quadro volta, com a barra, a busca e os filtros.
    await quadroPronto()
    expect(screen.getByRole('searchbox', { name: 'Buscar cards' })).toBeTruthy()
    expect(
      dublê.listar.mock.calls.some(
        ([, , estado, , opcoes]) => estado === 'e-1' && opcoes?.sprint === 'active',
      ),
    ).toBe(true)
  })

  it('"Ir para o Backlog" troca para a aba Backlog', async () => {
    sprintsDoProjeto([], [SPRINT_1])
    montar('quadro')

    // Sem nenhuma planejada, so o Backlog: e la que se cria a primeira.
    expect(
      await screen.findByText(
        'Nenhuma sprint em andamento. O quadro mostra só a sprint em andamento: os cards em trabalho estão no Backlog. Lá, crie a primeira sprint, leve para ela os cards desta semana e inicie.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Iniciar a/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ir para o Backlog' }))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Backlog' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    )
    expect(await screen.findByRole('list', { name: 'Cards do backlog' })).toBeTruthy()
    expect(window.localStorage.getItem('pds.web.trabalho.vista.p-1')).toBe('backlog')
  })

  it('as sprints que nao carregaram: o quadro diz, sem carregar para sempre, e "Tentar de novo" rele', async () => {
    let falhar = true
    dublê.listarSprints.mockImplementation(async () => {
      if (falhar) throw new PanelError('Erro interno.', 500)
      return [SPRINT_2, SPRINT_3]
    })
    montar('quadro')

    expect(
      await screen.findByText(
        'Não deu para carregar as sprints agora. Nada se perdeu: a falha foi ao consultar.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('searchbox', { name: 'Buscar cards' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'A fazer' })).toBeNull()

    falhar = false
    const leituras = dublê.listarSprints.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await quadroPronto()
    expect(dublê.listarSprints.mock.calls.length).toBeGreaterThan(leituras)
    expect(screen.queryByText(/Não deu para carregar as sprints/)).toBeNull()
  })

  it('as sprints que nao carregaram: o Backlog diz, e "Tentar de novo" rele', async () => {
    let falhar = true
    dublê.listarSprints.mockImplementation(async () => {
      if (falhar) throw new PanelError('Erro interno.', 500)
      return [SPRINT_2, SPRINT_3]
    })
    montar('backlog')

    expect(
      await screen.findByText(
        'Não deu para carregar as sprints agora. Nada se perdeu: a falha foi ao consultar.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Cards do backlog' })).toBeNull()

    falhar = false
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('list', { name: 'Cards do backlog' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Cards de Sprint 2' })).toBeTruthy()
    expect(screen.queryByText(/Não deu para carregar as sprints/)).toBeNull()
  })

  it('concluir pela barra do quadro: o aviso oferece "Iniciar a Sprint 3", que abre o dialogo de iniciar', async () => {
    dublê.concluir.mockImplementation(async () => {
      sprintsDoProjeto([SPRINT_3], [SPRINT_2_CONCLUIDA, SPRINT_1])
      return { Sprint: SPRINT_2_CONCLUIDA, Moved: 2, Destination: SPRINT_3 }
    })
    montar('quadro')
    await quadroPronto()

    const barra = screen.getByRole('region', { name: 'Sprint em andamento: Sprint 2' })
    fireEvent.click(within(barra).getByRole('button', { name: 'Concluir sprint' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Concluir Sprint 2' })
    // As planejadas vem da tela: o destino de saida e a primeira delas.
    expect(
      within(dialogo).getByRole('combobox', { name: 'Os 2 que não terminaram vão para' })
        .textContent,
    ).toBe('Sprint 3')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Concluir sprint' }))
    await waitFor(() =>
      expect(dublê.concluir).toHaveBeenCalledWith(
        'p-1',
        'sp-2',
        expect.objectContaining({ Destination: 'Sprint', SprintPublicId: 'sp-3' }),
      ),
    )
    await semDialogo()

    // Concluida, a tela rele as sprints: o quadro fica sem sprint em andamento.
    expect(await screen.findByText(/^Nenhuma sprint em andamento\./)).toBeTruthy()
    const concluida = await aviso('Sprint 2 concluída. 2 cards foram para a Sprint 3.')
    fireEvent.click(within(concluida).getByRole('button', { name: 'Iniciar a Sprint 3' }))
    expect(await screen.findByRole('dialog', { name: 'Iniciar Sprint 3' })).toBeTruthy()
  })
})
