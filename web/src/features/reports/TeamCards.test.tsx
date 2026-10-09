// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectViewModel,
  ReportClosureViewModel,
  ReportDetailViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
} from '@/contracts'
import { ReportDetailRoute } from '@/features/reports/ReportDetailRoute'
import { ReportsScreen } from '@/features/reports/ReportsScreen'
import { useToastStore } from '@/shared/components/toastStore'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: o card do time e o arquivar, na tela de Trabalho.
 *
 * - **O card do time nao tem lado de fora.** Sem protocolo, sem caixa
 *   para quem relatou, e mover para a coluna que encerra nao pergunta motivo — nao
 *   ha quem leia.
 * - **Arquivar um relato aberto leva o motivo a quem relatou.** O desfecho e o
 *   motivo viajam no mesmo pedido; e o arquivado nao se move nem escreve para fora.
 * - **A lista acompanha.** O card criado entra no topo; o arquivado sai.
 * - **O card novo nasce com o responsavel e a prioridade num pedido so** (decisao 83):
 *   escolhidos no dialogo, vao no proprio `createTeamCard`, e nenhuma chamada sai
 *   depois de criar. Recusada a escolha, o card nao nasce: o erro fica no formulario.
 *   Sem escolha, o pedido e o de antes. O aviso diz o numero e oferece "Abrir".
 * - **Pelo teclado, o card nasce uma vez so** (L-06): Enter no titulo cria; Ctrl+Enter
 *   (⌘+Enter no Mac) cria de qualquer campo, inclusive da descricao, onde o Enter
 *   sozinho quebra a linha. Dois Enter com a criacao no ar, ou o Ctrl+Enter no titulo
 *   (que passa pelo Enter do campo e pelo atalho do dialogo), criam um card so.
 * - **Sem as sprints, o dialogo nao pergunta onde o card entra** (nem "Entra em" nem
 *   sprint no pedido). Com elas, a tela inteira: `ReportsScreen.sprints.test.tsx`.
 * - **Tirar um relato encerrado da coluna que encerra pergunta antes** (decisao 81): a
 *   API o reabre, e quem relatou deixa de ver o encerramento.
 *
 * A regra de verdade mora na API; aqui entra o que a tela faz com a resposta.
 */
