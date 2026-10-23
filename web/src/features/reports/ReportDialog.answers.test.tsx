// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ReportDetailViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
} from '@/contracts'
import { ReportDialog } from '@/features/reports/ReportDialog'
import { Toaster } from '@/shared/components/Toaster'
import { useToastStore } from '@/shared/components/toastStore'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: o card aberto mostra o relato como foi respondido.
 *
 * - **Cada resposta embaixo da pergunta** como ela estava no envio, e a caixa livre
 *   no fim como "Mais detalhes". As respostas so vem no detalhe.
 * - **Ate o detalhe chegar, o texto de sempre**; quando ele traz respostas, elas
 *   tomam o lugar do texto, que nao se repete.
 * - **O tipo sem perguntas** continua mostrando o texto.
 */
const dublê = vi.hoisted(() => ({
  abrir: vi.fn(),
  reler: vi.fn(),
  comentarios: vi.fn(),
  historico: vi.fn(),
  vinculos: vi.fn(),
  membros: vi.fn(),
  prioridades: vi.fn(),
  etiquetas: vi.fn(),
  anexos: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectReportService: {
      openReport: dublê.abrir,
      refreshReport: dublê.reler,
      moveReport: vi.fn(),
      closeReport: vi.fn(),
      askInfo: vi.fn(),
      setArchived: vi.fn(),
      listComments: dublê.comentarios,
      listReportHistory: dublê.historico,
      listLinks: dublê.vinculos,
      listReports: vi.fn(),
      addInternalComment: vi.fn(),
      addPublicComment: vi.fn(),
      setTitle: vi.fn(),
      setPriority: vi.fn(),
    },
    projectTeamService: { listMembers: dublê.membros },
    projectPriorityService: { listPriorities: dublê.prioridades },
    projectLabelService: { listLabels: dublê.etiquetas, addLabel: vi.fn() },
    projectReportAttachmentService: { listAttachments: dublê.anexos },
  }
})

vi.mock('@/shared/lib/clipboard', () => ({ copyText: vi.fn() }))

instalarRemendosDoRadix()

const colunas: ReportStateCountViewModel[] = [
  { StatePublicId: 's-1', StateName: 'A fazer', IsActive: true, ClosesReport: false, Total: 1 },
  { StatePublicId: 's-3', StateName: 'Feito', IsActive: true, ClosesReport: true, Total: 0 },
]

/** O texto que a API guarda para o relato com perguntas: as respostas juntas. */
const JUNTAS = 'Pagar com Pix\n\nNada acontece\n\nUsei o celular'

const RESPOSTAS: ReportDetailViewModel['Answers'] = [
  { Question: 'O que você tentou fazer?', Answer: 'Pagar com Pix' },
  { Question: 'O que aconteceu?', Answer: 'Nada acontece' },
  { Question: null, Answer: 'Usei o celular' },
]

function relato(extra: Partial<ReportSummaryViewModel> = {}): ReportSummaryViewModel {
  return {
    PublicId: 'r-1',
    Kind: 'Report',
    Number: 12,
    Title: null,
    // Com titulo, o texto nao vira manchete: ele aparece inteiro no corpo.
    ReporterTitle: 'O pagamento travou',
    TrackingCode: 'ABCD-EFGH',
    Type: { PublicId: 'tipo-defeito', Name: 'Defeito', Color: 'Red', Icon: 'Bug', IsActive: true },
    Text: JUNTAS,
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

function aberto(
  resumo: ReportSummaryViewModel,
  extra: Partial<ReportDetailViewModel> = {},
): ReportDetailViewModel {
  return {
    ...resumo,
    Description: null,
    Answers: null,
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

function montar(resumo: ReportSummaryViewModel = relato()) {
  render(
    <MemoryRouter>
      <ReportDialog
        projectPublicId="p-1"
        reportPublicId="r-1"
        resumo={resumo}
        colunas={colunas}
        aoMudar={vi.fn()}
        aoFechar={vi.fn()}
        aoIrPara={vi.fn()}
      />
      <Toaster />
    </MemoryRouter>,
  )
}

/** O detalhe chegou: as saidas do relato so aparecem depois dele. */
async function detalheNaTela() {
  await screen.findByRole('button', { name: 'Encerrar relato…' })
}

/** O paragrafo com o texto inteiro, como a API o guarda. */
const textoInteiro = (texto: string) =>
  screen.queryByText((_, elemento) => elemento?.tagName === 'P' && elemento.textContent === texto)

beforeEach(() => {
  for (const mock of Object.values(dublê)) mock.mockReset()
  dublê.abrir.mockResolvedValue(aberto(relato(), { Answers: RESPOSTAS }))
  dublê.reler.mockResolvedValue(aberto(relato(), { Answers: RESPOSTAS }))
  dublê.comentarios.mockResolvedValue({ Internal: [], Public: [] })
  dublê.historico.mockResolvedValue([])
  dublê.vinculos.mockResolvedValue([])
  dublê.anexos.mockResolvedValue([])
  dublê.membros.mockResolvedValue([])
  dublê.prioridades.mockResolvedValue([])
  dublê.etiquetas.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  useToastStore.setState({ toasts: [], hosts: [] })
})

describe('as respostas no card aberto', () => {
  it('cada resposta embaixo da sua pergunta, e a caixa livre no fim como "Mais detalhes"', async () => {
    montar()
    await detalheNaTela()

    const pergunta = await screen.findByText('O que você tentou fazer?')
    expect(pergunta.tagName).toBe('DT')
    expect(pergunta.nextElementSibling?.textContent).toBe('Pagar com Pix')

    const lista = pergunta.closest('dl') as HTMLElement
    expect(Array.from(lista.querySelectorAll('dt')).map((item) => item.textContent)).toEqual([
      'O que você tentou fazer?',
      'O que aconteceu?',
      'Mais detalhes',
    ])
    expect(Array.from(lista.querySelectorAll('dd')).map((item) => item.textContent)).toEqual([
      'Pagar com Pix',
      'Nada acontece',
      'Usei o celular',
    ])
    // O texto e as mesmas respostas juntas: mostrar os dois repetiria tudo.
    expect(textoInteiro(JUNTAS)).toBeNull()
  })

  it('ate o detalhe chegar, o texto de sempre; quando chega, as respostas tomam o lugar dele', async () => {
    let entregar: (detalhe: ReportDetailViewModel) => void = () => {}
    dublê.abrir.mockReturnValue(
      new Promise<ReportDetailViewModel>((resolve) => {
        entregar = resolve
      }),
    )
    montar()

    expect(textoInteiro(JUNTAS)).toBeTruthy()
    expect(screen.queryByText('O que você tentou fazer?')).toBeNull()

    entregar(aberto(relato(), { Answers: RESPOSTAS }))

    expect(await screen.findByText('O que você tentou fazer?')).toBeTruthy()
    await waitFor(() => expect(textoInteiro(JUNTAS)).toBeNull())
  })

  it('o tipo sem perguntas continua mostrando o texto, sem rotulo nenhum', async () => {
    const semPerguntas = relato({ Text: 'Um modo escuro.\nPara usar a noite.' })
    dublê.abrir.mockResolvedValue(aberto(semPerguntas, { Answers: null }))
    montar(semPerguntas)
    await detalheNaTela()

    expect(textoInteiro('Um modo escuro.\nPara usar a noite.')).toBeTruthy()
    expect(screen.queryByText('Mais detalhes')).toBeNull()
  })
})
