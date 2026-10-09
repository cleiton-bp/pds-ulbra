// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CardLinkViewModel,
  ReportHistoryEntryViewModel,
  ReportSummaryViewModel,
} from '@/contracts'
import { CardLinks } from '@/features/reports/CardLinks'
import { CloseReportDialog } from '@/features/reports/CloseReportDialog'
import { BlockedMark } from '@/features/reports/cardLook'
import { ReportHistory } from '@/features/reports/ReportHistory'
import { Toaster } from '@/shared/components/Toaster'
import { useToastStore } from '@/shared/components/toastStore'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: os vinculos do card aberto, e onde eles aparecem.
 *
 * - **Agrupados pelo tipo, vistos do card aberto**: "Bloqueado por", "Duplicado de"...
 * - **Desfazer manda o vinculo**, e quem abriu o card rele ele — o duplicado pode ter
 *   voltado do arquivo.
 * - **Vincular procura o card pela busca**, sem o proprio card nem os ja vinculados, e
 *   manda o tipo escolhido. O tipo comeca em "esta relacionado a", que nao tem
 *   consequencia.
 * - **O duplicado confirma antes**: escolher o card troca a lista pela frase do que vai
 *   acontecer — quem vai para o arquivo, e quem relatou passando a acompanhar o outro —,
 *   com "Marcar como duplicado" e "Voltar". O Enter de resultado unico vincula na hora
 *   os outros tipos, e nunca o duplicado.
 * - **No card arquivado, so se le e se desfaz** — e o caminho de volta do duplicado.
 * - **O bloqueado diz por quem**, com a palavra para quem nao ve a cor.
 * - **O encerramento do original avisa quantas pessoas a mais vao ler o motivo.**
 * - **O historico conta o vinculo** com o numero do outro card.
 */
const dublê = vi.hoisted(() => ({
  vinculos: vi.fn(),
  vincular: vi.fn(),
  desfazer: vi.fn(),
  listar: vi.fn(),
  historico: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectReportService: {
      listLinks: dublê.vinculos,
      link: dublê.vincular,
      unlink: dublê.desfazer,
      listReports: dublê.listar,
      listReportHistory: dublê.historico,
    },
  }
})

