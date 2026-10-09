// @vitest-environment jsdom

import type {
  DndContextProps,
  DragCancelEvent,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { type ComponentProps, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportSummaryViewModel, TeamMemberViewModel } from '@/contracts'
import { type BoardColumn, type BoardItems, cellKey } from '@/features/reports/board/boardState'
import { ReportsBoard } from '@/features/reports/board/ReportsBoard'
import type { Board } from '@/features/reports/board/useBoard'

/**
 * O QUE ESTES TESTES TRAVAM: o quadro com raias, como ele se desenha e o que a mao faz
 * nele.
 *
 * - **Uma raia por pessoa com card**, em ordem alfabetica, e "Sem responsavel" por
 *   ultimo; cada uma diz quantos cards tem, e recolhe.
 * - **Com o time, quem esta sem card tambem ganha raia (Q-09)**: compacta, no fim, antes
 *   de "Sem responsavel", com "Nome · 0 — solte um card aqui para passar a esta pessoa".
 *   Soltar nela passa o card a essa pessoa, e ela nao pula de lugar no meio do arraste.
 *   Sem o time, so as raias de quem tem card.
 * - **O cabecalho das colunas aparece uma vez**, numa fileira em cima de todas as raias,
 *   **com o "Criar" de cada coluna (Q-04)**; cada card fica na celula da coluna e da raia
 *   dele.
 * - **Com o card na mao, as raias nao crescem (Q-08)**: cada uma guarda a altura que
 *   tinha ao pegar, e solta ao soltar ou desistir.
 * - **No teclado (Q-11)**, a parada do Tab e o primeiro card na ordem das raias; na ponta
 *   da celula, as setas passam para a raia aberta de cima ou de baixo, e para os lados
 *   ficam na mesma raia.
 * - **Sem raias, o quadro de antes**: uma regiao por coluna.
 *
 * O arraste e testado pelos eventos do contexto do arraste: o teste diz sobre o que o
 * card esta. A conta de onde ele cai pela geometria fica na prova do navegador — o jsdom
 * nao mede nada.
 */
const dublê = vi.hoisted(() => ({ responsavel: vi.fn(), mover: vi.fn(), lugar: vi.fn() }))

/** As props que o quadro passa ao contexto do arraste. */
const arraste = vi.hoisted(() => ({ props: null as DndContextProps | null }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectReportService: {
      setAssignee: dublê.responsavel,
      moveReport: dublê.mover,
      setPosition: dublê.lugar,
    },
  }
})

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const real = await importOriginal<typeof import('@dnd-kit/core')>()
  const { createElement } = await import('react')
  return {
    ...real,
    // O contexto de verdade, com as props guardadas para o teste chamar os eventos.
    DndContext: (props: DndContextProps) => {
      arraste.props = props
      return createElement(real.DndContext, props)
    },
  }
})

const pessoa = (id: string, nome: string) => ({
  UserPublicId: id,
  Name: nome,
  AvatarUrl: null,
  InTeam: true,
})

/** Alguem do time do projeto, como a lista do time devolve. */
const membro = (id: string, nome: string): TeamMemberViewModel => ({
  UserPublicId: id,
  Name: nome,
  Email: null,
  AvatarUrl: null,
  Role: 'Member',
  IsAccountOwner: false,
  IsYou: false,
  JoinedAt: null,
})

/** O time inteiro: Ana e Bruno tem card; Carla e Elisa, nao. */
const TIME = [
  membro('u-b', 'Bruno'),
  membro('u-e', 'Elisa Souza'),
  membro('u-c', 'Carla'),
  membro('u-a', 'Ana'),
]

/** O que a raia de quem esta sem card diz ao lado do nome. */
const compacta = (nome: string) => `${nome}· 0 — solte um card aqui para passar a esta pessoa`

function card(id: string, extra: Partial<ReportSummaryViewModel> = {}) {
  return {
    PublicId: id,
    Kind: 'Team',
    Number: Number(id.replace(/\D/g, '')),
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
    ...extra,
  } as ReportSummaryViewModel
}

const coluna = (key: string, name: string): BoardColumn => ({
  key,
  name,
  accepts: true,
  retired: false,
  closes: false,
  last: false,
  total: 2,
})

