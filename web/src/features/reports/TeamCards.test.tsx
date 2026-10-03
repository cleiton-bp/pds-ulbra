// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: o card do time e o arquivar, na tela de Trabalho.
 *
 * - **O card do time nao tem lado de fora.** Sem protocolo na linha, sem caixa
 *   para quem relatou, e mover para a coluna que encerra nao pergunta motivo — nao
 *   ha quem leia.
 * - **Arquivar um relato aberto leva o motivo a quem relatou.** O desfecho e o
 *   motivo viajam no mesmo pedido; e o arquivado nao se move nem escreve para fora.
 * - **A lista acompanha.** O card criado entra no topo; o arquivado sai.
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
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
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
    },
    projectReportAttachmentService: { listAttachments: dublê.anexos },
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
    dublê.listar.mockResolvedValue({
      reports: [cardDoTime('t-1', 'Trocar o provedor de e-mail'), relato('r-1', 'o botao some')],
      total: 2,
    })
  })

  it('a linha do card do time tem numero e titulo, e nada de protocolo', async () => {
    montar()

    const linha = (await screen.findByText('Trocar o provedor de e-mail')).closest(
      'a',
    ) as HTMLElement
    expect(within(linha).getByText('#7')).toBeTruthy()
    expect(within(linha).getByText('Do time')).toBeTruthy()
    expect(within(linha).queryByText(/ABCD/)).toBeNull()

    // O relato continua mostrando o protocolo de quem relatou, junto do numero.
    const doRelato = screen.getByText('o botao some').closest('a') as HTMLElement
    expect(within(doRelato).getByText('#3')).toBeTruthy()
    expect(within(doRelato).getByText('ABCD-EFGH')).toBeTruthy()
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
    const itens = await screen.findAllByRole('listitem')
    expect(
      within(itens[0] as HTMLElement).getByText('Revisar o texto da página de ajuda'),
    ).toBeTruthy()
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

    await waitFor(() =>
      expect(dublê.editar).toHaveBeenCalledWith('p-1', 't-1', {
        Title: 'Trocar o provedor antes de sexta',
        Description: 'texto novo',
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
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Análise')
    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r-1', { StatePublicId: 's-1' }),
    )
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
