// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ReportDetailViewModel,
  ReportHistoryEntryViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
} from '@/contracts'
import { PanelError } from '@/data'
import { ReportDialog } from '@/features/reports/ReportDialog'
import type { WorkListener } from '@/features/reports/useWorkRealtime'
import { Toaster } from '@/shared/components/Toaster'
import { useToastStore } from '@/shared/components/toastStore'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: o card do time aberto — editar no lugar, e duas pessoas
 * no mesmo texto.
 *
 * - **"Editar" fica ao lado do titulo**, e clicar no titulo ou na descricao tambem
 *   edita, com o foco no campo clicado. O clique num link da descricao abre o link, e o
 *   de quem estava selecionando texto para copiar nao edita.
 * - **Os campos da direita continuam a vista** durante a edicao; "Descartar o texto"
 *   so desfaz o titulo e a descricao. Enter no titulo salva.
 * - **A gravacao leva o texto de onde partiu** (`Base`). Recusada porque outra pessoa
 *   salvou no meio, a tela diz quem, e a pessoa escolhe: "Usar a versao nova" ou
 *   "Manter a minha" — salvar fica desligado ate escolher. A versao nova que chega ao
 *   vivo avisa antes de salvar; a mudanca so de prioridade nao avisa.
 * - **Arquivado so se le**: sem "Editar", e o clique no titulo nao edita.
 * - **O Esc sai primeiro da edicao**; com o texto mudado, pergunta antes — e o card
 *   fica. O Esc seguinte fecha o card. Fechar com a edicao mudada tambem pergunta.
 * - **A descricao que nao carregou tenta de novo**, sem fechar o card.
 * - **Mover o card do time e so mover**, tambem para a ultima coluna: o seletor mostra a
 *   escolhida com "Movendo…", e nao ha motivo a pedir.
 */
const dublê = vi.hoisted(() => ({
  abrir: vi.fn(),
  reler: vi.fn(),
  editar: vi.fn(),
  historico: vi.fn(),
  mover: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectReportService: {
      openReport: dublê.abrir,
      refreshReport: dublê.reler,
      editTeamCard: dublê.editar,
      listReportHistory: dublê.historico,
      moveReport: dublê.mover,
      setArchived: vi.fn(),
      listComments: vi.fn().mockResolvedValue({ Internal: [], Public: [] }),
      listLinks: vi.fn().mockResolvedValue([]),
      listReports: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
      addInternalComment: vi.fn(),
    },
    projectTeamService: { listMembers: vi.fn().mockResolvedValue([]) },
    projectPriorityService: { listPriorities: vi.fn().mockResolvedValue([]) },
    projectLabelService: { listLabels: vi.fn().mockResolvedValue([]), addLabel: vi.fn() },
    projectReportAttachmentService: { listAttachments: vi.fn().mockResolvedValue([]) },
  }
})

instalarRemendosDoRadix()

const colunas: ReportStateCountViewModel[] = [
  { StatePublicId: 's-1', StateName: 'A fazer', IsActive: true, ClosesReport: false, Total: 1 },
  { StatePublicId: 's-2', StateName: 'Feito', IsActive: true, ClosesReport: true, Total: 0 },
]