function card(extra: Partial<ReportSummaryViewModel> = {}): ReportSummaryViewModel {
  return {
    PublicId: 'aberto',
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

function vinculo(
  PublicId: string,
  Type: CardLinkViewModel['Type'],
  numero: number,
  Headline: string,
  extra: Partial<CardLinkViewModel['Card']> = {},
): CardLinkViewModel {
  return {
    PublicId,
    Type,
    Card: {
      PublicId: `c-${numero}`,
      Kind: 'Team',
      Number: numero,
      Headline,
      StatePublicId: 's-2',
      StateName: 'Fazendo',
      Finished: false,
      ArchivedAt: null,
      ...extra,
    },
  }
}

instalarRemendosDoRadix()

function montar(aberto: ReportSummaryViewModel, aoMudar = vi.fn()) {
  render(
    <MemoryRouter>
      <CardLinks projectPublicId="p-1" card={aberto} colunas={null} versao={0} aoMudar={aoMudar} />
      <Toaster />
    </MemoryRouter>,
  )
  return aoMudar
}

/** Abre o "Vincular", escolhe o tipo e procura: devolve a lista do que achou. */
async function procurar(tipo: string | null, busca: string) {
  fireEvent.click(await screen.findByRole('button', { name: '+ Vincular' }))
  if (tipo) await escolherNoSelect(screen, fireEvent, 'O card #10', tipo)
  fireEvent.change(screen.getByLabelText('Card'), { target: { value: busca } })
  return screen.findByRole('list', { name: 'Cards encontrados' })
}

describe('os vinculos do card aberto', () => {
  afterEach(() => {
    cleanup()
    useToastStore.setState({ toasts: [], hosts: [] })
  })
  beforeEach(() => {
    for (const dublé of Object.values(dublê)) dublé.mockReset()
  })

  it('agrupados pelo tipo, vistos do card aberto, com o arquivado marcado', async () => {
    dublê.vinculos.mockResolvedValue([
      vinculo('v-1', 'RelatesTo', 12, 'Rever o texto'),
      vinculo('v-2', 'BlockedBy', 11, 'Trocar o gateway'),
      vinculo('v-3', 'DuplicatedBy', 13, 'Cupom não funciona', {
        ArchivedAt: '2026-10-03T12:00:00Z',
      }),
    ])
    montar(card())

    const bloqueado = await screen.findByText('Bloqueado por')
    const grupos = screen.getAllByRole('heading', { level: 4 }).map((titulo) => titulo.textContent)
    expect(grupos).toEqual(['Duplicados deste', 'Bloqueado por', 'Relacionado a'])
    expect(within(bloqueado.parentElement as HTMLElement).getByRole('link').textContent).toBe(
      'Trocar o gateway',
    )
    expect(screen.getByText('Arquivado')).toBeTruthy()
    expect(dublê.vinculos).toHaveBeenCalledWith('p-1', 'aberto')
  })

  it('desfazer manda o vinculo, e quem abriu o card relê ele', async () => {
    dublê.vinculos.mockResolvedValue([vinculo('v-2', 'DuplicateOf', 11, 'O original')])
    dublê.desfazer.mockResolvedValue([])
    const aoMudar = montar(card({ ArchivedAt: '2026-10-03T12:00:00Z' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer o vínculo com #11' }))

    await waitFor(() => expect(dublê.desfazer).toHaveBeenCalledWith('p-1', 'aberto', 'v-2'))
    await waitFor(() => expect(aoMudar).toHaveBeenCalled())
    expect(await screen.findByText('Sem vínculos.')).toBeTruthy()
  })

  it('no card arquivado, sem o "Vincular"', async () => {
    dublê.vinculos.mockResolvedValue([])
    montar(card({ ArchivedAt: '2026-10-03T12:00:00Z' }))
    await screen.findByText('Sem vínculos.')
    expect(screen.queryByRole('button', { name: '+ Vincular' })).toBeNull()
  })

  it('vincular procura pela busca, sem o proprio card nem os ja vinculados, e manda o tipo', async () => {
    dublê.vinculos.mockResolvedValue([vinculo('v-1', 'RelatesTo', 12, 'Rever o texto')])
    dublê.listar.mockResolvedValue({
      reports: [
        card(),
        card({ PublicId: 'c-12', Number: 12, Title: 'Rever o texto' }),
        card({ PublicId: 'c-14', Number: 14, Title: 'Testar no Safari' }),
      ],
      total: 3,
    })
    dublê.vincular.mockResolvedValue([vinculo('v-9', 'BlockedBy', 14, 'Testar no Safari')])
    const aoMudar = montar(card())

    fireEvent.click(await screen.findByRole('button', { name: '+ Vincular' }))
    // O tipo comeca em "esta relacionado a", que nao tem consequencia: o bloqueio se escolhe.
    expect(screen.getByRole('combobox', { name: 'O card #10' }).textContent).toContain(
      'está relacionado a',
    )
    await escolherNoSelect(screen, fireEvent, 'O card #10', 'é bloqueado por')
    fireEvent.change(screen.getByLabelText('Card'), { target: { value: 'safari' } })

    const achados = await screen.findByRole('list', { name: 'Cards encontrados' })
    const opcoes = within(achados)
      .getAllByRole('button')
      .map((botao) => botao.textContent)
    expect(opcoes).toEqual(['#14Testar no Safari'])
    expect(dublê.listar).toHaveBeenCalledWith(
      'p-1',
      1,
      null,
      false,
      expect.objectContaining({
        pageSize: 8,
        filters: expect.objectContaining({ search: 'safari' }),
      }),
    )

    fireEvent.click(within(achados).getByRole('button'))
    await waitFor(() =>
      expect(dublê.vincular).toHaveBeenCalledWith('p-1', 'aberto', {
        Type: 'BlockedBy',
        TargetPublicId: 'c-14',
      }),
    )
    await waitFor(() => expect(aoMudar).toHaveBeenCalled())
    expect(await screen.findByText('Bloqueado por')).toBeTruthy()
  })
})

describe('marcar como duplicado confirma antes', () => {
  afterEach(() => {
    cleanup()
    useToastStore.setState({ toasts: [], hosts: [] })
  })
  beforeEach(() => {
    for (const dublé of Object.values(dublê)) dublé.mockReset()
    dublê.vinculos.mockResolvedValue([])
  })

  it('"e duplicado de": a frase diz quem vai para o arquivo; "Voltar" volta a busca, e "Marcar como duplicado" vincula', async () => {
    dublê.listar.mockResolvedValue({
      reports: [card({ PublicId: 'c-14', Number: 14, Title: 'Cupom não funciona' })],
      total: 1,
    })
    dublê.vincular.mockResolvedValue([vinculo('v-9', 'DuplicateOf', 14, 'Cupom não funciona')])
    // O card aberto e um relato: quem o escreveu passa a acompanhar o original.
    const aoMudar = montar(card({ Kind: 'Report', Title: null, Text: 'O cupom nao entra.' }))

    fireEvent.click(await screen.findByRole('button', { name: '+ Vincular' }))
    await escolherNoSelect(screen, fireEvent, 'O card #10', 'é duplicado de')
    // O que o tipo faz, dito antes de escolher o card.
    expect(screen.getByText(/^Este card vai para o arquivo\./)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Card'), { target: { value: 'cupom' } })
    const achados = await screen.findByRole('list', { name: 'Cards encontrados' })
    fireEvent.click(within(achados).getByRole('button'))

    expect(
      screen.getByText(
        '#10 vai para o arquivo como duplicado de #14. Quem relatou passa a acompanhar o #14 e recebe o desfecho dele.',
      ),
    ).toBeTruthy()
    const marcar = screen.getByRole('button', { name: 'Marcar como duplicado' })
    await waitFor(() => expect(document.activeElement).toBe(marcar))
    expect(dublê.vincular).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    const busca = screen.getByLabelText('Card')
    await waitFor(() => expect(document.activeElement).toBe(busca))
    expect((busca as HTMLInputElement).value).toBe('cupom')
    expect(dublê.vincular).not.toHaveBeenCalled()

    fireEvent.click(
      within(await screen.findByRole('list', { name: 'Cards encontrados' })).getByRole('button'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como duplicado' }))
    await waitFor(() =>
      expect(dublê.vincular).toHaveBeenCalledWith('p-1', 'aberto', {
        Type: 'DuplicateOf',
        TargetPublicId: 'c-14',
      }),
    )
    await waitFor(() => expect(aoMudar).toHaveBeenCalled())
    expect(await screen.findByText('Duplicado de')).toBeTruthy()
  })

  it('"tem como duplicado": o escolhido vai para o arquivo; o Enter com um resultado so nao marca', async () => {
    dublê.listar.mockResolvedValue({
      reports: [
        card({
          PublicId: 'c-15',
          Number: 15,
          Kind: 'Report',
          Title: null,
          Text: 'Cupom recusado no app',
        }),
      ],
      total: 1,
    })
    montar(card())

    await procurar('tem como duplicado', 'cupom')
    fireEvent.submit(screen.getByLabelText('Card').closest('form') as HTMLFormElement)
    expect(dublê.vincular).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Marcar como duplicado' })).toBeNull()

    fireEvent.click(
      within(screen.getByRole('list', { name: 'Cards encontrados' })).getByRole('button'),
    )
    expect(
      screen.getByText(
        '#15 vai para o arquivo como duplicado de #10. Quem relatou passa a acompanhar o #10 e recebe o desfecho dele.',
      ),
    ).toBeTruthy()
  })

  it('o duplicado do time vai para o arquivo sem a frase de quem relatou', async () => {
    dublê.listar.mockResolvedValue({
      reports: [card({ PublicId: 'c-16', Number: 16, Title: 'Rever o cupom' })],
      total: 1,
    })
    montar(card())

    const achados = await procurar('tem como duplicado', 'cupom')
    fireEvent.click(within(achados).getByRole('button'))
    expect(screen.getByText('#16 vai para o arquivo como duplicado de #10.')).toBeTruthy()
    expect(screen.queryByText(/Quem relatou passa a acompanhar/)).toBeNull()
  })

  it('"esta relacionado a": o Enter com um resultado so vincula na hora, sem perguntar', async () => {
    dublê.listar.mockResolvedValue({
      reports: [card({ PublicId: 'c-12', Number: 12, Title: 'Rever o texto' })],
      total: 1,
    })
    dublê.vincular.mockResolvedValue([vinculo('v-3', 'RelatesTo', 12, 'Rever o texto')])
    montar(card())

    await procurar(null, 'texto')
    fireEvent.submit(screen.getByLabelText('Card').closest('form') as HTMLFormElement)
    await waitFor(() =>
      expect(dublê.vincular).toHaveBeenCalledWith('p-1', 'aberto', {
        Type: 'RelatesTo',
        TargetPublicId: 'c-12',
      }),
    )
    expect(await screen.findByText('#10 está relacionado a #12.')).toBeTruthy()
  })
})

describe('onde os vinculos aparecem', () => {
  afterEach(cleanup)

  it('o bloqueado diz por quem, com a palavra', () => {
    render(<BlockedMark card={{ BlockedBy: [2, 5, 9] }} />)
    expect(screen.getByText('Bloqueado por #2, #5 e #9')).toBeTruthy()
    cleanup()
    const { container } = render(<BlockedMark card={{ BlockedBy: [] }} />)
    expect(container.textContent).toBe('')
  })

  it('o encerramento do original avisa quantas pessoas a mais vao ler o motivo', () => {
    render(
      <CloseReportDialog
        coluna={null}
        encerrando={false}
        maisLeitores={2}
        aoConfirmar={vi.fn()}
        aoCancelar={vi.fn()}
      />,
    )
    expect(
      screen.getByText(
        'Mais 2 pessoas vão ler este motivo: os relatos duplicados deste recebem o mesmo desfecho.',
      ),
    ).toBeTruthy()
  })

  it('o historico conta o vinculo com o numero do outro card', async () => {
    const linha = (
      PublicId: string,
      Type: ReportHistoryEntryViewModel['Type'],
      From: string,
      To: string,
    ): ReportHistoryEntryViewModel => ({
      PublicId,
      Type,
      AuthorName: 'Ana',
      FromStateName: null,
      ToStateName: null,
      OccurredAt: '2026-10-03T12:00:00.000Z',
      From,
      To,
      Added: [],
      Removed: [],
      TitleRestored: null,
    })
    dublê.historico.mockResolvedValue([
      linha('h-1', 'CardLinked', 'duplicate_of', '6'),
      linha('h-2', 'CardUnlinked', 'duplicate_of', '6'),
      linha('h-3', 'CardLinked', 'blocked_by', '4'),
      linha('h-4', 'CardLinked', 'tipo_novo', '4'),
    ])
    render(<ReportHistory projectPublicId="p-1" reportPublicId="aberto" versao={0} />)

    expect(await screen.findByText('Marcado como duplicado de #6')).toBeTruthy()
    expect(screen.getByText('Deixou de ser duplicado de #6')).toBeTruthy()
    expect(screen.getByText('Bloqueado por #4')).toBeTruthy()
    expect(screen.getByText('Ganhou um vínculo')).toBeTruthy()
  })
})
