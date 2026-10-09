// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ReportClosureViewModel,
  ReportDetailViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
} from '@/contracts'
import { PanelError } from '@/data'
import { ReportDialog } from '@/features/reports/ReportDialog'
import { Toaster } from '@/shared/components/Toaster'
import { useToastStore } from '@/shared/components/toastStore'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: o relato aberto — as saidas, o que quem relatou ve, e o
 * que se escreve nele.
 *
 * - **"Encerrar relato…" e "Pedir informacao" em qualquer coluna**, lado a lado.
 *   Encerrar fora da coluna que encerra move para ela, pelo dialogo do motivo; ja nela,
 *   ou sem coluna que encerra, encerra sem mover. A pergunta do pedido aparece na hora,
 *   na caixa de quem relatou e em "Pergunta: …"; o pedido que falha fica com o texto.
 *   Arquivado ou ja encerrado, nao ha o que oferecer.
 * - **Tirar da coluna que encerra pergunta antes** de reabrir o encerramento que quem
 *   relatou ainda nao confirmou — "Cancelar" nao move nada.
 * - **O que quem relatou ve** fica junto do controle que move: o encerramento, a
 *   etapa, ou que a coluna nao muda nada (com o atalho so para quem configura).
 * - **O Esc tem camadas**: sai primeiro da edicao em que o foco esta (o titulo, a
 *   etiqueta digitada, o "Vincular", o campo de subtarefa); com texto mudado, pergunta.
 *   **Fechar ou trocar de card com texto por salvar pergunta**, e "Continuar
 *   escrevendo" devolve o foco a caixa do texto.
 * - **O aviso nasce dentro do card**, e fecha-lo nao fecha o card; o erro e `alert`.
 * - **Anterior, proximo e "Copiar link"** no alto, com J e K fora de campo — e nunca
 *   com uma pergunta ou uma lista aberta por cima; o foco ao abrir continua no X.
 * - **O link que nao abre diz o que houve**, e tenta de novo.
 * - **O relato sem titulo** tem o texto de quem relatou como manchete, e o titulo do
 *   dialogo diz que ele e de fora.
 *
 * A regra de verdade mora na API; aqui entra o que a tela faz com a resposta.
 */
const dublê = vi.hoisted(() => ({
  abrir: vi.fn(),
  reler: vi.fn(),
  mover: vi.fn(),
  encerrar: vi.fn(),
  pedir: vi.fn(),
  comentarios: vi.fn(),
  historico: vi.fn(),
  vinculos: vi.fn(),
  listar: vi.fn(),
  comentarInterno: vi.fn(),
  comentarPublico: vi.fn(),
  titulo: vi.fn(),
  prioridade: vi.fn(),
  membros: vi.fn(),
  prioridades: vi.fn(),
  etiquetas: vi.fn(),
  anexos: vi.fn(),
  copiar: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectReportService: {
      openReport: dublê.abrir,
      refreshReport: dublê.reler,
      moveReport: dublê.mover,
      closeReport: dublê.encerrar,
      askInfo: dublê.pedir,
      setArchived: vi.fn(),
      listComments: dublê.comentarios,
      listReportHistory: dublê.historico,
      listLinks: dublê.vinculos,
      listReports: dublê.listar,
      addInternalComment: dublê.comentarInterno,
      addPublicComment: dublê.comentarPublico,
      setTitle: dublê.titulo,
      setPriority: dublê.prioridade,
    },
    projectTeamService: { listMembers: dublê.membros },
    projectPriorityService: { listPriorities: dublê.prioridades },
    projectLabelService: { listLabels: dublê.etiquetas, addLabel: vi.fn() },
    projectReportAttachmentService: { listAttachments: dublê.anexos },
  }
})

vi.mock('@/shared/lib/clipboard', () => ({ copyText: dublê.copiar }))

instalarRemendosDoRadix()

const colunas: ReportStateCountViewModel[] = [
  { StatePublicId: 's-1', StateName: 'A fazer', IsActive: true, ClosesReport: false, Total: 1 },
  { StatePublicId: 's-2', StateName: 'Fazendo', IsActive: true, ClosesReport: false, Total: 0 },
  { StatePublicId: 's-3', StateName: 'Feito', IsActive: true, ClosesReport: true, Total: 0 },
]