const dublê = vi.hoisted(() => ({
  listar: vi.fn(),
  contar: vi.fn(),
  abrir: vi.fn(),
  mover: vi.fn(),
  criar: vi.fn(),
  editar: vi.fn(),
  arquivar: vi.fn(),
  comentarios: vi.fn(),
  historico: vi.fn(),
  anexos: vi.fn(),
  responsavel: vi.fn(),
  prioridade: vi.fn(),
  time: vi.fn(),
  prioridades: vi.fn(),
  ciclo: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    // Sem conexao em tempo real de verdade nos testes: ela tentaria a rede.
    realtimeService: { connectWork: () => ({ stop: async () => {} }) },
    projectReportService: {
      listReports: dublê.listar,
      listReportCounts: dublê.contar,
      openReport: dublê.abrir,
      moveReport: dublê.mover,
      createTeamCard: dublê.criar,
      editTeamCard: dublê.editar,
      setArchived: dublê.arquivar,
      listComments: dublê.comentarios,
      listReportHistory: dublê.historico,
      addInternalComment: vi.fn(),
      addPublicComment: vi.fn(),
      closeReport: vi.fn(),
      askInfo: vi.fn(),
      // Os vinculos do card aberto: nenhum, nestes testes.
      listLinks: vi.fn().mockResolvedValue([]),
      setAssignee: dublê.responsavel,
      setPriority: dublê.prioridade,
    },
    projectReportAttachmentService: { listAttachments: dublê.anexos },
    projectTeamService: { listMembers: dublê.time },
    projectPriorityService: { listPriorities: dublê.prioridades },
    // As regras do Ciclo, com as sprints desligadas: sem isto a tela pedia a regra a
    // API de verdade, e as sprints ficavam desligadas so porque a leitura falhava.
    projectCycleSettingsService: { getCycleSettings: dublê.ciclo },
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
  render(<RouterProvider router={router} />)
  return router
}

function coluna(
  id: string,
  nome: string,
  total: number,
  encerra = false,
): ReportStateCountViewModel {
  return { StatePublicId: id, StateName: nome, IsActive: true, ClosesReport: encerra, Total: total }
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

function relato(
  publicId: string,
  texto: string,
  extra: Partial<ReportSummaryViewModel> = {},
): ReportSummaryViewModel {
  return {
    ...cardDoTime(publicId, ''),
    Kind: 'Report',
    Number: 3,
    Title: null,
    ReporterTitle: null,
    TrackingCode: 'ABCD-EFGH',
    Type: 'Bug',
    Text: texto,
    Route: '/checkout',
    AcceptsQuestions: true,
    ...extra,
  }
}

function aberto(
  resumo: ReportSummaryViewModel,
  extra: Partial<ReportDetailViewModel> = {},
): ReportDetailViewModel {
  return {
    ...resumo,
    Description: null,
    CreatedByName: resumo.Kind === 'Team' ? 'Ana' : null,
    CanArchive: true,
    ArchiveCloses: resumo.Kind === 'Report',
    Closure: null,
    InfoRequest: null,
    CanAskInfo: false,
    ModerationState: 'Pending',
    Contexts: [],
    Reopenings: [],
    ...extra,
  }
}

/** Uma promessa que so resolve quando o teste mandar: a criacao no ar. */
function emVoo<T>() {
  let resolver: (value: T) => void = () => {}
  const promessa = new Promise<T>((resolve) => {
    resolver = resolve
  })
  return { promessa, resolver: (value: T) => resolver(value) }
}

/** O encerramento que quem relatou ainda nao confirmou. */
function encerramento(motivo: string): ReportClosureViewModel {
  return {
    Outcome: 'Done',
    Reason: motivo,
    ClosedAt: '2026-10-02T12:30:00.000Z',
    ClosedByName: 'Ana',
    ConfirmedAt: null,
    Satisfaction: null,
    SatisfactionDeclined: false,
  }
}

instalarRemendosDoRadix()

describe('card do time e arquivar', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.contar.mockResolvedValue([coluna('s-1', 'Análise', 1), coluna('s-2', 'Pronto', 0, true)])
    dublê.comentarios.mockResolvedValue({ Internal: [], Public: [] })
    dublê.historico.mockResolvedValue([])
    dublê.anexos.mockResolvedValue([])
    dublê.time.mockResolvedValue([])
    dublê.prioridades.mockResolvedValue([])
    dublê.ciclo.mockResolvedValue({
      LastColumnVisibleDays: 14,
      DueSoonDays: 2,
      SprintsEnabled: false,
      SprintLengthWeeks: 2,
    })
    useToastStore.setState({ toasts: [] })
    dublê.listar.mockResolvedValue({
      reports: [cardDoTime('t-1', 'Trocar o provedor de e-mail'), relato('r-1', 'o botao some')],
      total: 2,
    })
  })

  it('a linha do card do time tem numero, tipo e titulo; o protocolo de um relato fica no card aberto', async () => {
    montar()

    const linha = (await screen.findByText('Trocar o provedor de e-mail')).closest(
      'tr',
    ) as HTMLElement
    expect(within(linha).getByText('#7')).toBeTruthy()
    expect(within(linha).getByText('Do time')).toBeTruthy()
    expect(within(linha).queryByText(/ABCD/)).toBeNull()

    // O relato tem numero e tipo na linha; o protocolo de quem relatou, nao — a
    // linha e para comparar card com card. Sem titulo, o texto vem entre aspas: e a
    // fala de quem relatou.
    const doRelato = screen.getByText('“o botao some”').closest('tr') as HTMLElement
    expect(within(doRelato).getByText('#3')).toBeTruthy()
    expect(within(doRelato).getByText('Defeito')).toBeTruthy()
    expect(within(doRelato).queryByText('ABCD-EFGH')).toBeNull()
  })

  it('novo card leva titulo, descricao e coluna, e entra no topo da lista', async () => {
    dublê.criar.mockImplementation(async (_: string, pedido: { Title: string }) =>
      aberto(
        cardDoTime('t-2', pedido.Title, { Number: 8, StatePublicId: 's-2', StateName: 'Pronto' }),
      ),
    )
    montar()
    await screen.findByText('Trocar o provedor de e-mail')

    fireEvent.click(screen.getByRole('button', { name: 'Novo card' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'Título' }), {
      target: { value: '  Revisar o texto da página de ajuda  ' },
    })
    // Com as sprints desligadas no Ciclo, nao ha onde escolher a sprint — e o pedido
    // abaixo nao leva nenhuma.
    expect(dublê.ciclo).toHaveBeenCalledWith('p-1')
    expect(screen.queryByRole('combobox', { name: 'Entra em' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'Descrição' }), {
      target: { value: 'Ver **antes** do lançamento' },
    })
    await escolherNoSelect(screen, fireEvent, 'Coluna', 'Pronto')
    fireEvent.click(screen.getByRole('button', { name: 'Criar card' }))

    await waitFor(() =>
      expect(dublê.criar).toHaveBeenCalledWith('p-1', {
        Title: 'Revisar o texto da página de ajuda',
        Description: 'Ver **antes** do lançamento',
        StatePublicId: 's-2',
      }),
    )
    // A primeira linha e a do cabecalho; a seguinte e a do card que acabou de nascer.
    const linhas = await screen.findAllByRole('row')
    expect(
      within(linhas[1] as HTMLElement).getByText('Revisar o texto da página de ajuda'),
    ).toBeTruthy()
    // Sem responsavel nem prioridade escolhidos, nada sai depois de criar.
    expect(dublê.responsavel).not.toHaveBeenCalled()
    expect(dublê.prioridade).not.toHaveBeenCalled()
    // O aviso diz o numero e abre o card.
    const aviso = useToastStore.getState().toasts.at(-1)
    expect(aviso?.message).toBe('#8 criado.')
    expect(aviso?.action?.label).toBe('Abrir')
  })

  it('o card novo nasce com o responsavel e a prioridade no mesmo pedido, e nada sai depois', async () => {
    dublê.time.mockResolvedValue([
      {
        UserPublicId: 'u-bruno',
        Name: 'Bruno',
        Email: null,
        AvatarUrl: null,
        Role: 'Member',
        IsAccountOwner: false,
        IsYou: false,
        JoinedAt: null,
      },
      {
        UserPublicId: 'u-ana',
        Name: 'Ana',
        Email: null,
        AvatarUrl: null,
        Role: 'Administrator',
        IsAccountOwner: true,
        IsYou: true,
        JoinedAt: null,
      },
    ])
    dublê.prioridades.mockResolvedValue([
      {
        PublicId: 'pr-b',
        Name: 'Baixa',
        Color: 'Gray',
        Position: 0,
        IsActive: true,
        CreatedAt: '',
      },
      {
        PublicId: 'pr-a',
        Name: 'Alta',
        Color: 'Orange',
        Position: 2,
        IsActive: true,
        CreatedAt: '',
      },
      {
        PublicId: 'pr-v',
        Name: 'Velha',
        Color: 'Red',
        Position: 1,
        IsActive: false,
        CreatedAt: '',
      },
    ])
    dublê.criar.mockImplementation(async (_: string, pedido: { Title: string }) =>
      aberto(cardDoTime('t-2', pedido.Title, { Number: 8 })),
    )
    montar()
    await screen.findByText('Trocar o provedor de e-mail')

    fireEvent.click(screen.getByRole('button', { name: 'Novo card' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'Título' }), {
      target: { value: 'Revisar a ajuda' },
    })
    // Quem olha primeiro, com "(voce)"; a mais urgente em cima, "Sem prioridade" por
    // ultimo, e a desativada fora.
    fireEvent.pointerDown(await screen.findByRole('combobox', { name: 'Responsável' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    expect((await screen.findAllByRole('option')).map((opcao) => opcao.textContent)).toEqual([
      'Sem responsável',
      'Ana (você)',
      'Bruno',
    ])
    fireEvent.click(screen.getByRole('option', { name: 'Bruno' }))
    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Prioridade' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    expect((await screen.findAllByRole('option')).map((opcao) => opcao.textContent)).toEqual([
      'Alta',
      'Baixa',
      'Sem prioridade',
    ])
    fireEvent.click(screen.getByRole('option', { name: 'Alta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar card' }))

    await waitFor(() =>
      expect(dublê.criar).toHaveBeenCalledWith('p-1', {
        Title: 'Revisar a ajuda',
        Description: null,
        StatePublicId: 's-1',
        AssigneeUserPublicId: 'u-bruno',
        PriorityPublicId: 'pr-a',
      }),
    )
    expect(dublê.criar).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo card' })).toBeNull())
    expect(dublê.responsavel).not.toHaveBeenCalled()
    expect(dublê.prioridade).not.toHaveBeenCalled()
  })

  it('recusada a escolha, o card nao nasce: o erro fica no formulario, e trocar a escolha cria', async () => {
    dublê.time.mockResolvedValue([
      {
        UserPublicId: 'u-bruno',
        Name: 'Bruno',
        Email: null,
        AvatarUrl: null,
        Role: 'Member',
        IsAccountOwner: false,
        IsYou: false,
        JoinedAt: null,
      },
    ])
    const { PanelError } = await import('@/data/errors')
    dublê.criar
      .mockRejectedValueOnce(new PanelError('Esta pessoa não está no time do projeto.', 400))
      .mockImplementation(async (_: string, pedido: { Title: string }) =>
        aberto(cardDoTime('t-2', pedido.Title, { Number: 8 })),
      )
    montar()
    await screen.findByText('Trocar o provedor de e-mail')

    fireEvent.click(screen.getByRole('button', { name: 'Novo card' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'Título' }), {
      target: { value: 'Revisar a ajuda' },
    })
    await escolherNoSelect(screen, fireEvent, 'Responsável', 'Bruno')
    fireEvent.click(screen.getByRole('button', { name: 'Criar card' }))

    // O dialogo fica, com o erro e o que se escreveu; a lista nao ganha card.
    expect(await screen.findByText('Esta pessoa não está no time do projeto.')).toBeTruthy()
    const dialogo = screen.getByRole('dialog', { name: 'Novo card' })
    expect(within(dialogo).getByRole('textbox', { name: 'Título' })).toHaveProperty(
      'value',
      'Revisar a ajuda',
    )
    // Com o dialogo aberto, o Radix esconde o resto da pagina do leitor de tela: a busca
    // por linha precisa do `hidden`, senao nunca acharia linha nenhuma — a que ja
    // estava na lista prova que ela enxerga atras do dialogo.
    expect(
      screen.getByRole('row', { name: /Trocar o provedor de e-mail/, hidden: true }),
    ).toBeTruthy()
    expect(screen.queryByRole('row', { name: /Revisar a ajuda/, hidden: true })).toBeNull()
    expect(dublê.responsavel).not.toHaveBeenCalled()

    // Sem responsavel, o pedido e o de antes, e cria.
    await escolherNoSelect(screen, fireEvent, 'Responsável', 'Sem responsável')
    fireEvent.click(screen.getByRole('button', { name: 'Criar card' }))
    await waitFor(() => expect(dublê.criar).toHaveBeenCalledTimes(2))
    expect(dublê.criar).toHaveBeenLastCalledWith('p-1', {
      Title: 'Revisar a ajuda',
      Description: null,
      StatePublicId: 's-1',
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo card' })).toBeNull())
    // Criado, agora sim ele entra na lista.
    expect(await screen.findByRole('row', { name: /Revisar a ajuda/ })).toBeTruthy()
  })

  it('Enter no titulo cria, e uma vez so: o segundo Enter com a criacao no ar nao cria outro', async () => {
    const criacao = emVoo<ReportDetailViewModel>()
    dublê.criar.mockReturnValue(criacao.promessa)
    montar()
    await screen.findByText('Trocar o provedor de e-mail')

    fireEvent.click(screen.getByRole('button', { name: 'Novo card' }))
    const titulo = await screen.findByRole('textbox', { name: 'Título' })
    fireEvent.change(titulo, { target: { value: 'Revisar a ajuda' } })
    fireEvent.keyDown(titulo, { key: 'Enter' })
    fireEvent.keyDown(titulo, { key: 'Enter' })

    expect(dublê.criar).toHaveBeenCalledTimes(1)
    expect(dublê.criar).toHaveBeenCalledWith('p-1', {
      Title: 'Revisar a ajuda',
      Description: null,
      StatePublicId: 's-1',
    })
    expect(screen.getByRole('button', { name: 'Criando…' })).toHaveProperty('disabled', true)

    await act(async () =>
      criacao.resolver(aberto(cardDoTime('t-2', 'Revisar a ajuda', { Number: 8 }))),
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo card' })).toBeNull())
    expect(dublê.criar).toHaveBeenCalledTimes(1)
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe('#8 criado.')
  })

  it('Ctrl+Enter no titulo passa pelo Enter do campo e pelo atalho do dialogo, e cria um card so', async () => {
    dublê.criar.mockImplementation(async (_: string, pedido: { Title: string }) =>
      aberto(cardDoTime('t-2', pedido.Title, { Number: 8 })),
    )
    montar()
    await screen.findByText('Trocar o provedor de e-mail')

    fireEvent.click(screen.getByRole('button', { name: 'Novo card' }))
    const titulo = await screen.findByRole('textbox', { name: 'Título' })
    fireEvent.change(titulo, { target: { value: 'Revisar a ajuda' } })
    fireEvent.keyDown(titulo, { key: 'Enter', ctrlKey: true })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo card' })).toBeNull())
    expect(dublê.criar).toHaveBeenCalledTimes(1)
  })

  it('na descricao, Enter sozinho quebra a linha; Ctrl+Enter e ⌘+Enter criam de la', async () => {
    dublê.criar.mockImplementation(async (_: string, pedido: { Title: string }) =>
      aberto(cardDoTime('t-2', pedido.Title, { Number: 8 })),
    )
    montar()
    await screen.findByText('Trocar o provedor de e-mail')

    /** Abre o "Novo card", escreve titulo e descricao, e aperta a tecla na descricao. */
    const criarPelaDescricao = async (tecla: { ctrlKey?: boolean; metaKey?: boolean }) => {
      fireEvent.click(screen.getByRole('button', { name: 'Novo card' }))
      fireEvent.change(await screen.findByRole('textbox', { name: 'Título' }), {
        target: { value: 'Revisar a ajuda' },
      })
      const descricao = screen.getByRole('textbox', { name: 'Descrição' })
      fireEvent.change(descricao, { target: { value: 'Ver antes do lançamento' } })
      const chamadas = dublê.criar.mock.calls.length

      // O Enter sozinho nao cria, e ninguem o segura: a quebra de linha acontece.
      expect(fireEvent.keyDown(descricao, { key: 'Enter' })).toBe(true)
      expect(dublê.criar).toHaveBeenCalledTimes(chamadas)
      expect(screen.getByRole('dialog', { name: 'Novo card' })).toBeTruthy()

      fireEvent.keyDown(descricao, { key: 'Enter', ...tecla })
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo card' })).toBeNull())
      expect(dublê.criar).toHaveBeenCalledTimes(chamadas + 1)
      expect(dublê.criar).toHaveBeenLastCalledWith('p-1', {
        Title: 'Revisar a ajuda',
        Description: 'Ver antes do lançamento',
        StatePublicId: 's-1',
      })
    }

    await criarPelaDescricao({ ctrlKey: true })
    // ⌘+Enter, no Mac.
    await criarPelaDescricao({ metaKey: true })
  })

  it('aberto, o card do time mostra a descricao formatada e nada do lado de fora', async () => {
    dublê.abrir.mockResolvedValue(
      aberto(cardDoTime('t-1', 'Trocar o provedor de e-mail'), {
        Description: 'Hoje sai pelo **plano grátis**.\n\n- verificar o domínio',
      }),
    )
    montar('/p/p-1/t-1')

    const negrito = await screen.findByText('plano grátis')
    expect(negrito.tagName).toBe('STRONG')
    expect(screen.getByText('verificar o domínio').tagName).toBe('LI')
    expect(screen.queryByText('Para quem relatou')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copiar protocolo' })).toBeNull()
    expect(screen.getByText('Entre o time')).toBeTruthy()
  })

  it('mover o card do time para a coluna que encerra nao pergunta motivo', async () => {
    dublê.abrir.mockResolvedValue(aberto(cardDoTime('t-1', 'Trocar o provedor de e-mail')))
    dublê.mover.mockResolvedValue(
      cardDoTime('t-1', 'Trocar o provedor de e-mail', {
        StatePublicId: 's-2',
        StateName: 'Pronto',
      }),
    )
    montar('/p/p-1/t-1')

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')

    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 't-1', { StatePublicId: 's-2' }),
    )
    expect(screen.queryByText('Encerrar o relato')).toBeNull()
  })

  it('editar grava titulo e descricao, e a tela passa a mostrar o novo', async () => {
    const card = cardDoTime('t-1', 'Trocar o provedor de e-mail')
    dublê.abrir.mockResolvedValue(aberto(card, { Description: 'texto velho' }))
    dublê.editar.mockImplementation(
      async (_: string, __: string, pedido: { Title: string; Description: string | null }) =>
        aberto({ ...card, Title: pedido.Title }, { Description: pedido.Description }),
    )
    montar('/p/p-1/t-1')

    await screen.findByText('texto velho')
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), {
      target: { value: 'Trocar o provedor antes de sexta' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Descrição' }), {
      target: { value: 'texto novo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    // Com o que a tela tinha como base: a API recusa (409) se outra pessoa salvou no meio.
    await waitFor(() =>
      expect(dublê.editar).toHaveBeenCalledWith('p-1', 't-1', {
        Title: 'Trocar o provedor antes de sexta',
        Description: 'texto novo',
        Base: { Title: 'Trocar o provedor de e-mail', Description: 'texto velho' },
      }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Trocar o provedor antes de sexta' }),
    ).toBeTruthy()
    expect(screen.getByText('texto novo')).toBeTruthy()
  })

  it('arquivar o card do time pede confirmacao, e ele sai da lista', async () => {
    const card = cardDoTime('t-1', 'Trocar o provedor de e-mail')
    dublê.abrir.mockResolvedValue(aberto(card))
    dublê.arquivar.mockResolvedValue(aberto({ ...card, ArchivedAt: '2026-10-02T13:00:00.000Z' }))
    const router = montar('/p/p-1/t-1')

    fireEvent.click(await screen.findByRole('button', { name: 'Arquivar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Arquivar' }))

    await waitFor(() =>
      expect(dublê.arquivar).toHaveBeenCalledWith('p-1', 't-1', { Archived: true }),
    )
    // Arquivado: a etiqueta no lugar do seletor, e o card sai da lista de trabalho.
    expect(await screen.findByText('Arquivado')).toBeTruthy()
    router.navigate('/p/p-1')
    await waitFor(() => expect(screen.queryByText('Trocar o provedor de e-mail')).toBeNull())
  })

  it('relato aberto: arquivar pede desfecho e motivo, e os dois viajam juntos', async () => {
    const resumo = relato('r-1', 'o botao some')
    dublê.abrir.mockResolvedValue(aberto(resumo))
    dublê.arquivar.mockResolvedValue(aberto({ ...resumo, ArchivedAt: '2026-10-02T13:00:00.000Z' }))
    montar('/p/p-1/r-1')

    fireEvent.click(await screen.findByRole('button', { name: 'Arquivar relato' }))
    expect(await screen.findByText('Arquivar o relato')).toBeTruthy()

    // Sem motivo, nao arquiva: e o que quem relatou vai ler.
    const confirmar = screen.getAllByRole('button', { name: 'Arquivar' }).at(-1) as HTMLElement
    expect(confirmar.hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByRole('textbox', { name: 'Por que acabou' }), {
      target: { value: 'Saiu do plano do produto.' },
    })
    fireEvent.click(confirmar)

    await waitFor(() =>
      expect(dublê.arquivar).toHaveBeenCalledWith('p-1', 'r-1', {
        Archived: true,
        Outcome: 'Done',
        Reason: 'Saiu do plano do produto.',
      }),
    )
  })

  it('encerrado pelo movimento, o relato arquiva sem pedir o motivo de novo', async () => {
    const resumo = relato('r-1', 'o botao some')
    dublê.abrir.mockResolvedValue(aberto(resumo))
    dublê.mover.mockResolvedValue({ ...resumo, StatePublicId: 's-2', StateName: 'Pronto' })
    dublê.arquivar.mockResolvedValue(
      aberto({ ...resumo, ArchivedAt: '2026-10-02T13:00:00.000Z' }, { ArchiveCloses: false }),
    )
    montar('/p/p-1/r-1')

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')
    fireEvent.change(await screen.findByRole('textbox', { name: 'Por que acabou' }), {
      target: { value: 'Corrigido nesta versão.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }))
    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r-1', {
        StatePublicId: 's-2',
        Outcome: 'Done',
        Reason: 'Corrigido nesta versão.',
      }),
    )
    await waitFor(() => expect(screen.queryByText('Encerrar o relato')).toBeNull())

    // O detalhe da abertura dizia que arquivar encerrava; o movimento ja encerrou.
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar relato' }))
    expect(await screen.findByText('Arquivar #3')).toBeTruthy()
    expect(screen.queryByText('Arquivar o relato')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Arquivar' }).at(-1) as HTMLElement)
    await waitFor(() =>
      expect(dublê.arquivar).toHaveBeenCalledWith('p-1', 'r-1', { Archived: true }),
    )
  })

  it('tirado da coluna que encerra, o relato volta a pedir o motivo para arquivar', async () => {
    const resumo = relato('r-1', 'o botao some', { StatePublicId: 's-2', StateName: 'Pronto' })
    dublê.abrir.mockResolvedValue(
      aberto(resumo, { ArchiveCloses: false, Closure: encerramento('Corrigido nesta versão.') }),
    )
    dublê.mover.mockResolvedValue({ ...resumo, StatePublicId: 's-1', StateName: 'Análise' })
    montar('/p/p-1/r-1')

    await screen.findByText('Corrigido nesta versão.')
    // Tirar de "Pronto" reabre o relato: pergunta antes, e cancelar nao move.
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Análise')
    const pergunta = await screen.findByRole('alertdialog', { name: 'Reabrir o relato #3?' })
    expect(within(pergunta).getByText(/Tirar o #3 de Pronto reabre o relato/)).toBeTruthy()
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog', { name: 'Reabrir o relato #3?' })).toBeNull(),
    )
    expect(dublê.mover).not.toHaveBeenCalled()
    expect(screen.getByText('Corrigido nesta versão.')).toBeTruthy()

    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Análise')
    fireEvent.click(
      within(await screen.findByRole('alertdialog', { name: 'Reabrir o relato #3?' })).getByRole(
        'button',
        { name: 'Reabrir e mover' },
      ),
    )
    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r-1', { StatePublicId: 's-1' }),
    )
    expect(dublê.mover).toHaveBeenCalledTimes(1)
    // A API desfez o encerramento que quem relatou nao confirmou; a tela acompanha.
    await waitFor(() => expect(screen.queryByText('Corrigido nesta versão.')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Arquivar relato' }))
    expect(await screen.findByText('Arquivar o relato')).toBeTruthy()
  })

  it('com um encerramento valendo, ir para a coluna que encerra so move', async () => {
    const resumo = relato('r-1', 'o botao some')
    dublê.abrir.mockResolvedValue(
      aberto(resumo, { ArchiveCloses: false, Closure: encerramento('Vamos rever no fim do mês.') }),
    )
    dublê.mover.mockResolvedValue({ ...resumo, StatePublicId: 's-2', StateName: 'Pronto' })
    montar('/p/p-1/r-1')

    await screen.findByText('Vamos rever no fim do mês.')
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')
    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r-1', { StatePublicId: 's-2' }),
    )
    expect(screen.queryByText('Encerrar o relato')).toBeNull()
    expect(screen.getByText('Vamos rever no fim do mês.')).toBeTruthy()
  })

  it('relato arquivado: nao move, nao escreve para fora, e oferece desarquivar', async () => {
    const resumo = relato('r-1', 'o botao some', { ArchivedAt: '2026-10-02T13:00:00.000Z' })
    dublê.abrir.mockResolvedValue(aberto(resumo, { CanArchive: false }))
    dublê.arquivar.mockResolvedValue(aberto({ ...resumo, ArchivedAt: null }))
    montar('/p/p-1/r-1')

    await screen.findByRole('button', { name: 'Desarquivar' })
    expect(screen.queryByRole('combobox', { name: 'Mover para a coluna' })).toBeNull()
    expect(screen.getByText(/O relato está arquivado/)).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Para quem relatou' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Desarquivar' }))
    await waitFor(() =>
      expect(dublê.arquivar).toHaveBeenCalledWith('p-1', 'r-1', { Archived: false }),
    )
  })

  it('sem a regra do ciclo, o relato nao oferece arquivar', async () => {
    dublê.abrir.mockResolvedValue(aberto(relato('r-1', 'o botao some'), { CanArchive: false }))
    montar('/p/p-1/r-1')

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    expect(screen.queryByRole('button', { name: 'Arquivar relato' })).toBeNull()
  })

  it('o filtro Arquivados troca a lista pelos arquivados', async () => {
    montar()
    await screen.findByText('Trocar o provedor de e-mail')

    fireEvent.click(screen.getByRole('button', { name: 'Arquivados' }))

    await waitFor(() => expect(dublê.listar).toHaveBeenLastCalledWith('p-1', 1, null, true))
    expect(screen.getByRole('heading', { name: 'Arquivados', level: 1 })).toBeTruthy()
  })
})