function cardDoTime(extra: Partial<ReportSummaryViewModel> = {}): ReportSummaryViewModel {
  return {
    PublicId: 'c-7',
    Kind: 'Team',
    Number: 7,
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
  Description: string | null = 'Trocar o **gateway** antes da virada.',
): ReportDetailViewModel {
  return {
    ...resumo,
    Description,
    CreatedByName: 'Ana Dona',
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

function edicao(AuthorName: string): ReportHistoryEntryViewModel {
  return {
    PublicId: `h-${AuthorName}`,
    Type: 'TeamCardEdited',
    AuthorName,
    FromStateName: null,
    ToStateName: null,
    OccurredAt: '2026-10-07T12:00:00.000Z',
    From: null,
    To: null,
    Added: [],
    Removed: [],
    TitleRestored: null,
  }
}

function montar(props: Partial<ComponentProps<typeof ReportDialog>> = {}) {
  const ouvintes = new Set<WorkListener>()
  const aoMudar = vi.fn()
  const aoFechar = vi.fn()
  render(
    <MemoryRouter>
      <ReportDialog
        projectPublicId="p-1"
        reportPublicId="c-7"
        resumo={cardDoTime()}
        colunas={colunas}
        aoMudar={aoMudar}
        aoFechar={aoFechar}
        assinarAvisos={(ouvinte) => {
          ouvintes.add(ouvinte)
          return () => ouvintes.delete(ouvinte)
        }}
        {...props}
      />
      <Toaster />
    </MemoryRouter>,
  )
  /** Outra pessoa mexeu no card: o aviso do tempo real. */
  const avisar = () =>
    act(() => {
      for (const ouvinte of ouvintes)
        ouvinte({
          kind: 'card',
          notice: {
            ProjectPublicId: 'p-1',
            ReportPublicId: 'c-7',
            StatePublicId: 's-1',
            Archived: false,
            Origin: null,
          },
        })
    })
  return { aoMudar, avisar, aoFechar }
}

beforeEach(() => {
  for (const mock of Object.values(dublê)) mock.mockReset()
  dublê.abrir.mockResolvedValue(aberto(cardDoTime()))
  dublê.historico.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  useToastStore.setState({ toasts: [], hosts: [] })
})

describe('editar o card do time no lugar', () => {
  it('"Editar" fica ao lado do titulo; editar deixa os campos a vista, e o Enter no titulo salva com a base', async () => {
    dublê.editar.mockImplementation(async (_p: string, _r: string, corpo: { Title: string }) =>
      aberto(cardDoTime({ Title: corpo.Title })),
    )
    montar()

    const titulo = await screen.findByRole('heading', { name: 'Lançar o checkout novo' })
    const editar = screen.getByRole('button', { name: 'Editar' })
    await waitFor(() => expect((editar as HTMLButtonElement).disabled).toBe(false))
    expect(titulo.parentElement?.contains(editar)).toBe(true)

    fireEvent.click(editar)
    const campo = screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement
    expect(document.activeElement).toBe(campo)
    // Os campos continuam ali: a prioridade se ajusta enquanto se escreve.
    expect(screen.getByRole('region', { name: 'Campos do card' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descartar o texto' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()

    fireEvent.change(campo, { target: { value: 'Lançar o checkout novo em outubro' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() =>
      expect(dublê.editar).toHaveBeenCalledWith('p-1', 'c-7', {
        Title: 'Lançar o checkout novo em outubro',
        Description: 'Trocar o **gateway** antes da virada.',
        Base: {
          Title: 'Lançar o checkout novo',
          Description: 'Trocar o **gateway** antes da virada.',
        },
      }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Lançar o checkout novo em outubro' }),
    ).toBeTruthy()
  })

  it('clicar na descricao edita com o foco nela e o cursor no fim; o link de dentro nao edita', async () => {
    dublê.abrir.mockResolvedValue(
      aberto(cardDoTime(), 'Ver [o guia](https://exemplo.com/guia) antes.'),
    )
    montar()

    const link = await screen.findByRole('link', { name: 'o guia' })
    fireEvent.click(link)
    expect(screen.queryByRole('textbox', { name: 'Título' })).toBeNull()

    fireEvent.click(screen.getByText(/antes\./))
    const descricao = screen.getByRole('textbox', { name: 'Descrição' }) as HTMLTextAreaElement
    expect(document.activeElement).toBe(descricao)
    expect(descricao.selectionStart).toBe(descricao.value.length)

    // "Descartar o texto" sai da edicao sem gravar.
    fireEvent.click(screen.getByRole('button', { name: 'Descartar o texto' }))
    expect(screen.queryByRole('textbox', { name: 'Descrição' })).toBeNull()
    expect(dublê.editar).not.toHaveBeenCalled()
  })

  it('o clique de quem estava selecionando texto para copiar nao entra na edicao', async () => {
    montar()
    const trecho = await screen.findByText('gateway')
    const selecao = vi
      .spyOn(window, 'getSelection')
      .mockReturnValue({ toString: () => 'gateway' } as Selection)

    fireEvent.click(trecho)
    fireEvent.click(screen.getByRole('heading', { name: 'Lançar o checkout novo' }))
    expect(screen.queryByRole('textbox', { name: 'Descrição' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Título' })).toBeNull()

    selecao.mockRestore()
    fireEvent.click(trecho)
    expect(screen.getByRole('textbox', { name: 'Descrição' })).toBeTruthy()
  })

  it('clicar no titulo edita com o foco no titulo; sem descricao, a tela convida a escrever', async () => {
    dublê.abrir.mockResolvedValue(aberto(cardDoTime(), null))
    montar()

    expect(await screen.findByText('Sem descrição. Clique para escrever.')).toBeTruthy()
    fireEvent.click(screen.getByRole('heading', { name: 'Lançar o checkout novo' }))
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Título' }))
  })

  it('arquivado so se le: sem "Editar", e o clique no titulo nao edita', async () => {
    const arquivado = cardDoTime({ ArchivedAt: '2026-10-05T12:00:00.000Z' })
    dublê.abrir.mockResolvedValue(aberto(arquivado, null))
    montar({ resumo: arquivado })

    expect(await screen.findByText('Sem descrição.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    fireEvent.click(screen.getByRole('heading', { name: 'Lançar o checkout novo' }))
    expect(screen.queryByRole('textbox', { name: 'Título' })).toBeNull()
  })
})

describe('duas pessoas no mesmo texto', () => {
  it('o 409 de quem salvou no meio: diz quem, e "Manter a minha" salva por cima sabendo', async () => {
    dublê.editar
      .mockRejectedValueOnce(
        new PanelError('Outra pessoa salvou este card enquanto voce editava.', 409),
      )
      .mockImplementation(async (_p: string, _r: string, corpo: { Title: string }) =>
        aberto(cardDoTime({ Title: corpo.Title })),
      )
    dublê.reler.mockResolvedValue(aberto(cardDoTime(), 'A versao do Bruno.'))
    dublê.historico.mockResolvedValue([edicao('Ana Dona'), edicao('Bruno Membro')])
    montar()

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), {
      target: { value: 'O meu titulo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    const faixa = await screen.findByRole('alert')
    await waitFor(() =>
      expect(faixa.textContent).toContain(
        'Bruno Membro salvou uma nova versão enquanto você editava.',
      ),
    )
    // Sem escolher, nao salva.
    const salvar = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement
    expect(salvar.disabled).toBe(true)
    expect((screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement).value).toBe(
      'O meu titulo',
    )

    fireEvent.click(within(faixa).getByRole('button', { name: 'Manter a minha' }))
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(dublê.editar).toHaveBeenCalledTimes(2))
    expect(dublê.editar).toHaveBeenLastCalledWith('p-1', 'c-7', {
      Title: 'O meu titulo',
      Description: 'Trocar o **gateway** antes da virada.',
      Base: { Title: 'Lançar o checkout novo', Description: 'A versao do Bruno.' },
    })
  })

  it('a versao nova que chega ao vivo avisa antes de salvar; "Usar a versao nova" troca o texto', async () => {
    dublê.reler.mockResolvedValue(
      aberto(cardDoTime({ Title: 'Checkout novo, revisto' }), 'A versao do Bruno.'),
    )
    dublê.historico.mockResolvedValue([edicao('Bruno Membro')])
    const { avisar } = montar()

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), {
      target: { value: 'O meu titulo' },
    })
    avisar()

    const faixa = await screen.findByRole('alert')
    await waitFor(() => expect(faixa.textContent).toContain('Bruno Membro salvou'))
    expect(dublê.editar).not.toHaveBeenCalled()

    fireEvent.click(within(faixa).getByRole('button', { name: 'Usar a versão nova' }))
    expect((screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement).value).toBe(
      'Checkout novo, revisto',
    )
    expect((screen.getByRole('textbox', { name: 'Descrição' }) as HTMLTextAreaElement).value).toBe(
      'A versao do Bruno.',
    )
  })

  it('outra pessoa so trocou a prioridade: nada de aviso, e salvar vai direto', async () => {
    dublê.reler.mockResolvedValue(
      aberto(
        cardDoTime({
          Priority: { PublicId: 'p-alta', Name: 'Alta', Color: 'Orange', IsActive: true },
          UpdatedAt: '2026-10-07T13:00:00.000Z',
        }),
      ),
    )
    dublê.editar.mockImplementation(async (_p: string, _r: string, corpo: { Title: string }) =>
      aberto(cardDoTime({ Title: corpo.Title })),
    )
    const { avisar } = montar()

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), {
      target: { value: 'O meu titulo' },
    })
    avisar()
    await waitFor(() => expect(dublê.reler).toHaveBeenCalled())
    await act(() => new Promise((pronto) => setTimeout(pronto, 20)))
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(dublê.editar).toHaveBeenCalledTimes(1))
  })

  it('o 409 que nao e de texto mudado fica no campo, sem a faixa', async () => {
    dublê.editar.mockRejectedValue(new PanelError('Card arquivado nao pode ser editado.', 409))
    dublê.reler.mockResolvedValue(aberto(cardDoTime()))
    montar()

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), {
      target: { value: 'O meu titulo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Card arquivado não pode ser editado.')).toBeTruthy()
    expect(screen.queryByText(/salvou uma nova versão/)).toBeNull()
  })
})

describe('o Esc e o fechar com a edicao aberta', () => {
  it('sem mudanca, o Esc sai so da edicao; o seguinte fecha o card', async () => {
    const { aoFechar } = montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    const campo = screen.getByRole('textbox', { name: 'Título' })

    fireEvent.keyDown(campo, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Título' })).toBeNull())
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(aoFechar).not.toHaveBeenCalled()

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('com a descricao mudada, o Esc pergunta: "Descartar" sai da edicao sem gravar, e o card fica', async () => {
    dublê.abrir.mockResolvedValue(aberto(cardDoTime(), null))
    const { aoFechar } = montar()
    fireEvent.click(await screen.findByText('Sem descrição. Clique para escrever.'))
    const descricao = screen.getByRole('textbox', { name: 'Descrição' })
    expect(document.activeElement).toBe(descricao)
    fireEvent.change(descricao, { target: { value: 'Trocar o gateway.' } })

    fireEvent.keyDown(descricao, { key: 'Escape' })
    const pergunta = await screen.findByRole('alertdialog', {
      name: 'Descartar o que você escreveu?',
    })
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Descrição' })).toBeNull())
    expect(screen.getByText('Sem descrição. Clique para escrever.')).toBeTruthy()
    expect(aoFechar).not.toHaveBeenCalled()
    expect(dublê.editar).not.toHaveBeenCalled()
  })

  it('fechar pelo X com a edicao mudada pergunta; "Continuar escrevendo" volta ao texto', async () => {
    const { aoFechar } = montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    const titulo = screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement
    fireEvent.change(titulo, { target: { value: 'O meu titulo' } })

    const fechar = screen.getByRole('button', { name: 'Fechar' })
    fechar.focus()
    fireEvent.click(fechar)
    const pergunta = await screen.findByRole('alertdialog', {
      name: 'Descartar o que você escreveu?',
    })
    expect(aoFechar).not.toHaveBeenCalled()
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Continuar escrevendo' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(titulo))
    expect(titulo.value).toBe('O meu titulo')
  })
})

describe('o card do time que nao abre, e mover', () => {
  it('a descricao que nao carregou diz, e "Tentar de novo" abre de novo', async () => {
    dublê.abrir.mockRejectedValueOnce(new Error('sem rede')).mockResolvedValue(aberto(cardDoTime()))
    montar()

    expect(await screen.findByText(/A descrição não carregou\./)).toBeTruthy()
    // O titulo, que veio da lista, continua na tela; editar espera a descricao.
    expect(screen.getByRole('heading', { name: 'Lançar o checkout novo' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Editar' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('gateway')).toBeTruthy()
    expect(dublê.abrir).toHaveBeenCalledTimes(2)
  })

  it('mover para a ultima coluna so move, com "Movendo…" enquanto grava', async () => {
    let soltar: (card: ReportSummaryViewModel) => void = () => {}
    dublê.mover.mockReturnValue(
      new Promise<ReportSummaryViewModel>((ok) => {
        soltar = ok
      }),
    )
    const { aoMudar } = montar()
    await screen.findByRole('button', { name: 'Editar' })

    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Feito')
    expect(screen.queryByRole('dialog', { name: 'Encerrar o relato' })).toBeNull()
    expect(dublê.mover).toHaveBeenCalledWith('p-1', 'c-7', { StatePublicId: 's-2' })
    expect(screen.getByRole('combobox', { name: 'Mover para a coluna' }).textContent).toContain(
      'Feito',
    )
    expect(screen.getByText('Movendo…')).toBeTruthy()

    const movido = cardDoTime({ StatePublicId: 's-2', StateName: 'Feito', Finished: true })
    await act(async () => soltar(movido))
    await waitFor(() => expect(screen.queryByText('Movendo…')).toBeNull())
    expect(aoMudar).toHaveBeenCalledWith(movido)
  })
})