function relato(extra: Partial<ReportSummaryViewModel> = {}): ReportSummaryViewModel {
  return {
    PublicId: 'r-1',
    Kind: 'Report',
    Number: 12,
    Title: null,
    ReporterTitle: null,
    TrackingCode: 'ABCD-EFGH',
    Type: 'Bug',
    Text: 'O botao de pagar nao responde.',
    Route: '/checkout',
    Origin: null,
    StatePublicId: 's-1',
    StateName: 'A fazer',
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

function aberto(
  resumo: ReportSummaryViewModel,
  extra: Partial<ReportDetailViewModel> = {},
): ReportDetailViewModel {
  return {
    ...resumo,
    Description: null,
    CreatedByName: null,
    CanArchive: false,
    ArchiveCloses: true,
    Closure: null,
    InfoRequest: null,
    CanAskInfo: false,
    ModerationState: 'Pending',
    Contexts: [],
    Reopenings: [],
    ...extra,
  }
}

function encerramento(extra: Partial<ReportClosureViewModel> = {}): ReportClosureViewModel {
  return {
    Outcome: 'Done',
    Reason: 'Trocamos o gateway.',
    ClosedAt: '2026-10-04T12:00:00.000Z',
    ClosedByName: 'Ana Dona',
    ConfirmedAt: null,
    Satisfaction: null,
    SatisfactionDeclined: false,
    ...extra,
  }
}

function montar(props: Partial<ComponentProps<typeof ReportDialog>> = {}) {
  const aoFechar = vi.fn()
  const aoMudar = vi.fn()
  const aoIrPara = vi.fn()
  render(
    <MemoryRouter>
      <ReportDialog
        projectPublicId="p-1"
        reportPublicId="r-1"
        resumo={relato()}
        colunas={colunas}
        aoMudar={aoMudar}
        aoFechar={aoFechar}
        aoIrPara={aoIrPara}
        {...props}
      />
      <Toaster />
    </MemoryRouter>,
  )
  return { aoFechar, aoMudar, aoIrPara }
}

/** O detalhe chegou: as saidas do relato so aparecem depois dele. */
async function detalheNaTela() {
  await screen.findByRole('button', { name: 'Encerrar relato…' })
}

/** Uma tecla no elemento em foco — o caminho do Esc de verdade ate o dialogo. */
function teclar(key: string, alvo: Element = document.activeElement ?? document.body) {
  fireEvent.keyDown(alvo, { key })
}

beforeEach(() => {
  for (const mock of Object.values(dublê)) mock.mockReset()
  dublê.abrir.mockResolvedValue(aberto(relato()))
  dublê.reler.mockResolvedValue(aberto(relato()))
  dublê.comentarios.mockResolvedValue({ Internal: [], Public: [] })
  dublê.historico.mockResolvedValue([])
  dublê.vinculos.mockResolvedValue([])
  dublê.anexos.mockResolvedValue([])
  dublê.membros.mockResolvedValue([])
  dublê.prioridades.mockResolvedValue([
    {
      PublicId: 'p-baixa',
      Name: 'Baixa',
      Color: 'Blue',
      Position: 0,
      IsActive: true,
      CreatedAt: '',
    },
  ])
  dublê.etiquetas.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  useToastStore.setState({ toasts: [], hosts: [] })
})

describe('as saidas do relato aberto', () => {
  it('em qualquer coluna, "Encerrar relato…" e "Pedir informacao" lado a lado; encerrar fora da coluna que encerra move para ela', async () => {
    dublê.abrir.mockResolvedValue(aberto(relato(), { CanAskInfo: true }))
    dublê.mover.mockImplementation(
      async (_p: string, _r: string, corpo: { StatePublicId: string }) =>
        relato({ StatePublicId: corpo.StatePublicId, StateName: 'Feito', Closed: true }),
    )
    montar()

    // O relato esta na primeira coluna — e as duas saidas ja estao la.
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar relato…' }))
    expect(screen.queryByRole('button', { name: 'Concluir relato' })).toBeNull()

    const dialogo = screen.getByRole('dialog', { name: 'Encerrar o relato' })
    expect(
      within(dialogo).getByText(
        'Mover para Feito encerra este relato. Quem escreveu vai ler o motivo na página de acompanhamento.',
      ),
    ).toBeTruthy()
    fireEvent.change(within(dialogo).getByLabelText('Por que acabou'), {
      target: { value: 'Trocamos o gateway.' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Encerrar' }))

    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r-1', {
        StatePublicId: 's-3',
        Outcome: 'Done',
        Reason: 'Trocamos o gateway.',
      }),
    )
    expect(dublê.encerrar).not.toHaveBeenCalled()
    // Encerrado, as saidas somem, e o lado de fora diz o que a pessoa le agora.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Encerrar relato…' })).toBeNull(),
    )
    expect(screen.getByRole('heading', { name: 'Encerrado' })).toBeTruthy()
    expect(screen.getByText('Encerrado · Foi feito')).toBeTruthy()
    expect(screen.queryByText('Esta coluna não muda o que quem relatou vê.')).toBeNull()
  })

  it('sem coluna que encerra, "Encerrar relato…" encerra sem mover', async () => {
    const semEncerrar = colunas.map((coluna) => ({ ...coluna, ClosesReport: false }))
    dublê.encerrar.mockResolvedValue(aberto(relato(), { Closure: encerramento() }))
    montar({ colunas: semEncerrar })

    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar relato…' }))
    const dialogo = screen.getByRole('dialog', { name: 'Encerrar o relato' })
    expect(within(dialogo).getByText(/continua na coluna em que está/)).toBeTruthy()
    fireEvent.change(within(dialogo).getByLabelText('Por que acabou'), {
      target: { value: 'Trocamos o gateway.' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Encerrar' }))

    await waitFor(() =>
      expect(dublê.encerrar).toHaveBeenCalledWith('p-1', 'r-1', {
        Outcome: 'Done',
        Reason: 'Trocamos o gateway.',
      }),
    )
    expect(dublê.mover).not.toHaveBeenCalled()
    expect(await screen.findByText('por Ana Dona')).toBeTruthy()
  })

  it('pedir informacao na primeira coluna: a pergunta aparece na hora, na caixa de quem relatou e em "Pergunta"', async () => {
    const pedidoEm = '2026-10-07T12:00:00.000Z'
    dublê.abrir.mockResolvedValue(aberto(relato(), { CanAskInfo: true }))
    dublê.comentarios.mockResolvedValueOnce({ Internal: [], Public: [] }).mockResolvedValue({
      Internal: [],
      Public: [
        {
          PublicId: 'pc-1',
          FromReporter: false,
          AuthorName: 'Ana Dona',
          Body: 'Em qual navegador isso aconteceu?',
          CreatedAt: pedidoEm,
        },
      ],
    })
    dublê.pedir.mockResolvedValue(
      aberto(relato(), {
        CanAskInfo: false,
        InfoRequest: {
          AskedByName: 'Ana Dona',
          AskedAt: pedidoEm,
          WarnAt: '2026-10-14T12:00:00.000Z',
          CloseAt: '2026-10-21T12:00:00.000Z',
        },
      }),
    )
    montar()

    await detalheNaTela()
    expect(
      screen.getByText(
        'Encerrar pede um motivo, e é ele que quem relatou lê. Pedir informação devolve o relato sem encerrar.',
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pedir informação' }))
    const dialogo = screen.getByRole('dialog', { name: 'Pedir uma informação' })
    fireEvent.change(within(dialogo).getByLabelText('O que falta'), {
      target: { value: 'Em qual navegador isso aconteceu?' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Pedir' }))

    await waitFor(() =>
      expect(dublê.pedir).toHaveBeenCalledWith('p-1', 'r-1', {
        Body: 'Em qual navegador isso aconteceu?',
      }),
    )
    // Sem fechar e abrir o card: a conversa e relida, e a pergunta esta nos dois lugares.
    const bloco = (await screen.findByText('Esperando quem relatou')).closest(
      'section',
    ) as HTMLElement
    await waitFor(() => expect(within(bloco).getByText('Pergunta:')).toBeTruthy())
    expect(bloco.textContent).toContain('Pergunta: Em qual navegador isso aconteceu?')
    expect(screen.getAllByText('Em qual navegador isso aconteceu?')).toHaveLength(2)
    expect(dublê.comentarios).toHaveBeenCalledTimes(2)
    // Pedido feito, nao se pede de novo; encerrar continua.
    expect(screen.queryByRole('button', { name: 'Pedir informação' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Encerrar relato…' })).toBeTruthy()
  })

  it('ja na coluna que encerra, ainda sem encerramento, "Encerrar relato…" encerra sem mover', async () => {
    const noFeito = relato({ StatePublicId: 's-3', StateName: 'Feito' })
    dublê.abrir.mockResolvedValue(aberto(noFeito))
    dublê.encerrar.mockResolvedValue(aberto(noFeito, { Closure: encerramento() }))
    montar({ resumo: noFeito })

    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar relato…' }))
    const dialogo = screen.getByRole('dialog', { name: 'Encerrar o relato' })
    expect(within(dialogo).getByText(/continua na coluna em que está/)).toBeTruthy()
    fireEvent.change(within(dialogo).getByLabelText('Por que acabou'), {
      target: { value: 'Trocamos o gateway.' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Encerrar' }))
    await waitFor(() =>
      expect(dublê.encerrar).toHaveBeenCalledWith('p-1', 'r-1', {
        Outcome: 'Done',
        Reason: 'Trocamos o gateway.',
      }),
    )
    expect(dublê.mover).not.toHaveBeenCalled()
  })

  it('arquivado, ou ja encerrado, nao oferece encerrar nem pedir', async () => {
    const arquivado = relato({ ArchivedAt: '2026-10-05T12:00:00.000Z' })
    dublê.abrir.mockResolvedValue(aberto(arquivado, { CanAskInfo: true }))
    montar({ resumo: arquivado })
    await screen.findByRole('button', { name: 'Desarquivar' })
    expect(screen.queryByRole('button', { name: 'Encerrar relato…' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pedir informação' })).toBeNull()
    cleanup()

    const noFeito = relato({ StatePublicId: 's-3', StateName: 'Feito', Closed: true })
    dublê.abrir.mockResolvedValue(aberto(noFeito, { Closure: encerramento(), CanAskInfo: true }))
    montar({ resumo: noFeito })
    await screen.findByRole('heading', { name: 'Encerrado' })
    expect(screen.queryByRole('button', { name: 'Encerrar relato…' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pedir informação' })).toBeNull()
  })

  it('o pedido que falha deixa o dialogo aberto com o texto, e o aviso diz por que', async () => {
    dublê.abrir.mockResolvedValue(aberto(relato(), { CanAskInfo: true }))
    dublê.pedir.mockRejectedValue(new PanelError('Quem relatou nao aceita perguntas.', 409))
    montar()
    await detalheNaTela()

    fireEvent.click(screen.getByRole('button', { name: 'Pedir informação' }))
    const dialogo = screen.getByRole('dialog', { name: 'Pedir uma informação' })
    const campo = within(dialogo).getByLabelText('O que falta') as HTMLTextAreaElement
    fireEvent.change(campo, { target: { value: 'Em qual navegador?' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Pedir' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/aceita perguntas\./)
    expect(screen.getByRole('dialog', { name: 'Pedir uma informação' })).toBe(dialogo)
    expect(campo.value).toBe('Em qual navegador?')
  })

  it('sem poder perguntar, so o encerrar, com a frase dele', async () => {
    montar()
    await detalheNaTela()
    expect(screen.queryByRole('button', { name: 'Pedir informação' })).toBeNull()
    expect(screen.getByText('Encerrar pede um motivo, e é ele que quem relatou lê.')).toBeTruthy()
  })
})

describe('tirar da coluna que encerra', () => {
  it('pergunta antes de reabrir: "Cancelar" nao move; "Reabrir e mover" move e avisa', async () => {
    const noFeito = relato({ StatePublicId: 's-3', StateName: 'Feito', Closed: true })
    dublê.abrir.mockResolvedValue(aberto(noFeito, { Closure: encerramento() }))
    dublê.mover.mockResolvedValue(relato({ StatePublicId: 's-2', StateName: 'Fazendo' }))
    montar({ resumo: noFeito })

    await screen.findByRole('heading', { name: 'Encerrado' })
    expect(screen.getByText('Encerrado · Foi feito')).toBeTruthy()

    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Fazendo')
    const pergunta = await screen.findByRole('alertdialog', { name: 'Reabrir o relato #12?' })
    expect(
      within(pergunta).getByText(
        'Tirar o #12 de Feito reabre o relato: quem relatou volta a ver o relato em andamento, e o motivo do encerramento sai da página de acompanhamento.',
      ),
    ).toBeTruthy()
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(dublê.mover).not.toHaveBeenCalled()

    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Fazendo')
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Reabrir e mover',
      }),
    )
    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r-1', { StatePublicId: 's-2' }),
    )
    expect(await screen.findByText('#12 deixou de estar encerrado.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Encerrado' })).toBeNull())
  })

  it('o encerramento que quem relatou ja confirmou nao se desfaz: so move, sem perguntar', async () => {
    const noFeito = relato({ StatePublicId: 's-3', StateName: 'Feito', Closed: true })
    dublê.abrir.mockResolvedValue(
      aberto(noFeito, { Closure: encerramento({ ConfirmedAt: '2026-10-05T12:00:00.000Z' }) }),
    )
    dublê.mover.mockResolvedValue(relato({ StatePublicId: 's-2', StateName: 'Fazendo' }))
    montar({ resumo: noFeito })

    await screen.findByRole('heading', { name: 'Encerrado' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Fazendo')
    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r-1', { StatePublicId: 's-2' }),
    )
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByText('#12 deixou de estar encerrado.')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Encerrado' })).toBeTruthy()
  })

  it('o seletor mostra a coluna escolhida enquanto move; a falha volta e diz o que nao foi feito', async () => {
    let falhar: (erro: unknown) => void = () => {}
    dublê.mover.mockImplementation(
      () =>
        new Promise((_ok, erro) => {
          falhar = erro
        }),
    )
    montar()
    await detalheNaTela()

    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Fazendo')
    const seletor = screen.getByRole('combobox', { name: 'Mover para a coluna' })
    await waitFor(() => expect(seletor.textContent).toContain('Fazendo'))
    expect(screen.getByText('Movendo…')).toBeTruthy()

    falhar(new PanelError('Esta coluna foi desativada.', 409))
    expect(await screen.findByText(/^Não deu para mover o card\./)).toBeTruthy()
    await waitFor(() => expect(seletor.textContent).toContain('A fazer'))
    expect(screen.queryByText('Movendo…')).toBeNull()
  })
})

describe('o que quem relatou ve', () => {
  it('sem etapa, a coluna nao muda nada — e quem configura ganha o atalho para o Andamento publico', async () => {
    montar({ podeConfigurar: true })
    await detalheNaTela()
    expect(screen.getByText(/Esta coluna não muda o que quem relatou vê\./)).toBeTruthy()
    expect(screen.queryByText(/Ainda não aparece/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Andamento público' }).getAttribute('href')).toBe(
      '/projects/p-1/public-stages',
    )
  })

  it('quem nao configura le a frase, sem o atalho; com etapa, ela aparece', async () => {
    montar()
    await detalheNaTela()
    expect(screen.getByText(/Esta coluna não muda o que quem relatou vê\./)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Andamento público' })).toBeNull()
    cleanup()

    const comEtapa = relato({ PublicStageLabel: 'Em análise' })
    dublê.abrir.mockResolvedValue(aberto(comEtapa))
    montar({ resumo: comEtapa })
    await detalheNaTela()
    expect(screen.getByText('Em análise').parentElement?.textContent).toBe(
      'Quem relatou vê: Em análise',
    )
  })
})

describe('o Esc em camadas, e a pergunta antes de descartar', () => {
  it('o Esc na edicao sem mudanca sai so dela; o seguinte fecha o card', async () => {
    const { aoFechar } = montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Dar um título' }))
    const campo = screen.getByRole('textbox', { name: 'Título do time' })
    expect(document.activeElement).toBe(campo)

    teclar('Escape', campo)
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Título do time' })).toBeNull(),
    )
    expect(aoFechar).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()

    teclar('Escape')
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('com o titulo mudado, o Esc pergunta: "Continuar escrevendo" volta ao campo; "Descartar" sai da edicao e o card fica', async () => {
    const { aoFechar } = montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Dar um título' }))
    const campo = screen.getByRole('textbox', { name: 'Título do time' }) as HTMLInputElement
    fireEvent.change(campo, { target: { value: 'Pagamento recusado' } })

    teclar('Escape', campo)
    const pergunta = await screen.findByRole('alertdialog', {
      name: 'Descartar o que você escreveu?',
    })
    expect(
      within(pergunta).getByText('O texto que você começou neste card ainda não foi salvo.'),
    ).toBeTruthy()
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Continuar escrevendo' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(campo.value).toBe('Pagamento recusado')
    await waitFor(() => expect(document.activeElement).toBe(campo))

    teclar('Escape', campo)
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Título do time' })).toBeNull(),
    )
    expect(aoFechar).not.toHaveBeenCalled()
    expect(dublê.titulo).not.toHaveBeenCalled()
  })

  it('a etiqueta digitada: o Esc limpa so o campo, e o seguinte fecha o card', async () => {
    const { aoFechar } = montar()
    const campo = (await screen.findByRole('combobox', {
      name: 'Adicionar etiqueta',
    })) as HTMLInputElement
    campo.focus()
    fireEvent.change(campo, { target: { value: 'pag' } })

    teclar('Escape', campo)
    await waitFor(() => expect(campo.value).toBe(''))
    expect(aoFechar).not.toHaveBeenCalled()

    teclar('Escape', campo)
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('o "Vincular" aberto: o Esc sai so dele, com o foco de volta no botao; o seguinte fecha o card', async () => {
    const { aoFechar } = montar()
    await detalheNaTela()
    fireEvent.click(await screen.findByRole('button', { name: '+ Vincular' }))
    const busca = screen.getByLabelText('Card')
    expect(document.activeElement).toBe(busca)

    teclar('Escape', busca)
    await waitFor(() => expect(screen.queryByLabelText('Card')).toBeNull())
    expect(aoFechar).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '+ Vincular' })),
    )

    teclar('Escape')
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('o campo de subtarefa: o Esc limpa so o campo, e o seguinte fecha o card', async () => {
    const { aoFechar } = montar()
    await detalheNaTela()
    const campo = screen.getByRole('textbox', { name: 'Criar subtarefa' }) as HTMLInputElement
    campo.focus()
    fireEvent.change(campo, { target: { value: 'Testar no Safari' } })

    teclar('Escape', campo)
    await waitFor(() => expect(campo.value).toBe(''))
    expect(aoFechar).not.toHaveBeenCalled()

    teclar('Escape', campo)
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('fechar pelo X com o comentario pela metade pergunta; "Continuar escrevendo" devolve o foco a caixa, e "Descartar" fecha', async () => {
    const { aoFechar } = montar()
    await detalheNaTela()
    const caixa = screen.getByRole('textbox', { name: 'Entre o time' })
    caixa.focus()
    fireEvent.change(caixa, { target: { value: 'Acho que e o gateway' } })

    // O clique no X leva o foco para ele, como no navegador.
    const fechar = screen.getByRole('button', { name: 'Fechar' })
    fechar.focus()
    fireEvent.click(fechar)
    const pergunta = await screen.findByRole('alertdialog', {
      name: 'Descartar o que você escreveu?',
    })
    expect(aoFechar).not.toHaveBeenCalled()
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Continuar escrevendo' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(caixa))
    expect((caixa as HTMLTextAreaElement).value).toBe('Acho que e o gateway')

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar' }),
    )
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1))
  })

  it('o Esc com o comentario pela metade tambem pergunta, em vez de levar o texto', async () => {
    const { aoFechar } = montar()
    await detalheNaTela()
    const caixa = screen.getByRole('textbox', { name: 'Para quem relatou' })
    caixa.focus()
    fireEvent.change(caixa, { target: { value: 'Ja corrigimos, pode testar?' } })

    teclar('Escape', caixa)
    expect(
      await screen.findByRole('alertdialog', { name: 'Descartar o que você escreveu?' }),
    ).toBeTruthy()
    expect(aoFechar).not.toHaveBeenCalled()
  })

  it('a correcao de um comentario: o Esc com o texto mudado pergunta; sem mudanca, sai so dela', async () => {
    dublê.comentarios.mockResolvedValue({
      Internal: [
        {
          PublicId: 'c-1',
          AuthorName: 'Ana Dona',
          Body: 'Acho que e o gateway.',
          CreatedAt: '2026-10-07T12:00:00.000Z',
          EditedAt: null,
          IsYours: true,
        },
      ],
      Public: [],
    })
    const { aoFechar } = montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar o seu comentário' }))
    const campo = screen.getByRole('textbox', { name: 'Corrigir o comentário' })
    expect(document.activeElement).toBe(campo)
    fireEvent.change(campo, { target: { value: 'E o gateway mesmo.' } })

    teclar('Escape', campo)
    fireEvent.click(
      within(
        await screen.findByRole('alertdialog', { name: 'Descartar o que você escreveu?' }),
      ).getByRole('button', { name: 'Descartar' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Corrigir o comentário' })).toBeNull(),
    )
    expect(screen.getByText('Acho que e o gateway.')).toBeTruthy()
    expect(aoFechar).not.toHaveBeenCalled()

    // Sem mudanca, o Esc sai da correcao sem perguntar; o seguinte fecha o card.
    fireEvent.click(screen.getByRole('button', { name: 'Editar o seu comentário' }))
    const deNovo = screen.getByRole('textbox', { name: 'Corrigir o comentário' })
    teclar('Escape', deNovo)
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Corrigir o comentário' })).toBeNull(),
    )
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(aoFechar).not.toHaveBeenCalled()
    teclar('Escape')
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })
})

describe('os avisos com o card aberto', () => {
  it('nascem dentro do card, o erro e lido como alerta, e fechar o aviso nao fecha o card', async () => {
    dublê.prioridade.mockRejectedValue(new PanelError('Erro interno.', 500))
    const { aoFechar } = montar()
    await screen.findByRole('combobox', { name: 'Prioridade' })

    await escolherNoSelect(screen, fireEvent, 'Prioridade', 'Baixa')
    const aviso = await screen.findByRole('alert')
    expect(screen.getByRole('dialog').contains(aviso)).toBe(true)
    expect(aviso.textContent).toContain('Não deu para mudar a prioridade.')
    // A falha fica tambem embaixo do campo, que voltou ao que vale.
    expect(screen.getByText('Não deu para mudar a prioridade. Tente de novo.')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Prioridade' }).textContent).toContain(
      'Sem prioridade',
    )

    fireEvent.click(within(aviso).getByRole('button', { name: 'Fechar aviso' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(aoFechar).not.toHaveBeenCalled()
  })
})

describe('anterior, proximo e o link do card', () => {
  it('o foco entra no X; os botoes do alto e J/K, com o foco fora de campo, levam ao vizinho', async () => {
    const { aoIrPara } = montar({ anterior: 'r-0', proximo: 'r-2' })
    await detalheNaTela()
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fechar' })),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Próximo card' }))
    expect(aoIrPara).toHaveBeenLastCalledWith('r-2')
    fireEvent.click(screen.getByRole('button', { name: 'Card anterior' }))
    expect(aoIrPara).toHaveBeenLastCalledWith('r-0')
    expect(
      screen.getByRole('button', { name: 'Próximo card' }).getAttribute('aria-keyshortcuts'),
    ).toBe('J')

    teclar('j')
    expect(aoIrPara).toHaveBeenLastCalledWith('r-2')
    teclar('K')
    expect(aoIrPara).toHaveBeenLastCalledWith('r-0')
    expect(aoIrPara).toHaveBeenCalledTimes(4)

    // Dentro de um campo, a letra e do campo.
    const caixa = screen.getByRole('textbox', { name: 'Entre o time' })
    caixa.focus()
    teclar('j', caixa)
    teclar('k', screen.getByRole('combobox', { name: 'Prioridade' }))
    expect(aoIrPara).toHaveBeenCalledTimes(4)
  })

  it('na ponta da lista o botao fica desligado e a tecla nao faz nada; sem vizinhos, so o "Copiar link"', async () => {
    const { aoIrPara } = montar({ anterior: null, proximo: 'r-2' })
    await detalheNaTela()
    expect(
      (screen.getByRole('button', { name: 'Card anterior' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    teclar('k', document.body)
    expect(aoIrPara).not.toHaveBeenCalled()
    cleanup()

    montar()
    await detalheNaTela()
    expect(screen.queryByRole('button', { name: 'Card anterior' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Próximo card' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Copiar link' })).toBeTruthy()
  })

  it('com uma pergunta ou uma lista aberta por cima, J e K nao andam', async () => {
    const { aoIrPara } = montar({ anterior: 'r-0', proximo: 'r-2' })
    await detalheNaTela()

    // A lista da prioridade aberta: a letra e dela.
    fireEvent.pointerDown(await screen.findByRole('combobox', { name: 'Prioridade' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    expect(screen.getByRole('listbox')).toBeTruthy()
    teclar('j', document.body)
    expect(aoIrPara).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())

    // A pergunta de descartar por cima.
    fireEvent.change(screen.getByRole('textbox', { name: 'Entre o time' }), {
      target: { value: 'pela metade' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Próximo card' }))
    await screen.findByRole('alertdialog')
    teclar('j', document.body)
    teclar('k', document.body)
    expect(aoIrPara).not.toHaveBeenCalled()
  })

  it('trocar de card com texto por salvar pergunta antes', async () => {
    const { aoIrPara } = montar({ anterior: 'r-0', proximo: 'r-2' })
    await detalheNaTela()
    const caixa = screen.getByRole('textbox', { name: 'Entre o time' })
    fireEvent.change(caixa, { target: { value: 'pela metade' } })

    fireEvent.click(screen.getByRole('button', { name: 'Próximo card' }))
    const pergunta = await screen.findByRole('alertdialog', {
      name: 'Descartar o que você escreveu?',
    })
    expect(aoIrPara).not.toHaveBeenCalled()
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(aoIrPara).toHaveBeenCalledWith('r-2'))
  })

  it('"Copiar link" copia o endereco e diz qual card; sem conseguir, diz onde copiar', async () => {
    dublê.copiar.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    montar()
    await detalheNaTela()

    fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }))
    await waitFor(() => expect(dublê.copiar).toHaveBeenCalledWith(window.location.href))
    expect(await screen.findByText('Link do #12 copiado.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }))
    expect(
      await screen.findByText('Não deu para copiar o link. Copie da barra de endereço.'),
    ).toBeTruthy()
  })
})

describe('o card que nao abre, e o relato sem titulo', () => {
  it('o link direto que falha diz o que houve, e "Tentar de novo" abre', async () => {
    dublê.abrir.mockRejectedValueOnce(new Error('sem rede')).mockResolvedValue(aberto(relato()))
    montar({ resumo: null })

    expect(
      await screen.findByText(
        'Não deu para abrir este card. Ele pode ter sido excluído, ou a conexão falhou.',
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(
      await screen.findByRole('heading', { name: '“O botao de pagar nao responde.”' }),
    ).toBeTruthy()
    expect(dublê.abrir).toHaveBeenCalledTimes(2)
  })

  it('com o resumo na tela, o contexto que falha tambem tenta de novo', async () => {
    dublê.abrir
      .mockRejectedValueOnce(new Error('sem rede'))
      .mockResolvedValue(aberto(relato(), { Contexts: [{ Key: 'language', Value: 'pt-BR' }] }))
    montar()

    expect(await screen.findByText(/O resto do contexto não carregou/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('pt-BR')).toBeTruthy()
  })

  it('o titulo do dialogo diz o tipo, o numero e que o relato e de fora; o texto curto nao se repete', async () => {
    montar()
    await detalheNaTela()
    // O desenho do tipo fica so para os olhos: o nome e o que se le.
    expect(screen.getByRole('dialog', { name: /^Defeito\s*#12\s*Relato de fora$/ })).toBeTruthy()

    expect(screen.getByRole('heading', { name: '“O botao de pagar nao responde.”' })).toBeTruthy()
    // Curto e numa linha so, ele ja esta inteiro na manchete.
    expect(screen.queryByText('O botao de pagar nao responde.')).toBeNull()
  })

  it('o texto com quebra de linha vem inteiro embaixo da manchete', async () => {
    const longo = relato({ Text: 'O botao de pagar nao responde.\nTentei duas vezes.' })
    dublê.abrir.mockResolvedValue(aberto(longo))
    montar({ resumo: longo })
    await detalheNaTela()
    expect(
      screen.getByText(
        (_, elemento) => elemento?.textContent === longo.Text && elemento.tagName === 'P',
      ),
    ).toBeTruthy()
  })

  it('no celular, onde o card esta vem antes das subtarefas e dos vinculos', async () => {
    montar()
    await detalheNaTela()
    const coluna = screen.getByRole('combobox', { name: 'Mover para a coluna' })
    const subtarefas = screen.getByRole('heading', { name: 'Subtarefas' })
    const vinculos = await screen.findByRole('heading', { name: 'Vínculos' })
    expect(coluna.compareDocumentPosition(subtarefas) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(coluna.compareDocumentPosition(vinculos) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })
})
