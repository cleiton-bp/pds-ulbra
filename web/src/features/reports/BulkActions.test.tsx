// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportStateCountViewModel, ReportSummaryViewModel } from '@/contracts'
import { PanelError } from '@/data/errors'
import {
  BulkActions,
  BulkFailures,
  type LoteFeito,
  useBulkUndo,
} from '@/features/reports/BulkActions'
import { ReportsTable } from '@/features/reports/ReportsTable'
import { useToastStore } from '@/shared/components/toastStore'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

instalarRemendosDoRadix()

/**
 * O QUE ESTES TESTES TRAVAM: as acoes em lote da lista.
 *
 * - **Card por card, pelas rotas de sempre**, na ordem da lista; o card que ja esta
 *   como se pediu fica de fora.
 * - **O que nao mudou aparece com o porque**, e os outros ficam mudados.
 * - **A coluna que encerra pergunta uma vez**, e so os relatos abertos levam o desfecho.
 * - **Por etiqueta, a que o card tem fica**; "Remover etiqueta" so oferece as que estao
 *   na selecao. O aviso diz qual e em quantos ("Etiqueta ux adicionada a 2 cards.").
 * - **A subtarefa nao vai sozinha para a sprint.**
 * - **"Desfazer" no aviso** (L-03): cada card volta ao valor de antes, card por card,
 *   pelas mesmas rotas — a etiqueta pela contraria, sobre o que o card tem na hora; o
 *   que nao voltar aparece com o porque. Mover para a coluna que encerra nao desfaz, nem
 *   o card que estava sem coluna.
 * - **"Selecionar os N"** (L-04): com a pagina toda marcada e mais na lista, a barra diz
 *   "nesta pagina" e oferece o resto; a leitura que falha diz o porque, e o botao volta.
 * - **As caixas da lista**: o cabecalho marca os da pagina, a caixa nao abre o card, e o
 *   Shift (clique ou espaco) marca do ultimo ate ali (L-11).
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

const COLUNAS: ReportStateCountViewModel[] = [
  { StatePublicId: 's-1', StateName: 'Análise', IsActive: true, ClosesReport: false, Total: 3 },
  { StatePublicId: 's-2', StateName: 'Feito', IsActive: true, ClosesReport: true, Total: 0 },
]

const ANA = { UserPublicId: 'u-ana', Name: 'Ana', AvatarUrl: null, InTeam: true }
const URGENTE = { PublicId: 'pr-u', Name: 'Urgente', Color: 'Red' as const, IsActive: true }

function montar(
  cards: ReportSummaryViewModel[],
  sprints = false,
  extra: Partial<Parameters<typeof BulkActions>[0]> = {},
) {
  const aoTerminar = vi.fn()
  render(
    <BulkActions
      projectPublicId="p-1"
      cards={cards}
      colunas={COLUNAS}
      {...extra}
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

/** Os avisos que a barra deu, do mais velho para o mais novo. */
const avisos = () => useToastStore.getState().toasts