function quadro(
  items: BoardItems = { 's-1': ['c1', 'c2'], 's-2': ['c3'] },
  cards: Record<string, ReportSummaryViewModel> = {
    c1: card('c1', { Assignee: pessoa('u-b', 'Bruno') }),
    c2: card('c2'),
    c3: card('c3', { StatePublicId: 's-2', Assignee: pessoa('u-a', 'Ana') }),
  },
): Board {
  const pronto = { total: 2, end: true, loading: false, loadingMore: false, failed: false }
  return {
    items,
    itemsRef: { current: items },
    setItems: vi.fn(),
    cards,
    state: { 's-1': pronto, 's-2': { ...pronto, total: 1 } },
    loadColumn: vi.fn(),
    loadMore: vi.fn(),
    reloadColumn: vi.fn(),
    adjustTotal: vi.fn(),
    apply: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    remoteChange: vi.fn(),
    reloadAll: vi.fn(),
    hold: () => () => {},
  } as unknown as Board
}

/**
 * O quadro de mentira com a ordem e os cards num estado: o card que a mao leva, ou que a
 * API devolve, redesenha o quadro. O `setItems` e o `update` de `quadro()` anotam.
 */
function QuadroVivo({
  inicial,
  ...props
}: { inicial: Board } & Omit<ComponentProps<typeof ReportsBoard>, 'board'>) {
  const [items, setItems] = useState(inicial.items)
  const [cards, setCards] = useState(inicial.cards)
  const board = {
    ...inicial,
    items,
    cards,
    setItems: (valor: BoardItems) => {
      inicial.itemsRef.current = valor
      setItems(valor)
      inicial.setItems(valor)
    },
    update: (novo: ReportSummaryViewModel) => {
      setCards((atual) => ({ ...atual, [novo.PublicId]: { ...atual[novo.PublicId], ...novo } }))
      inicial.update(novo)
    },
  } as Board
  return <ReportsBoard {...props} board={board} />
}

function montar(
  agrupar: 'none' | 'assignee',
  { board = quadro(), ...extra }: Partial<ComponentProps<typeof ReportsBoard>> = {},
) {
  render(
    <MemoryRouter>
      <QuadroVivo
        inicial={board}
        projectPublicId="p-1"
        columns={[coluna('s-1', 'Análise'), coluna('s-2', 'Feito')]}
        soonDays={2}
        lastColumnDays={0}
        aoMudarColunas={vi.fn()}
        aoVerNaLista={vi.fn()}
        aoCriar={vi.fn()}
        aoCriadoNaColuna={vi.fn()}
        destacados={new Set()}
        agrupar={agrupar}
        {...extra}
      />
    </MemoryRouter>,
  )
  return board
}

/** O nome de cada raia, com o que ela diz ao lado, na ordem da tela. */
const nomesDasRaias = () =>
  screen.getAllByRole('button', { expanded: true }).map((botao) => botao.textContent)

// ─── O arraste, pelos eventos do contexto ────────────────────────────────────

function contexto(): DndContextProps {
  if (!arraste.props) throw new Error('O quadro nao montou o contexto do arraste.')
  return arraste.props
}

const naMao = (id: string) => ({
  id,
  data: { current: undefined },
  rect: { current: { initial: null, translated: null } },
})

const alvo = (id: string) => ({
  id,
  rect: { top: 0, left: 0, width: 272, height: 40, right: 272, bottom: 40 },
  data: { current: undefined },
  disabled: false,
})

function pegar(id: string) {
  act(() => {
    contexto().onDragStart?.({
      active: naMao(id),
      activatorEvent: new MouseEvent('mousedown'),
    } as unknown as DragStartEvent)
  })
}

function passarSobre(id: string, sobre: string) {
  act(() => {
    contexto().onDragOver?.({ active: naMao(id), over: alvo(sobre) } as unknown as DragOverEvent)
  })
}

async function soltarSobre(id: string, sobre: string | null) {
  await act(async () => {
    contexto().onDragEnd?.({
      active: naMao(id),
      over: sobre === null ? null : alvo(sobre),
    } as unknown as DragEndEvent)
  })
}