describe('as acoes em lote', () => {
  afterEach(cleanup)
  beforeEach(() => {
    for (const d of Object.values(dublê)) d.mockReset()
    useToastStore.setState({ toasts: [] })
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

  it('tirar da coluna que encerra pergunta antes de reabrir; o confirmado so anda; o reaberto fica fora do "Desfazer"', async () => {
    dublê.mover.mockResolvedValue({})
    const aoDesfazer = vi.fn()
    const { aoTerminar } = montar(
      [
        card('r1', { Kind: 'Report', StatePublicId: 's-2', StateName: 'Feito', Closed: true }),
        card('r2', {
          Kind: 'Report',
          StatePublicId: 's-2',
          StateName: 'Feito',
          Closed: true,
          ClosureConfirmed: true,
        }),
        card('c3', { StatePublicId: 's-2', StateName: 'Feito' }),
      ],
      false,
      { aoDesfazer },
    )

    // Cancelar nao grava nada.
    await abrir('Mover para')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Análise' }))
    let pergunta = await screen.findByRole('alertdialog', { name: 'Reabrir o relato #1?' })
    expect(
      within(pergunta).getByText(
        'Tirar o #1 de Feito reabre o relato: quem relatou volta a ver o relato em andamento, e o motivo do encerramento sai da página de acompanhamento.',
      ),
    ).toBeTruthy()
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(dublê.mover).not.toHaveBeenCalled()

    await abrir('Mover para')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Análise' }))
    pergunta = await screen.findByRole('alertdialog', { name: 'Reabrir o relato #1?' })
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Reabrir e mover' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalled())
    expect(dublê.mover).toHaveBeenCalledTimes(3)

    // O reaberto nao entra na volta, e o aviso diz isso em vez de prometer.
    const aviso = avisos().at(-1)
    expect(aviso?.message).toBe(
      'Mover para Análise — 3 cards. O relato reaberto fica fora do "Desfazer": encerrar de novo pede o desfecho.',
    )
    expect(aviso?.action?.label).toBe('Desfazer')
    const lote: LoteFeito = aoTerminar.mock.calls[0]?.[0]
    expect(lote.voltas.map((volta) => volta.card.PublicId)).toEqual(['r2', 'c3'])
  })

  it('dois relatos encerrados: "Reabrir 2 relatos?"; so eles e mais nada, e o aviso diz que nao voltam', async () => {
    dublê.mover.mockResolvedValue({})
    const { aoTerminar } = montar(
      [
        card('r1', { Kind: 'Report', StatePublicId: 's-2', Closed: true }),
        card('r2', { Kind: 'Report', StatePublicId: 's-2', Closed: true }),
      ],
      false,
      { aoDesfazer: vi.fn() },
    )
    await abrir('Mover para')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Análise' }))
    const pergunta = await screen.findByRole('alertdialog', { name: 'Reabrir 2 relatos?' })
    expect(
      within(pergunta).getByText(
        'Tirar os 2 relatos de Feito reabre cada um: quem relatou volta a ver o relato em andamento, e o motivo do encerramento sai da página de acompanhamento.',
      ),
    ).toBeTruthy()
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Reabrir e mover' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalled())
    expect(avisos().at(-1)?.message).toBe(
      'Mover para Análise — 2 cards. Os 2 relatos foram reabertos: encerrar de novo pede o desfecho.',
    )
    expect(avisos().at(-1)?.action).toBeUndefined()
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
    await abrir('Adicionar etiqueta')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'ux' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalledTimes(1))
    expect(dublê.etiquetas).toHaveBeenCalledWith('p-1', 'c1', { LabelPublicIds: ['l-bug', 'l-ux'] })
    expect(dublê.etiquetas).toHaveBeenCalledWith('p-1', 'c2', { LabelPublicIds: ['l-bug', 'l-ux'] })
    expect(avisos().at(-1)?.message).toBe('Etiqueta ux adicionada a 2 cards.')

    dublê.etiquetas.mockClear()
    dublê.lerCard.mockImplementation(async (_p: string, id: string) =>
      card(id, { Labels: id === 'c1' ? [bug, ux] : [] }),
    )
    await abrir('Remover etiqueta')
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: 'ux' })).toBeNull()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'bug' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalledTimes(2))
    expect(dublê.etiquetas).toHaveBeenCalledTimes(1)
    // Tira so a escolhida, e deixa a que o card ganhou no meio.
    expect(dublê.etiquetas).toHaveBeenCalledWith('p-1', 'c1', { LabelPublicIds: ['l-ux'] })
    // c2 nao tinha "bug" na tela: ficou de fora, e o aviso conta.
    expect(avisos().at(-1)?.message).toBe('Etiqueta bug removida de 1 card (1 já estava assim).')
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

  it('o dialogo do que nao mudou: com o porque, o link de cada card, e sem dizer que os outros mudaram quando nenhum mudou', () => {
    const falhas = [{ card: card('c3'), motivo: 'Card arquivado.' }]
    const aoFechar = vi.fn()
    // Na tela de Trabalho: o link do card e relativo a rota dela.
    const naTela = (no: ReactNode) => (
      <MemoryRouter initialEntries={['/projects/p-1/work']}>
        <Routes>
          <Route path="/projects/:id/work" element={no} />
        </Routes>
      </MemoryRouter>
    )
    const { rerender } = render(
      naTela(<BulkFailures mudaram={2} falhas={falhas} aoFechar={aoFechar} />),
    )
    const dialogo = screen.getByRole('dialog', { name: '1 card não mudou' })
    expect(within(dialogo).getByText('Card arquivado.')).toBeTruthy()
    expect(within(dialogo).getByText('#3')).toBeTruthy()
    expect(within(dialogo).getByText('Os outros mudaram. Estes ficaram como estavam:')).toBeTruthy()

    rerender(naTela(<BulkFailures mudaram={0} falhas={falhas} aoFechar={aoFechar} />))
    expect(screen.getByText('Estes ficaram como estavam:')).toBeTruthy()

    // As que nao voltaram no "Desfazer" dizem isso.
    rerender(naTela(<BulkFailures mudaram={1} falhas={falhas} desfazendo aoFechar={aoFechar} />))
    expect(screen.getByRole('dialog', { name: '1 card não voltou' })).toBeTruthy()
    expect(
      screen.getByText('Os outros voltaram como estavam. Estes ficaram como estão:'),
    ).toBeTruthy()

    // Cada card abre dali, e abrir fecha o dialogo.
    const link = screen.getByRole('link', { name: /#3/ })
    expect(link.getAttribute('href')).toBe('/projects/p-1/work/c3')
    fireEvent.click(link)
    expect(aoFechar).toHaveBeenCalled()
  })

  it('sem sprints ligadas, nao ha a acao de sprint', async () => {
    montar([card('c1')])
    expect(await screen.findByRole('button', { name: 'Responsável' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sprint' })).toBeNull()
  })

  it('o responsavel: quem olha primeiro, com "(voce)"; o aviso conta os que ja estavam assim', async () => {
    dublê.time.mockResolvedValue([
      { ...ANA, Role: 'Member', IsYou: false },
      {
        UserPublicId: 'u-eu',
        Name: 'Bia',
        AvatarUrl: null,
        InTeam: true,
        Role: 'Owner',
        IsYou: true,
      },
    ])
    dublê.responsavel.mockResolvedValue({})
    const { aoTerminar } = montar([card('c1'), card('c2', { Assignee: ANA }), card('c3')])
    await abrir('Responsável')
    const itens = within(await screen.findByRole('menu')).getAllByRole('menuitem')
    expect(itens.map((item) => item.textContent)).toEqual(['Bia (você)', 'Ana', 'Sem responsável'])
    fireEvent.click(itens[1] as HTMLElement)
    await waitFor(() => expect(aoTerminar).toHaveBeenCalled())
    expect(avisos().at(-1)?.message).toBe('Responsável: Ana — 2 cards (1 já estava assim).')
  })

  it('"Desfazer" no aviso: entrega a tela o lote, com a volta de cada card que mudou', async () => {
    dublê.responsavel.mockResolvedValue({})
    const aoDesfazer = vi.fn()
    const BRUNO = { UserPublicId: 'u-bruno', Name: 'Bruno', AvatarUrl: null, InTeam: true }
    const { aoTerminar } = montar([card('c1'), card('c2', { Assignee: BRUNO })], false, {
      aoDesfazer,
    })
    await abrir('Responsável')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ana' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalled())

    const aviso = avisos().at(-1)
    expect(aviso?.message).toBe('Responsável: Ana — 2 cards.')
    expect(aviso?.action?.label).toBe('Desfazer')
    act(() => aviso?.action?.run())
    const lote: LoteFeito = aoDesfazer.mock.calls[0]?.[0]
    expect(lote.voltas.map((volta) => volta.card.PublicId)).toEqual(['c1', 'c2'])

    // Cada volta devolve o valor de antes pela mesma rota: c1 sem ninguem, c2 com o Bruno.
    // Antes, rele o card: ele ainda esta como o lote deixou.
    dublê.lerCard.mockImplementation(async (_projeto: string, id: string) =>
      card(id, { Assignee: ANA }),
    )
    dublê.responsavel.mockClear()
    for (const volta of lote.voltas) await volta.desfazer()
    expect(dublê.responsavel.mock.calls).toEqual([
      ['p-1', 'c1', { UserPublicId: null }],
      ['p-1', 'c2', { UserPublicId: 'u-bruno' }],
    ])
  })

  it('a volta da prioridade, da etiqueta, da coluna e da sprint e a contraria, card por card', async () => {
    dublê.prioridade.mockResolvedValue({})
    dublê.mover.mockResolvedValue({})
    dublê.sprint.mockResolvedValue({})
    const aoDesfazer = vi.fn()
    const BAIXA = { PublicId: 'pr-b', Name: 'Baixa', Color: 'Gray' as const, IsActive: true }
    const { aoTerminar } = montar(
      [
        card('c1', {
          Priority: BAIXA,
          Sprint: { PublicId: 'sp-1', Name: 'Sprint 1', State: 'Planned' },
        }),
      ],
      true,
      {
        aoDesfazer,
        colunas: [
          ...COLUNAS,
          {
            ...COLUNAS[0],
            StatePublicId: 's-3',
            StateName: 'Fazendo',
          } as ReportStateCountViewModel,
        ],
      },
    )
    const ultimoLote = (): LoteFeito => aoDesfazer.mock.calls.at(-1)?.[0]

    await abrir('Prioridade')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Urgente' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalledTimes(1))
    act(() => avisos().at(-1)?.action?.run())
    dublê.lerCard.mockResolvedValueOnce(card('c1', { Priority: URGENTE }))
    await ultimoLote().voltas[0]?.desfazer()
    expect(dublê.prioridade).toHaveBeenLastCalledWith('p-1', 'c1', { PriorityPublicId: 'pr-b' })

    await abrir('Mover para')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Fazendo' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalledTimes(2))
    act(() => avisos().at(-1)?.action?.run())
    dublê.lerCard.mockResolvedValueOnce(card('c1', { StatePublicId: 's-3' }))
    await ultimoLote().voltas[0]?.desfazer()
    expect(dublê.mover).toHaveBeenLastCalledWith('p-1', 'c1', { StatePublicId: 's-1' })

    await abrir('Sprint')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Backlog' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalledTimes(3))
    act(() => avisos().at(-1)?.action?.run())
    dublê.lerCard.mockResolvedValueOnce(card('c1', { Sprint: null }))
    await ultimoLote().voltas[0]?.desfazer()
    expect(dublê.sprint).toHaveBeenLastCalledWith('p-1', 'c1', { SprintPublicId: 'sp-1' })
  })

  it('mover para a coluna que encerra nao oferece "Desfazer": voltar reabriria o relato', async () => {
    dublê.mover.mockResolvedValue({})
    const aoDesfazer = vi.fn()
    const { aoTerminar } = montar([card('c1'), card('c2')], false, { aoDesfazer })
    await abrir('Mover para')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Feito' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalled())
    expect(aoTerminar.mock.calls[0]?.[0].voltas).toEqual([])
    expect(avisos().at(-1)?.message).toBe('Mover para Feito — 2 cards.')
    expect(avisos().at(-1)?.action).toBeUndefined()
  })

  it('nada mudou porque todos ja estavam assim: o aviso diz, sem "Desfazer"', async () => {
    const { aoTerminar } = montar([card('c1', { Assignee: ANA })], false, { aoDesfazer: vi.fn() })
    await abrir('Responsável')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ana' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalled())
    expect(dublê.responsavel).not.toHaveBeenCalled()
    expect(avisos().at(-1)?.message).toBe('Os cards já estavam assim.')
    expect(avisos().at(-1)?.action).toBeUndefined()
  })

  it('a pagina toda marcada e mais na lista: diz "nesta pagina" e oferece selecionar os N', async () => {
    let terminar = () => {}
    const aoSelecionarTodos = vi.fn(
      () =>
        new Promise<void>((pronto) => {
          terminar = pronto
        }),
    )
    const vinte = Array.from({ length: 20 }, (_, i) => card(`c${i + 1}`))
    montar(vinte, false, { carregados: 20, total: 34, comFiltro: true, aoSelecionarTodos })
    expect(screen.getByText('20 selecionados nesta página.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar os 34 que passam nos filtros' }))
    expect(aoSelecionarTodos).toHaveBeenCalledTimes(1)
    // Enquanto le o resto, diz, e os menus nao abrem.
    expect(screen.getByRole('button', { name: 'Carregando…' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Responsável' }).getAttribute('aria-disabled')).toBe(
      'true',
    )
    await act(async () => terminar())
    expect(screen.queryByRole('button', { name: 'Carregando…' })).toBeNull()
    cleanup()

    // Sem filtro, "todos os N"; com tudo na tela, nada a oferecer.
    montar(vinte, false, { carregados: 20, total: 34, aoSelecionarTodos })
    expect(screen.getByRole('button', { name: 'Selecionar todos os 34' })).toBeTruthy()
    cleanup()
    montar(vinte, false, { carregados: 20, total: 20, aoSelecionarTodos })
    expect(screen.getByText('20 selecionados')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Selecionar/ })).toBeNull()
  })

  it('a lista relendo: os menus nao abrem, e o botao fica (o foco nao cai)', async () => {
    montar([card('c1')], false, { bloqueado: true })
    const botao = screen.getByRole('button', { name: 'Responsável' })
    expect(botao.getAttribute('aria-disabled')).toBe('true')
    expect(botao).toHaveProperty('disabled', false)
    await abrir('Responsável')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('"Mover para" com a contagem falhando diz, e tenta de novo dali', async () => {
    const aoRecarregarColunas = vi.fn()
    montar([card('c1')], false, { colunas: null, colunasFalharam: true, aoRecarregarColunas })
    await abrir('Mover para')
    expect(await screen.findByText('Não deu para carregar as colunas agora.')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tentar de novo' }))
    expect(aoRecarregarColunas).toHaveBeenCalled()
  })

  it('a volta da etiqueta e a contraria — tira a que adicionou, poe de volta a que removeu —, sobre o que o card tem agora', async () => {
    const bug = { PublicId: 'l-bug', Name: 'bug', Color: 'Red' as const }
    const ux = { PublicId: 'l-ux', Name: 'ux', Color: 'Blue' as const }
    dublê.etiquetas.mockResolvedValue({})
    const aoDesfazer = vi.fn()
    const ultimoLote = (): LoteFeito => aoDesfazer.mock.calls.at(-1)?.[0]

    dublê.lerCard.mockResolvedValue(card('c1'))
    const { aoTerminar } = montar([card('c1')], false, { aoDesfazer })
    await abrir('Adicionar etiqueta')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'ux' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalledTimes(1))
    expect(dublê.etiquetas).toHaveBeenLastCalledWith('p-1', 'c1', { LabelPublicIds: ['l-ux'] })
    act(() => avisos().at(-1)?.action?.run())
    // Ate o "Desfazer", outra pessoa pos "bug": a volta tira so a "ux", e a "bug" fica.
    dublê.lerCard.mockResolvedValue(card('c1', { Labels: [ux, bug] }))
    await ultimoLote().voltas[0]?.desfazer()
    expect(dublê.etiquetas).toHaveBeenLastCalledWith('p-1', 'c1', { LabelPublicIds: ['l-bug'] })
    cleanup()

    dublê.lerCard.mockResolvedValue(card('c1', { Labels: [bug] }))
    const removendo = montar([card('c1', { Labels: [bug] })], false, { aoDesfazer })
    await abrir('Remover etiqueta')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'bug' }))
    await waitFor(() => expect(removendo.aoTerminar).toHaveBeenCalledTimes(1))
    expect(dublê.etiquetas).toHaveBeenLastCalledWith('p-1', 'c1', { LabelPublicIds: [] })
    act(() => avisos().at(-1)?.action?.run())
    dublê.lerCard.mockResolvedValue(card('c1', { Labels: [ux] }))
    await ultimoLote().voltas[0]?.desfazer()
    // A removida volta, junto da que o card ganhou no meio.
    expect(dublê.etiquetas).toHaveBeenLastCalledWith('p-1', 'c1', {
      LabelPublicIds: ['l-ux', 'l-bug'],
    })
  })

  it('mover o card que estava sem coluna nao oferece "Desfazer": nao ha "sem coluna" para onde voltar', async () => {
    dublê.mover.mockResolvedValue({})
    const aoDesfazer = vi.fn()
    const { aoTerminar } = montar([card('c1', { StatePublicId: null, StateName: null })], false, {
      aoDesfazer,
    })
    await abrir('Mover para')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Análise' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalled())
    expect(dublê.mover).toHaveBeenCalledWith('p-1', 'c1', { StatePublicId: 's-1' })
    expect(aoTerminar.mock.calls[0]?.[0].voltas).toEqual([])
    expect(avisos().at(-1)?.message).toBe('Mover para Análise — 1 card.')
    expect(avisos().at(-1)?.action).toBeUndefined()
  })

  it('"Selecionar os N" que falha diz o porque, e o botao volta para tentar de novo', async () => {
    const aoSelecionarTodos = vi.fn(async () => {
      throw new PanelError('rede', 0)
    })
    const vinte = Array.from({ length: 20 }, (_, i) => card(`c${i + 1}`))
    montar(vinte, false, { carregados: 20, total: 34, aoSelecionarTodos })
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar todos os 34' }))

    await waitFor(() => expect(avisos().at(-1)?.tone).toBe('danger'))
    expect(avisos().at(-1)?.message).toBe(
      'Sem conexão com o servidor agora. Confira a internet e tente de novo — nada se perdeu.',
    )
    // Nada fica preso em "Carregando…": o botao volta, e os menus abrem de novo.
    expect(screen.getByRole('button', { name: 'Selecionar todos os 34' })).toBeTruthy()
    expect(screen.getByText('20 selecionados nesta página.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Responsável' }).getAttribute('aria-disabled'),
    ).toBeNull()
  })
})

describe('o "Desfazer" do lote', () => {
  afterEach(cleanup)
  beforeEach(() => useToastStore.setState({ toasts: [] }))

  const volta = (id: string, desfazer: () => Promise<unknown>) => ({ card: card(id), desfazer })

  it('devolve card por card, mostra o andamento, e no fim avisa e rele a lista', async () => {
    const depois = vi.fn()
    const aoFalhar = vi.fn()
    const pedidos: (() => void)[] = []
    const esperando = () => new Promise<void>((pronto) => pedidos.push(pronto))
    const { result } = renderHook(() => useBulkUndo(depois, aoFalhar))

    let fim: Promise<void> = Promise.resolve()
    act(() => {
      fim = result.current.desfazer({
        mudaram: 2,
        falhas: [],
        voltas: [volta('c1', esperando), volta('c2', esperando)],
      })
    })
    expect(result.current.desfazendo).toEqual({ feitos: 0, total: 2 })
    await act(async () => pedidos[0]?.())
    expect(result.current.desfazendo).toEqual({ feitos: 1, total: 2 })
    // Um de cada vez: o segundo so sai depois do primeiro.
    expect(pedidos).toHaveLength(2)
    await act(async () => {
      pedidos[1]?.()
      await fim
    })
    expect(result.current.desfazendo).toBeNull()
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe(
      'Desfeito: os 2 cards voltaram como estavam.',
    )
    expect(aoFalhar).not.toHaveBeenCalled()
    expect(depois).toHaveBeenCalledTimes(1)
  })

  it('o que nao voltou vai para o dialogo, com o porque; os outros voltam', async () => {
    const depois = vi.fn()
    const aoFalhar = vi.fn()
    const { result } = renderHook(() => useBulkUndo(depois, aoFalhar))
    await act(() =>
      result.current.desfazer({
        mudaram: 2,
        falhas: [],
        voltas: [
          volta('c1', async () => ({})),
          volta('c2', async () => {
            throw new PanelError('Card arquivado.', 409)
          }),
        ],
      }),
    )
    expect(aoFalhar).toHaveBeenCalledWith({
      mudaram: 1,
      falhas: [{ card: card('c2'), motivo: 'Card arquivado.' }],
    })
    expect(useToastStore.getState().toasts).toEqual([])
    expect(depois).toHaveBeenCalledTimes(1)
  })

  it('a volta confere o card: o que mudou depois do lote fica, e vai para o dialogo', async () => {
    dublê.responsavel.mockReset()
    dublê.lerCard.mockReset()
    dublê.time.mockResolvedValue([{ ...ANA, Role: 'Member' }])
    dublê.listaEtiquetas.mockResolvedValue([])
    dublê.listaPrioridades.mockResolvedValue([])
    dublê.responsavel.mockResolvedValue({})
    const aoDesfazer = vi.fn()
    const { aoTerminar } = montar([card('c1'), card('c2')], false, { aoDesfazer })
    await abrir('Responsável')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ana' }))
    await waitFor(() => expect(aoTerminar).toHaveBeenCalled())
    act(() => avisos().at(-1)?.action?.run())
    const lote: LoteFeito = aoDesfazer.mock.calls[0]?.[0]

    // Nos segundos do aviso, outra pessoa passou o c2 para o Bruno.
    const BRUNO = { UserPublicId: 'u-bruno', Name: 'Bruno', AvatarUrl: null, InTeam: true }
    dublê.lerCard.mockImplementation(async (_projeto: string, id: string) =>
      card(id, { Assignee: id === 'c2' ? BRUNO : ANA }),
    )
    dublê.responsavel.mockClear()
    const aoFalhar = vi.fn()
    const { result } = renderHook(() => useBulkUndo(vi.fn(), aoFalhar))
    await act(() => result.current.desfazer(lote))

    // So o c1 volta; o c2 fica com o Bruno, e o dialogo diz por que.
    expect(dublê.responsavel.mock.calls).toEqual([['p-1', 'c1', { UserPublicId: null }]])
    expect(aoFalhar).toHaveBeenCalledWith({
      mudaram: 1,
      falhas: [{ card: card('c2'), motivo: 'Mudou depois do lote, e ficou como está.' }],
    })
  })

  it('um card so: "o card voltou"; sem volta, nada', async () => {
    const depois = vi.fn()
    const { result } = renderHook(() => useBulkUndo(depois, vi.fn()))
    await act(() => result.current.desfazer({ mudaram: 0, falhas: [], voltas: [] }))
    expect(depois).not.toHaveBeenCalled()
    await act(() =>
      result.current.desfazer({ mudaram: 1, falhas: [], voltas: [volta('c1', async () => ({}))] }),
    )
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe(
      'Desfeito: o card voltou como estava.',
    )
  })
})

function Onde() {
  return <span data-testid="onde">{useLocation().pathname}</span>
}

describe('as caixas da lista', () => {
  afterEach(cleanup)

  it('o cabecalho marca os da pagina; com alguns, fica pela metade; a caixa nao abre o card', () => {
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
      name: 'Selecionar os cards desta página',
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
      name: 'Selecionar os cards desta página',
    }) as HTMLInputElement
    expect(cheio.checked).toBe(true)
    expect(cheio.indeterminate).toBe(false)
  })

  it('Shift com o clique, ou com o espaco, marca do ultimo marcado ate ali', () => {
    const definir = vi.fn()
    const cinco = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => card(id))
    render(
      <MemoryRouter>
        <ReportsTable
          reports={cinco}
          colunas={COLUNAS}
          soonDays={2}
          selecao={{ marcados: new Set(), definir }}
        />
      </MemoryRouter>,
    )
    const caixa = (n: number) =>
      screen.getByRole('checkbox', { name: new RegExp(`^Selecionar #${n}:`) })

    fireEvent.click(caixa(2))
    expect(definir).toHaveBeenLastCalledWith(['c2'], true)
    fireEvent.click(caixa(4), { shiftKey: true })
    expect(definir).toHaveBeenLastCalledWith(['c2', 'c3', 'c4'], true)

    // Pelo teclado: o clique que o espaco gera vem sem o Shift, e o da tecla vale.
    fireEvent.keyDown(caixa(1), { key: ' ', shiftKey: true })
    fireEvent.click(caixa(1))
    expect(definir).toHaveBeenLastCalledWith(['c1', 'c2', 'c3', 'c4'], true)

    // Sem Shift, so a propria.
    fireEvent.keyDown(caixa(5), { key: ' ' })
    fireEvent.click(caixa(5))
    expect(definir).toHaveBeenLastCalledWith(['c5'], true)
  })

  it('a linha marcada se destaca, alem da caixa', () => {
    render(
      <MemoryRouter>
        <ReportsTable
          reports={[card('c1'), card('c2')]}
          colunas={COLUNAS}
          soonDays={2}
          selecao={{ marcados: new Set(['c1']), definir: vi.fn() }}
        />
      </MemoryRouter>,
    )
    const linha = (n: number) =>
      screen.getByRole('checkbox', { name: new RegExp(`^Selecionar #${n}:`) }).closest('tr')
    expect(linha(1)?.getAttribute('data-selected')).toBe('true')
    expect(linha(2)?.getAttribute('data-selected')).toBeNull()
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