function desistir(id: string) {
  act(() => {
    contexto().onDragCancel?.({ active: naMao(id), over: null } as unknown as DragCancelEvent)
  })
}

describe('o quadro com raias', () => {
  beforeEach(() => {
    arraste.props = null
    for (const mock of Object.values(dublê)) mock.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('uma raia por pessoa, em ordem alfabetica, e "Sem responsavel" por ultimo; cada card na sua celula', () => {
    montar('assignee')
    const raias = screen
      .getAllByRole('button', { expanded: true })
      .map((botao) => botao.textContent)
    expect(raias).toEqual(['Ana1', 'Bruno1', 'Sem responsável1'])
    // O cabecalho de cada coluna, uma vez so.
    expect(screen.getAllByRole('heading', { level: 2, name: 'Análise' })).toHaveLength(1)

    const celula = screen.getByRole('region', { name: 'Análise, Bruno' })
    expect(within(celula).getByText('Card c1')).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: 'Feito, Ana' })).getByText('Card c3'),
    ).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: 'Análise, Sem responsável' })).getByText('Card c2'),
    ).toBeTruthy()
    // O "Criar" de cada coluna, uma vez so: na fileira dos cabecalhos, em cima das raias.
    expect(screen.getAllByRole('button', { name: /^Criar card em/ })).toHaveLength(2)
  })

  it('a raia recolhe e abre', () => {
    montar('assignee')
    const ana = screen.getByRole('button', { name: /^Ana/ })
    fireEvent.click(ana)
    expect(ana.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region', { name: 'Feito, Ana' })).toBeNull()
    fireEvent.click(ana)
    expect(screen.getByRole('region', { name: 'Feito, Ana' })).toBeTruthy()
  })

  it('sem raias, uma regiao por coluna, como antes', () => {
    montar('none')
    expect(screen.getByRole('region', { name: 'Análise' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Feito' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: /Sem responsável/ })).toBeNull()
  })

  it('o "Criar" de cada coluna mora na fileira dos cabecalhos, junto do nome, antes de todas as raias (Q-04)', () => {
    montar('assignee')

    const criar = screen.getByRole('button', { name: 'Criar card em Análise' })
    const cabecalho = screen.getByRole('heading', { level: 2, name: 'Análise' })
    expect(criar.closest('[data-column]')).toBe(cabecalho.closest('[data-column]'))
    const primeiraRaia = screen.getByRole('region', { name: 'Ana: 1 card' })
    expect(
      criar.compareDocumentPosition(primeiraRaia) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('com o time, quem esta sem card ganha uma raia compacta no fim, antes de "Sem responsavel", que recebe card (Q-09)', () => {
    montar('assignee', { pessoas: TIME })

    // Quem tem card nao se repete; quem nao tem vem depois, tambem em ordem alfabetica.
    expect(nomesDasRaias()).toEqual([
      'Ana1',
      'Bruno1',
      compacta('Carla'),
      compacta('Elisa Souza'),
      'Sem responsável1',
    ])
    // Uma celula por coluna, para receber o card que vai passar a essa pessoa.
    expect(screen.getByRole('region', { name: 'Análise, Elisa Souza' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Feito, Elisa Souza' })).toBeTruthy()
  })

  it('sem o time — ainda nao lido, ou a leitura falhou —, so as raias de quem tem card', () => {
    montar('assignee', { pessoas: null })
    expect(nomesDasRaias()).toEqual(['Ana1', 'Bruno1', 'Sem responsável1'])
  })

  it('soltar o card na raia de quem esta sem card passa o card a essa pessoa; no meio do arraste, a raia nao pula de lugar (Q-09)', async () => {
    dublê.lugar.mockResolvedValueOnce(card('c2'))
    dublê.responsavel.mockResolvedValueOnce(card('c2', { Assignee: pessoa('u-e', 'Elisa Souza') }))
    montar('assignee', { pessoas: TIME })

    pegar('c2')
    passarSobre('c2', cellKey('s-1', 'u-e'))
    expect(
      within(screen.getByRole('region', { name: 'Análise, Elisa Souza' })).getByText('Card c2'),
    ).toBeTruthy()
    // A ordem sai do dado dos cards: com o card a caminho, Elisa continua no fim.
    expect(nomesDasRaias()).toEqual([
      'Ana1',
      'Bruno1',
      compacta('Carla'),
      'Elisa Souza1',
      'Sem responsável0',
    ])

    await soltarSobre('c2', cellKey('s-1', 'u-e'))
    expect(dublê.responsavel).toHaveBeenCalledWith('p-1', 'c2', { UserPublicId: 'u-e' })
    expect(dublê.mover).not.toHaveBeenCalled()
    // Com o card dela gravado, Elisa sobe para junto de quem tem card.
    expect(nomesDasRaias()).toEqual([
      'Ana1',
      'Bruno1',
      'Elisa Souza1',
      compacta('Carla'),
      'Sem responsável0',
    ])
    expect(
      within(screen.getByRole('region', { name: 'Análise, Elisa Souza' })).getByText('Card c2'),
    ).toBeTruthy()
  })

  it('ao pegar um card, cada raia guarda a altura que tinha, e solta ao desistir ou ao soltar (Q-08)', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset.laneRow === 'u-b' ? 180 : this.dataset.laneRow ? 96 : 0
    })
    montar('assignee')
    const linha = (raia: string) =>
      document.querySelector<HTMLElement>(`[data-lane-row="${raia}"]`) as HTMLElement

    expect(linha('u-b').style.height).toBe('')
    pegar('c1')
    expect(linha('u-b').style.height).toBe('180px')
    expect(linha('u-a').style.height).toBe('96px')
    expect(linha('u-b').className).toContain('overflow-hidden')

    desistir('c1')
    expect(linha('u-b').style.height).toBe('')
    expect(linha('u-b').className).not.toContain('overflow-hidden')

    pegar('c1')
    expect(linha('u-b').style.height).toBe('180px')
    await soltarSobre('c1', null)
    expect(linha('u-b').style.height).toBe('')
    expect(linha('u-a').style.height).toBe('')
  })

  it('no teclado, a parada do Tab e o primeiro card na ordem das raias; na ponta da celula, as setas passam a raia aberta de cima ou de baixo, e para os lados ficam na mesma raia (Q-11)', () => {
    montar('assignee', {
      board: quadro(
        { 's-1': ['c4', 'c1', 'c2'], 's-2': ['c3'] },
        {
          c4: card('c4', { Assignee: pessoa('u-a', 'Ana') }),
          c1: card('c1', { Assignee: pessoa('u-b', 'Bruno') }),
          c2: card('c2'),
          c3: card('c3', { StatePublicId: 's-2', Assignee: pessoa('u-a', 'Ana') }),
        },
      ),
    })
    const noDoCard = (id: string) =>
      document.querySelector<HTMLElement>(`[data-card="${id}"]`) as HTMLElement
    const tecla = (key: string) =>
      fireEvent.keyDown(document.activeElement ?? document.body, { key })
    const paradas = [...document.querySelectorAll<HTMLElement>('[data-card]')]
      .filter((no) => no.tabIndex === 0)
      .map((no) => no.dataset.card)
    expect(paradas).toEqual(['c4'])

    act(() => noDoCard('c2').focus())
    // Na ponta da celula de "Sem responsavel", sobe para o ultimo da raia de Bruno.
    tecla('ArrowUp')
    expect(document.activeElement).toBe(noDoCard('c1'))
    tecla('ArrowUp')
    expect(document.activeElement).toBe(noDoCard('c4'))
    tecla('ArrowDown')
    expect(document.activeElement).toBe(noDoCard('c1'))
    // Para os lados, a mesma raia: o Feito de Bruno esta vazio, e o foco fica.
    tecla('ArrowRight')
    expect(document.activeElement).toBe(noDoCard('c1'))

    act(() => noDoCard('c4').focus())
    tecla('ArrowRight')
    expect(document.activeElement).toBe(noDoCard('c3'))

    // A raia recolhida fica para tras.
    fireEvent.click(screen.getByRole('button', { name: /^Bruno/ }))
    act(() => noDoCard('c2').focus())
    tecla('ArrowUp')
    expect(document.activeElement).toBe(noDoCard('c4'))
  })
})
