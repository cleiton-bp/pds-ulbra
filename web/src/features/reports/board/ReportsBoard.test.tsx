// @vitest-environment jsdom

import type {
  DndContextProps,
  DragCancelEvent,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { type ComponentProps, useRef, useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import type { ReportDetailViewModel, ReportSummaryViewModel } from '@/contracts'
import { PanelError } from '@/data/errors'
import { type BoardColumn, type BoardItems, cellKey } from '@/features/reports/board/boardState'
import { ReportsBoard } from '@/features/reports/board/ReportsBoard'
import type { Board, BoardColumnState } from '@/features/reports/board/useBoard'
import { useToastStore } from '@/shared/components/toastStore'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: o quadro, no nivel do componente, depois da revisao de
 * usabilidade.
 *
 * - **Criar na coluna (Q-05)**: o "Criar" do alto abre um campo de uma linha com o
 *   foco; Enter cria ja na coluna (e na sprint em andamento, com ela ligada), uma vez
 *   so por Enter, o card nasce no topo e a lista rola ate ele, e o campo continua
 *   aberto, vazio e com o foco. A falha fica embaixo do campo, com o titulo. Esc fecha
 *   e devolve o foco ao "Criar"; sair do campo vazio fecha, com texto fica; "Mais
 *   detalhes" leva o titulo ao dialogo — tambem pelo teclado. O card criado pelo
 *   dialogo e revelado quando aparece.
 * - **Reabrir pergunta antes (Q-02)**: tirar o relato encerrado da coluna que encerra
 *   abre "Reabrir o relato #N?"; Cancelar e Esc devolvem o card ao lugar exato sem
 *   gravar; o sim grava uma vez, e o card nao volta depois — nem com Esc no meio.
 *   Enquanto a pergunta esta aberta, o tempo real espera.
 * - **Encerrar avisa (Q-14)**: com e sem a espera do Ciclo, em tempo relativo.
 * - **Falhas com palavras de gente (Q-07)**: sem rede, servidor, recusa com motivo e
 *   conflito; o card volta ao lugar de antes. Mudar de lugar na coluna, e a troca de
 *   raia que falha depois do movimento gravado.
 * - **Sem vaivem (Q-01, a trava do quadro)**: um movimento entre celulas por quadro
 *   desenhado, e no teclado o alvo vazio nao devolve o card — nem ao soltar.
 * - **Filtro a vista (Q-17)**: "1 de 8" e o bloco de quando nada passa.
 * - **O pe logo depois do ultimo card (Q-06)** e **o cabecalho preso (Q-04)**.
 * - **Teclado (Q-11, Q-13)**: uma parada so do Tab, as setas, Home e End, Enter abre;
 *   no arraste pelo teclado, o lugar reservado e o proprio card.
 * - **Toque e telas estreitas (Q-10, Q-03)**: 450 ms para pegar, a borda anda uma
 *   coluna por vez, a fila de colunas e a coluna escondida que diz o nome.
 *
 * O jsdom nao mede nada: a conta de onde o card cai pela geometria (`boardCollision`,
 * `boardKeyboard`) tem testes proprios, e aqui o teste diz sobre o que o card esta
 * chamando os eventos do contexto do arraste. Pegar pelo teclado, pelo mouse e pelo
 * toque usa os sensores de verdade.
 */
const dublê = vi.hoisted(() => ({
  mover: vi.fn(),
  lugar: vi.fn(),
  criar: vi.fn(),
  responsavel: vi.fn(),
}))

/** As props que o quadro passa ao contexto do arraste, e quando a biblioteca pegou um card. */
const arraste = vi.hoisted(() => ({
  props: null as DndContextProps | null,
  pegou: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectReportService: {
      moveReport: dublê.mover,
      setPosition: dublê.lugar,
      createTeamCard: dublê.criar,
      setAssignee: dublê.responsavel,
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
      return createElement(real.DndContext, {
        ...props,
        onDragStart: (evento: DragStartEvent) => {
          arraste.pegou(evento.activatorEvent.type)
          props.onDragStart?.(evento)
        },
      })
    },
  }
})

// O `scrollIntoView` e o `ResizeObserver` que o jsdom nao tem.
instalarRemendosDoRadix()

// ─── Os dados ────────────────────────────────────────────────────────────────

function card(id: string, extra: Partial<ReportSummaryViewModel> = {}): ReportSummaryViewModel {
  return {
    PublicId: id,
    Kind: 'Team',
    // O numero sai do identificador: o c17 e o #17.
    Number: Number(id.replace(/\D/g, '')),
    Title: `Card ${id}`,
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
    UpdatedAt: '2026-10-02T12:00:00.000Z',
    ...extra,
  }
}

/** Um relato de quem usa o site: so ele encerra e reabre. */
const relato = (id: string, extra: Partial<ReportSummaryViewModel> = {}) =>
  card(id, {
    Kind: 'Report',
    Title: `Relato ${id}`,
    TrackingCode: `COD-${id.toUpperCase()}`,
    Type: 'Bug',
    Text: 'O frete some no fim da compra.',
    AcceptsQuestions: true,
    ...extra,
  })

/** O card como a API o devolve ao criar. */
function detalhe(id: string, extra: Partial<ReportSummaryViewModel> = {}): ReportDetailViewModel {
  return {
    ...card(id, extra),
    Description: null,
    CreatedByName: 'Ana',
    CanArchive: true,
    ArchiveCloses: false,
    Closure: null,
    InfoRequest: null,
    CanAskInfo: false,
    ModerationState: 'Approved',
    Contexts: [],
    Reopenings: [],
  }
}

const pessoa = (id: string, nome: string) => ({
  UserPublicId: id,
  Name: nome,
  AvatarUrl: null,
  InTeam: true,
})
const ANA = pessoa('u-a', 'Ana')
const BRUNO = pessoa('u-b', 'Bruno')

const coluna = (key: string, name: string, extra: Partial<BoardColumn> = {}): BoardColumn => ({
  key,
  name,
  accepts: true,
  retired: false,
  closes: false,
  last: false,
  total: 0,
  ...extra,
})

/** O quadro de sempre: a ultima coluna e a que encerra. */
const COLUNAS = [
  coluna('s-1', 'A fazer'),
  coluna('s-2', 'Fazendo'),
  coluna('s-3', 'Feito', { closes: true, last: true }),
]

function retangulo({
  left = 0,
  top = 0,
  width = 0,
  height = 0,
}: Partial<Record<'left' | 'top' | 'width' | 'height', number>>): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect
}

/** Uma promessa que so resolve quando o teste mandar. */
function emVoo<T>() {
  let resolver: (valor: T) => void = () => {}
  const promessa = new Promise<T>((resolve) => {
    resolver = resolve
  })
  return { promessa, resolver: (valor: T) => resolver(valor) }
}

// ─── O quadro de mentira, com a ordem de verdade ─────────────────────────────

/** Os cards como a API os tem: o movimento devolve o card com a coluna nova. */
const noServidor = new Map<string, ReportSummaryViewModel>()

type PropsDoQuadro = ComponentProps<typeof ReportsBoard>

/** O que o teste olha no quadro: o que a tela pediu a ele. */
interface Espiao {
  setItems: Mock<(valor: BoardItems) => void>
  update: Mock<(card: ReportSummaryViewModel) => void>
  adjustTotal: Mock<(chave: string, delta: number) => void>
  reloadColumn: Mock<(chave: string) => Promise<void>>
  loadColumn: Mock<(chave: string) => Promise<void>>
  loadMore: Mock<(chave: string) => Promise<void>>
  /** Quantas maos seguram agora as releituras do tempo real. */
  segurando: number
  /** O quadro da ultima renderizacao: o teste mexe nele como o tempo real mexeria. */
  board: Board | null
}

/**
 * O `useBoard` sem a API: a ordem num estado e numa referencia, como no de verdade, e o
 * resto anotado. O card criado no alto da coluna entra no topo dela, como faz a tela de
 * Trabalho.
 */
function QuadroDeTeste({
  itens,
  cards,
  estados,
  espiao,
  ...props
}: Omit<PropsDoQuadro, 'board'> & {
  itens: BoardItems
  cards: ReportSummaryViewModel[]
  estados: Record<string, Partial<BoardColumnState>>
  espiao: Espiao
}) {
  const [items, setItemsState] = useState(itens)
  const itemsRef = useRef(itens)
  const [porId, setPorId] = useState<Record<string, ReportSummaryViewModel>>(() =>
    Object.fromEntries(cards.map((item) => [item.PublicId, item])),
  )

  const setItems = (proximo: BoardItems | ((atual: BoardItems) => BoardItems)) => {
    const valor = typeof proximo === 'function' ? proximo(itemsRef.current) : proximo
    itemsRef.current = valor
    setItemsState(valor)
    espiao.setItems(valor)
  }
  const guardar = (novo: ReportSummaryViewModel) =>
    setPorId((atual) => ({ ...atual, [novo.PublicId]: { ...atual[novo.PublicId], ...novo } }))
  const inserir = (novo: ReportSummaryViewModel) => {
    guardar(novo)
    const chave = novo.StatePublicId ?? ''
    setItems((atual) => ({ ...atual, [chave]: [novo.PublicId, ...(atual[chave] ?? [])] }))
  }

  const board = {
    items,
    itemsRef,
    cards: porId,
    state: Object.fromEntries(
      props.columns.map((item) => [
        item.key,
        {
          total: itens[item.key]?.length ?? 0,
          end: true,
          loading: false,
          loadingMore: false,
          failed: false,
          ...estados[item.key],
        },
      ]),
    ),
    setItems,
    update: (novo: ReportSummaryViewModel) => {
      guardar(novo)
      espiao.update(novo)
    },
    insert: inserir,
    adjustTotal: espiao.adjustTotal,
    reloadColumn: espiao.reloadColumn,
    loadColumn: espiao.loadColumn,
    loadMore: espiao.loadMore,
    apply: guardar,
    remoteChange: () => {},
    reloadAll: () => {},
    hold: () => {
      espiao.segurando += 1
      let solto = false
      return () => {
        if (solto) return
        solto = true
        espiao.segurando -= 1
      }
    },
  } as unknown as Board
  espiao.board = board

  return (
    <ReportsBoard
      {...props}
      board={board}
      aoCriadoNaColuna={(novo, nome) => {
        inserir(novo)
        props.aoCriadoNaColuna(novo, nome)
      }}
    />
  )
}

/** Onde a tela esta: abrir o card e ir para o endereco dele. */
function Endereco() {
  return <p data-testid="endereco">{useLocation().pathname}</p>
}

function montar({
  itens,
  cards,
  estados = {},
  ...props
}: Partial<Omit<PropsDoQuadro, 'board'>> & {
  itens: BoardItems
  cards: ReportSummaryViewModel[]
  estados?: Record<string, Partial<BoardColumnState>>
}) {
  for (const item of cards) noServidor.set(item.PublicId, item)
  const espiao: Espiao = {
    setItems: vi.fn(),
    update: vi.fn(),
    adjustTotal: vi.fn(),
    reloadColumn: vi.fn(async () => {}),
    loadColumn: vi.fn(async () => {}),
    loadMore: vi.fn(async () => {}),
    segurando: 0,
    board: null,
  }
  const chamadas = {
    aoMudarColunas: vi.fn(),
    aoVerNaLista: vi.fn<(chave: string) => void>(),
    aoCriar: vi.fn<(chave: string, titulo: string) => void>(),
    aoCriadoNaColuna: vi.fn<(card: ReportDetailViewModel, coluna: string) => void>(),
  }
  const desenho = (mais: Partial<PropsDoQuadro> = {}) => (
    <MemoryRouter initialEntries={['/projects/p-1/reports']}>
      <Routes>
        <Route
          path="/projects/:projeto/reports/*"
          element={
            <>
              <QuadroDeTeste
                projectPublicId="p-1"
                columns={COLUNAS}
                soonDays={2}
                lastColumnDays={0}
                destacados={new Set()}
                {...chamadas}
                {...props}
                {...mais}
                itens={itens}
                cards={cards}
                estados={estados}
                espiao={espiao}
              />
              <Endereco />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  )
  const { rerender } = render(desenho())
  return {
    espiao,
    ...chamadas,
    redesenhar: (mais: Partial<PropsDoQuadro>) => rerender(desenho(mais)),
  }
}

// ─── O arraste, pelos eventos do contexto ────────────────────────────────────

type Mao = 'ponteiro' | 'toque' | 'teclado'

function contexto(): DndContextProps {
  if (!arraste.props) throw new Error('O quadro nao montou o contexto do arraste.')
  return arraste.props
}

/** O evento que pega o card: e por ele que o quadro sabe se e mouse, toque ou teclado. */
function eventoQuePega(mao: Mao, { x = 10, y = 10 } = {}): Event {
  if (mao === 'teclado') return new KeyboardEvent('keydown', { code: 'Space', key: ' ' })
  if (mao === 'toque')
    return new TouchEvent('touchstart', {
      touches: [{ clientX: x, clientY: y }] as unknown as Touch[],
    })
  return new MouseEvent('mousedown', { clientX: x, clientY: y })
}

/** O card na mao, como a biblioteca o descreve. */
const naMao = (id: string) => ({
  id,
  data: { current: undefined },
  rect: { current: { initial: null, translated: null } },
})

/** O que esta debaixo do card: uma celula, uma coluna ou outro card. */
const alvo = (id: string) => ({
  id,
  rect: retangulo({ top: 0, width: 272, height: 40 }),
  data: { current: undefined },
  disabled: false,
})

function pegar(id: string, mao: Mao | Event = 'ponteiro') {
  const activatorEvent = typeof mao === 'string' ? eventoQuePega(mao) : mao
  act(() => {
    contexto().onDragStart?.({ active: naMao(id), activatorEvent } as unknown as DragStartEvent)
  })
}

function passarSobre(id: string, sobre: string | null) {
  act(() => {
    contexto().onDragOver?.({
      active: naMao(id),
      over: sobre === null ? null : alvo(sobre),
    } as unknown as DragOverEvent)
  })
}

/** Solta: a gravacao e assincrona, e a resposta da API vem dentro do `act`. */
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

/** O dedo andou `dx` desde onde pegou. */
function moverDedo(id: string, toque: Event, dx: number) {
  act(() => {
    contexto().onDragMove?.({
      active: naMao(id),
      activatorEvent: toque,
      delta: { x: dx, y: 0 },
      over: null,
      collisions: null,
    } as unknown as DragMoveEvent)
  })
}

/** O que o leitor de tela ouve quando o card passa sobre `sobre`. */
const anuncioSobre = (id: string, sobre: string | null) =>
  contexto().accessibility?.announcements?.onDragOver({
    active: naMao(id),
    over: sobre === null ? null : alvo(sobre),
  } as unknown as DragOverEvent)

/** O que o leitor de tela ouve quando o card e solto sobre `sobre`. */
const anuncioAoSoltar = (id: string, sobre: string | null) =>
  contexto().accessibility?.announcements?.onDragEnd({
    active: naMao(id),
    over: sobre === null ? null : alvo(sobre),
  } as unknown as DragEndEvent)

/** Se a rolagem da biblioteca pode rolar este elemento agora. */
const podeRolar = (el: Element) =>
  (contexto().autoScroll as { canScroll: (el: Element) => boolean }).canScroll(el)

// ─── A tela ──────────────────────────────────────────────────────────────────

/**
 * A coluna (ou a celula, com raias) pelo nome. Pelo DOM, e nao pelo papel: com um
 * dialogo aberto, o resto da pagina fica escondido do leitor de tela.
 */
function regiao(rotulo: string): HTMLElement {
  const no = document.querySelector<HTMLElement>(`section[aria-label="${rotulo}"]`)
  if (!no) throw new Error(`O quadro nao tem a regiao "${rotulo}".`)
  return no
}

/** Os cards de uma coluna (ou celula), na ordem da tela. */
const cardsDe = (rotulo: string) =>
  [...regiao(rotulo).querySelectorAll<HTMLElement>('[data-card]')].map((no) => no.dataset.card)

/** O link de um card. */
function noDoCard(id: string): HTMLElement {
  const no = document.querySelector<HTMLElement>(`[data-card="${id}"]`)
  if (!no) throw new Error(`O card ${id} nao esta na tela.`)
  return no
}

/** A parte do quadro que rola para os lados (sem raias): a mae das colunas. */
const areaDoQuadro = () => regiao('A fazer').parentElement as HTMLElement

/** Os avisos que apareceram, com o tom. */
const avisos = () =>
  useToastStore.getState().toasts.map(({ tone, message }) => ({ tom: tone, texto: message }))

/** Os cards que estao na ordem do Tab. */
const paradas = () =>
  [...document.querySelectorAll<HTMLElement>('[data-card]')]
    .filter((no) => no.tabIndex === 0)
    .map((no) => no.dataset.card)

/** A copia erguida do card, a que segue a mao: a frente dele fora do link. */
const copiaErguida = (titulo: string) =>
  screen.getAllByText(titulo).find((no) => no.closest('[data-card]') === null)

const umInstante = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })

beforeEach(() => {
  for (const mock of Object.values(dublê)) mock.mockReset()
  arraste.props = null
  arraste.pegou.mockReset()
  noServidor.clear()
  useToastStore.setState({ toasts: [] })
  // A API devolve o card como ele ficou.
  dublê.mover.mockImplementation(
    async (_projeto: string, id: string, pedido: { StatePublicId: string }) => ({
      ...noServidor.get(id),
      StatePublicId: pedido.StatePublicId,
    }),
  )
  dublê.lugar.mockImplementation(async (_projeto: string, id: string) => noServidor.get(id))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ─── Q-05 ────────────────────────────────────────────────────────────────────

describe('criar na coluna (Q-05)', () => {
  const ITENS = { 's-1': ['c1'], 's-2': ['c30'], 's-3': [] }
  const CARDS = () => [card('c1'), card('c30', { StatePublicId: 's-2', StateName: 'Fazendo' })]

  function abrirCampo(nome: string) {
    fireEvent.click(screen.getByRole('button', { name: `Criar card em ${nome}` }))
    return screen.getByRole('textbox', {
      name: `Título do card novo em ${nome}`,
    }) as HTMLInputElement
  }

  /** O Enter no campo: o navegador envia o formulario de um campo so; o jsdom, nao. */
  function enter(campo: HTMLInputElement) {
    fireEvent.submit(campo.form as HTMLFormElement)
  }

  it('o "Criar" mora no alto da coluna, fora da lista que rola, e abre ali um campo de uma linha com o foco', () => {
    montar({
      columns: [coluna('sem', 'Sem coluna', { accepts: false }), ...COLUNAS],
      itens: { sem: [], ...ITENS },
      cards: CARDS(),
    })

    const fazendo = regiao('Fazendo')
    const criar = within(fazendo).getByRole('button', { name: 'Criar card em Fazendo' })
    expect(fazendo.querySelector('[data-board-scroll]')?.contains(criar)).toBe(false)
    // Na coluna que nao recebe card, o card nasceria onde ninguem pode coloca-lo.
    expect(screen.queryByRole('button', { name: 'Criar card em Sem coluna' })).toBeNull()

    const campo = abrirCampo('Fazendo')
    expect(fazendo.contains(campo)).toBe(true)
    expect(document.activeElement).toBe(campo)
    expect(campo.placeholder).toBe('Título do card — Enter cria, Esc fecha')
  })

  it('Enter cria direto na coluna, uma vez so; o card nasce no topo, a lista rola ate ele, e o campo continua aberto, vazio e com o foco', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    const rolar = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
    const pedido = emVoo<ReportDetailViewModel>()
    dublê.criar.mockReturnValueOnce(pedido.promessa)
    const { aoCriadoNaColuna } = montar({ itens: ITENS, cards: CARDS() })

    const campo = abrirCampo('Fazendo')
    fireEvent.change(campo, { target: { value: '  Revisar o frete  ' } })
    enter(campo)
    expect(within(regiao('Fazendo')).getByText('Criando…')).toBeTruthy()
    // O Enter de novo, com o primeiro ainda no ar, nao cria outro card.
    enter(campo)
    expect(dublê.criar).toHaveBeenCalledTimes(1)
    const [projeto, pedidoFeito] = dublê.criar.mock.calls[0] ?? []
    expect(projeto).toBe('p-1')
    // Sem sprint ligada, o pedido nao leva sprint nenhuma.
    expect(pedidoFeito).toStrictEqual({
      Title: 'Revisar o frete',
      Description: null,
      StatePublicId: 's-2',
    })

    await act(async () =>
      pedido.resolver(detalhe('c40', { StatePublicId: 's-2', StateName: 'Fazendo' })),
    )
    expect(aoCriadoNaColuna).toHaveBeenCalledTimes(1)
    expect(aoCriadoNaColuna).toHaveBeenCalledWith(
      expect.objectContaining({ PublicId: 'c40' }),
      'Fazendo',
    )
    // Logo abaixo do campo: o topo da coluna.
    expect(cardsDe('Fazendo')).toEqual(['c40', 'c30'])
    expect(campo.isConnected).toBe(true)
    expect(campo.value).toBe('')
    expect(document.activeElement).toBe(campo)
    expect(within(regiao('Fazendo')).queryByText('Criando…')).toBeNull()

    // No quadro seguinte, a lista rolada volta ate o card novo.
    act(() => {
      vi.advanceTimersToNextFrame()
    })
    expect(rolar.mock.contexts).toContain(noDoCard('c40'))
  })

  it('com a sprint ligada, o card nasce na sprint em andamento', async () => {
    dublê.criar.mockResolvedValueOnce(detalhe('c41', { StatePublicId: 's-1' }))
    montar({ itens: ITENS, cards: CARDS(), sprintPublicId: 'sp-7' })

    const campo = abrirCampo('A fazer')
    fireEvent.change(campo, { target: { value: 'Ajustar o cupom' } })
    await act(async () => enter(campo))

    expect(dublê.criar).toHaveBeenCalledWith('p-1', {
      Title: 'Ajustar o cupom',
      Description: null,
      StatePublicId: 's-1',
      SprintPublicId: 'sp-7',
    })
  })

  it('a falha fica embaixo do campo, com o titulo mantido; escrever de novo tira o erro', async () => {
    dublê.criar.mockRejectedValueOnce(
      new PanelError('Este projeto esta arquivado e nao aceita cards novos.', 403),
    )
    const { aoCriadoNaColuna } = montar({ itens: ITENS, cards: CARDS() })

    const campo = abrirCampo('Fazendo')
    fireEvent.change(campo, { target: { value: 'Revisar o frete' } })
    await act(async () => enter(campo))

    const formulario = campo.form as HTMLFormElement
    const erro = within(formulario).getByRole('alert')
    expect(erro.textContent).toBe('Este projeto está arquivado e não aceita cards novos.')
    expect(campo.compareDocumentPosition(erro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(campo.value).toBe('Revisar o frete')
    expect(campo.getAttribute('aria-invalid')).toBe('true')
    expect(aoCriadoNaColuna).not.toHaveBeenCalled()
    // O erro e do campo, e nao um aviso que some.
    expect(avisos()).toEqual([])

    fireEvent.change(campo, { target: { value: 'Revisar o frete da loja' } })
    expect(within(formulario).queryByRole('alert')).toBeNull()
  })

  it('Esc fecha o campo e devolve o foco ao "Criar" da coluna, e o campo abre vazio de novo', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    montar({ itens: ITENS, cards: CARDS() })

    const campo = abrirCampo('Fazendo')
    fireEvent.change(campo, { target: { value: 'Rascunho' } })
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(campo.isConnected).toBe(false)

    act(() => {
      vi.advanceTimersToNextFrame()
    })
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Criar card em Fazendo' }),
    )
    expect(abrirCampo('Fazendo').value).toBe('')
  })

  it('sair do campo vazio fecha; com texto, ele fica com o que se escreveu', () => {
    montar({ itens: ITENS, cards: CARDS() })

    const vazio = abrirCampo('Fazendo')
    fireEvent.blur(vazio)
    expect(vazio.isConnected).toBe(false)
    expect(screen.getByRole('button', { name: 'Criar card em Fazendo' })).toBeTruthy()

    const comTexto = abrirCampo('Fazendo')
    fireEvent.change(comTexto, { target: { value: 'Revisar o frete' } })
    fireEvent.blur(comTexto)
    expect(comTexto.isConnected).toBe(true)
    expect(comTexto.value).toBe('Revisar o frete')
  })

  it('"Mais detalhes" abre o dialogo completo nesta coluna com o titulo digitado, e o campo guarda o texto', () => {
    const { aoCriar } = montar({ itens: ITENS, cards: CARDS() })

    const campo = abrirCampo('Fazendo')
    fireEvent.change(campo, { target: { value: '  Revisar o frete ' } })
    const mais = within(campo.form as HTMLFormElement).getByRole('button', {
      name: 'Mais detalhes',
    })
    // O apertar do mouse nao tira o foco do campo: vazio, ele fecharia e o clique se perderia.
    expect(fireEvent.mouseDown(mais)).toBe(false)
    fireEvent.click(mais)

    expect(aoCriar).toHaveBeenCalledWith('s-2', 'Revisar o frete')
    expect(campo.value).toBe('  Revisar o frete ')
    expect(dublê.criar).not.toHaveBeenCalled()
  })

  it('no teclado, o Tab do campo vazio chega ao "Mais detalhes": o campo nao fecha com o foco ainda dentro dele', () => {
    const { aoCriar } = montar({ itens: ITENS, cards: CARDS() })

    const campo = abrirCampo('Fazendo')
    const mais = within(campo.form as HTMLFormElement).getByRole('button', {
      name: 'Mais detalhes',
    })
    // O Tab leva o foco ao proximo do formulario, que e o "Mais detalhes".
    act(() => mais.focus())

    expect(mais.isConnected).toBe(true)
    expect(document.activeElement).toBe(mais)
    fireEvent.click(mais)
    expect(aoCriar).toHaveBeenCalledWith('s-2', '')
  })

  it('o card criado pelo dialogo vindo de uma coluna: o quadro rola ate ele quando ele aparece, uma vez so', () => {
    const rolar = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
    const { espiao, redesenhar } = montar({ itens: ITENS, cards: CARDS() })

    // Ainda nao desenhado: nada a revelar.
    redesenhar({ revelar: 'c42' })
    expect(rolar).not.toHaveBeenCalled()

    act(() => espiao.board?.insert(card('c42', { StatePublicId: 's-2' })))
    expect(rolar).toHaveBeenCalledTimes(1)
    expect(rolar.mock.contexts[0]).toBe(noDoCard('c42'))
    expect(rolar).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })

    redesenhar({ revelar: 'c42', soonDays: 3 })
    expect(rolar).toHaveBeenCalledTimes(1)
  })
})

// ─── Q-02 ────────────────────────────────────────────────────────────────────

describe('tirar um relato encerrado da coluna que encerra (Q-02)', () => {
  const ITENS = { 's-1': [], 's-2': ['c20'], 's-3': ['c9', 'r10', 'c11'] }
  const CARDS = () => [
    card('c20', { StatePublicId: 's-2' }),
    card('c9', { StatePublicId: 's-3' }),
    relato('r10', { StatePublicId: 's-3', Closed: true, Finished: true }),
    card('c11', { StatePublicId: 's-3' }),
  ]

  /** O #10, encerrado, sai do meio do Feito e cai no fim de Fazendo. */
  async function tirarO10DoFeito() {
    const montado = montar({ itens: ITENS, cards: CARDS() })
    pegar('r10')
    passarSobre('r10', 's-2')
    await soltarSobre('r10', 's-2')
    return montado
  }

  it('pergunta antes de mover, dizendo o que muda para quem relatou; enquanto pergunta, o tempo real espera', async () => {
    const { espiao } = await tirarO10DoFeito()

    const pergunta = screen.getByRole('alertdialog', { name: 'Reabrir o relato #10?' })
    expect(
      within(pergunta).getByText(
        'Tirar o #10 de Feito reabre o relato: quem relatou volta a ver o relato em andamento, e o motivo do encerramento sai da página de acompanhamento.',
      ),
    ).toBeTruthy()
    expect(within(pergunta).getByRole('button', { name: 'Cancelar' })).toBeTruthy()
    expect(within(pergunta).getByRole('button', { name: 'Reabrir e mover' })).toBeTruthy()
    // O card espera no lugar novo, e nada foi gravado.
    expect(cardsDe('Fazendo')).toEqual(['c20', 'r10'])
    expect(dublê.mover).not.toHaveBeenCalled()
    expect(espiao.segurando).toBe(1)
    // O cabecalho do Feito ja dizia, antes de soltar.
    expect(
      within(regiao('Feito')).getByText(
        'Soltar um relato aberto aqui encerra; tirar daqui reabre.',
      ),
    ).toBeTruthy()
  })

  it('Cancelar devolve o card ao lugar exato de onde saiu, sem gravar nada', async () => {
    const { espiao } = await tirarO10DoFeito()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(cardsDe('Feito')).toEqual(['c9', 'r10', 'c11'])
    expect(cardsDe('Fazendo')).toEqual(['c20'])
    expect(dublê.mover).not.toHaveBeenCalled()
    expect(espiao.segurando).toBe(0)
  })

  it('Esc tambem desiste: o card volta ao lugar exato, sem gravar nada', async () => {
    const { espiao } = await tirarO10DoFeito()

    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(cardsDe('Feito')).toEqual(['c9', 'r10', 'c11'])
    expect(cardsDe('Fazendo')).toEqual(['c20'])
    expect(dublê.mover).not.toHaveBeenCalled()
    expect(espiao.segurando).toBe(0)
  })

  it('"Reabrir e mover" grava uma vez so, e o card fica onde foi solto', async () => {
    const resposta = emVoo<ReportSummaryViewModel>()
    dublê.mover.mockReturnValueOnce(resposta.promessa)
    const { espiao, aoMudarColunas } = await tirarO10DoFeito()

    const sim = screen.getByRole('button', { name: 'Reabrir e mover' })
    fireEvent.click(sim)
    // O segundo clique, com a gravacao no ar, nao grava de novo.
    fireEvent.click(sim)
    expect(dublê.mover).toHaveBeenCalledTimes(1)
    expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r10', {
      StatePublicId: 's-2',
      AfterPublicId: 'c20',
    })

    await act(async () =>
      resposta.resolver(relato('r10', { StatePublicId: 's-2', Closed: false, Finished: false })),
    )
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(cardsDe('Fazendo')).toEqual(['c20', 'r10'])
    expect(cardsDe('Feito')).toEqual(['c9', 'c11'])
    expect(aoMudarColunas).toHaveBeenCalledTimes(1)
    expect(espiao.segurando).toBe(0)
  })

  it('falhando depois do sim, o card volta ao lugar de antes, o aviso diz por que, e a pergunta fecha', async () => {
    dublê.mover.mockRejectedValueOnce(new PanelError('Erro interno.', 500))
    await tirarO10DoFeito()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reabrir e mover' }))
    })

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(cardsDe('Feito')).toEqual(['c9', 'r10', 'c11'])
    expect(cardsDe('Fazendo')).toEqual(['c20'])
    expect(avisos()).toEqual([
      {
        tom: 'danger',
        texto: 'Não deu para mover o #10 para Fazendo. Ele voltou para Feito — tente de novo.',
      },
    ])
  })

  it('Esc com a gravacao do sim no ar nao desfaz na tela o que a API ja gravou', async () => {
    const resposta = emVoo<ReportSummaryViewModel>()
    dublê.mover.mockReturnValueOnce(resposta.promessa)
    await tirarO10DoFeito()

    fireEvent.click(screen.getByRole('button', { name: 'Reabrir e mover' }))
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    await act(async () =>
      resposta.resolver(relato('r10', { StatePublicId: 's-2', Closed: false, Finished: false })),
    )
    await umInstante()

    // A API reabriu o #10 em Fazendo: e la que a tela precisa mostra-lo.
    expect(dublê.mover).toHaveBeenCalledTimes(1)
    expect(cardsDe('Fazendo')).toEqual(['c20', 'r10'])
    expect(cardsDe('Feito')).toEqual(['c9', 'c11'])
  })

  it.each([
    ['o relato aberto que sai do Feito', relato('r10', { StatePublicId: 's-3' })],
    ['o card do time que sai do Feito', card('r10', { StatePublicId: 's-3' })],
  ])('nao pergunta: %s so anda', async (_caso, oCard) => {
    montar({ itens: ITENS, cards: [...CARDS().filter((item) => item.PublicId !== 'r10'), oCard] })
    pegar('r10')
    passarSobre('r10', 's-2')
    await soltarSobre('r10', 's-2')

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r10', {
      StatePublicId: 's-2',
      AfterPublicId: 'c20',
    })
  })

  it('nao pergunta: o relato encerrado numa coluna que nao encerra so anda', async () => {
    montar({
      itens: { 's-1': [], 's-2': ['r12'], 's-3': [] },
      cards: [relato('r12', { StatePublicId: 's-2', Closed: true })],
    })
    pegar('r12')
    passarSobre('r12', 's-1')
    await soltarSobre('r12', 's-1')

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r12', {
      StatePublicId: 's-1',
      AfterPublicId: null,
    })
  })

  it('nao pergunta: o encerramento que quem relatou ja confirmou nao reabre, entao so anda', async () => {
    montar({
      itens: ITENS,
      cards: CARDS().map((item) =>
        item.PublicId === 'r10' ? { ...item, ClosureConfirmed: true } : item,
      ),
    })
    pegar('r10')
    passarSobre('r10', 's-2')
    await soltarSobre('r10', 's-2')

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r10', {
      StatePublicId: 's-2',
      AfterPublicId: 'c20',
    })
  })

  it('nao pergunta: mudar o encerrado de lugar dentro do Feito so muda o lugar', async () => {
    montar({ itens: ITENS, cards: CARDS() })
    pegar('r10')
    await soltarSobre('r10', 'c11')

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(dublê.lugar).toHaveBeenCalledWith('p-1', 'r10', { AfterPublicId: 'c11' })
    expect(dublê.mover).not.toHaveBeenCalled()
  })
})

// ─── Q-14 ────────────────────────────────────────────────────────────────────

describe('encerrar pelo quadro (Q-14)', () => {
  /** O #12, aberto, cai no Feito: o desfecho e pedido, e o motivo vai junto do movimento. */
  async function encerrarO12(resposta: Partial<ReportSummaryViewModel> = {}) {
    dublê.mover.mockResolvedValueOnce(
      relato('r12', { StatePublicId: 's-3', Closed: true, Finished: true, ...resposta }),
    )
    const montado = montar({
      itens: { 's-1': [], 's-2': ['r12'], 's-3': ['c11'] },
      cards: [relato('r12', { StatePublicId: 's-2' }), card('c11', { StatePublicId: 's-3' })],
    })
    pegar('r12')
    passarSobre('r12', 's-3')
    await soltarSobre('r12', 's-3')

    const dialogo = screen.getByRole('dialog', { name: 'Encerrar o relato' })
    expect(montado.espiao.segurando).toBe(1)
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Por que acabou' }), {
      target: { value: 'O frete passou a aparecer antes do pagamento.' },
    })
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Encerrar' }))
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    return montado
  }

  it('encerrado, o aviso diz que quem relatou ja pode ler o motivo', async () => {
    const { espiao } = await encerrarO12()

    expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r12', {
      StatePublicId: 's-3',
      AfterPublicId: 'c11',
      Outcome: 'Done',
      Reason: 'O frete passou a aparecer antes do pagamento.',
    })
    expect(avisos()).toEqual([
      { tom: 'done', texto: '#12 encerrado. Quem relatou já pode ler o motivo.' },
    ])
    expect(cardsDe('Feito')).toEqual(['c11', 'r12'])
    expect(espiao.segurando).toBe(0)
  })

  it('com a espera do Ciclo, o aviso diz quando quem relatou le o motivo, a partir de agora', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-08T15:00:00.000Z'))

    await encerrarO12({ PublicStageDueAt: '2026-10-08T15:15:00.000Z' })

    expect(avisos()).toEqual([
      {
        tom: 'done',
        texto: '#12 encerrado. O motivo aparece para quem relatou em 15 minutos.',
      },
    ])
  })

  it('a espera que ja venceu nao promete o futuro: quem relatou ja pode ler', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-08T15:00:00.000Z'))

    await encerrarO12({ PublicStageDueAt: '2026-10-08T14:59:00.000Z' })

    expect(avisos()).toEqual([
      { tom: 'done', texto: '#12 encerrado. Quem relatou já pode ler o motivo.' },
    ])
  })

  it('o movimento que nao encerra nao avisa encerramento', async () => {
    montar({
      itens: { 's-1': ['c5'], 's-2': [], 's-3': [] },
      cards: [card('c5')],
    })
    pegar('c5')
    passarSobre('c5', 's-2')
    await soltarSobre('c5', 's-2')

    expect(dublê.mover).toHaveBeenCalledTimes(1)
    expect(avisos()).toEqual([])
  })
})

// ─── Q-07 ────────────────────────────────────────────────────────────────────

describe('quando o movimento falha (Q-07)', () => {
  const ITENS = { 's-1': ['c16', 'c17', 'c18'], 's-2': ['c30'], 's-3': [] }
  const CARDS = () => [card('c16'), card('c17'), card('c18'), card('c30', { StatePublicId: 's-2' })]

  it.each([
    [
      'sem rede',
      new PanelError('Falha de rede ao contatar a API.', 0),
      'Sem conexão: o #17 voltou para A fazer. Quando a internet voltar, arraste de novo.',
    ],
    [
      'o servidor falhou',
      new PanelError('Erro interno.', 500),
      'Não deu para mover o #17 para Fazendo. Ele voltou para A fazer — tente de novo.',
    ],
    [
      'a API recusou com motivo',
      new PanelError('Estado nao encontrado neste projeto.', 404),
      'Não deu para mover o #17 para Fazendo. Estado não encontrado neste projeto. Ele voltou para A fazer.',
    ],
    [
      'outra pessoa mexeu antes (409)',
      new PanelError(
        'O card de referencia nao esta mais nesta coluna. Leia a coluna de novo.',
        409,
      ),
      'Outra pessoa mexeu neste card, ou nesta coluna, enquanto você o movia. O quadro foi relido: solte de novo, se ainda quiser.',
    ],
  ])(
    '%s: o aviso diz qual card e onde ele esta, e ele volta ao lugar de antes',
    async (_caso, falha, texto) => {
      dublê.mover.mockRejectedValueOnce(falha)
      const { espiao, aoMudarColunas } = montar({ itens: ITENS, cards: CARDS() })

      pegar('c17')
      passarSobre('c17', 'c30')
      expect(cardsDe('Fazendo')).toEqual(['c17', 'c30'])
      await soltarSobre('c17', 's-2')

      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'c17', {
        StatePublicId: 's-2',
        AfterPublicId: null,
      })
      expect(avisos()).toEqual([{ tom: 'danger', texto }])
      expect(cardsDe('A fazer')).toEqual(['c16', 'c17', 'c18'])
      expect(cardsDe('Fazendo')).toEqual(['c30'])
      // As duas colunas e a contagem sao lidas de novo: "o quadro foi relido" e verdade.
      expect(espiao.reloadColumn.mock.calls.map(([chave]) => chave).sort()).toEqual(['s-1', 's-2'])
      expect(aoMudarColunas).toHaveBeenCalled()
    },
  )

  it.each([
    [
      'o servidor falhou',
      new PanelError('Erro interno.', 500),
      'Não deu para mudar o #17 de lugar. Ele voltou para onde estava — tente de novo.',
    ],
    [
      'sem rede',
      new PanelError('Falha de rede ao contatar a API.', 0),
      'Sem conexão: o #17 voltou para onde estava. Quando a internet voltar, arraste de novo.',
    ],
  ])(
    'mudar de lugar na mesma coluna que falha (%s): o card volta para onde estava',
    async (_caso, falha, texto) => {
      dublê.lugar.mockRejectedValueOnce(falha)
      montar({ itens: ITENS, cards: CARDS() })

      pegar('c17')
      await soltarSobre('c17', 'c18')

      expect(dublê.lugar).toHaveBeenCalledWith('p-1', 'c17', { AfterPublicId: 'c18' })
      expect(dublê.mover).not.toHaveBeenCalled()
      expect(avisos()).toEqual([{ tom: 'danger', texto }])
      expect(cardsDe('A fazer')).toEqual(['c16', 'c17', 'c18'])
    },
  )

  it.each([
    [
      'a API recusou com motivo',
      new PanelError('Esta pessoa nao esta no time.', 422),
      'O #17 ficou em Fazendo, mas o responsável não mudou: Esta pessoa não está no time.',
    ],
    [
      'sem rede',
      new PanelError('Falha de rede ao contatar a API.', 0),
      'Sem conexão: o #17 ficou em Fazendo, mas o responsável continua o de antes. Quando a internet voltar, arraste de novo.',
    ],
  ])(
    'a troca de raia que falha depois do movimento gravado (%s): o card fica na coluna nova, na raia de antes',
    async (_caso, falha, texto) => {
      dublê.responsavel.mockRejectedValueOnce(falha)
      montar({
        agrupar: 'assignee',
        itens: { 's-1': ['c17'], 's-2': ['c30'], 's-3': [] },
        cards: [
          card('c17', { Assignee: ANA }),
          card('c30', { StatePublicId: 's-2', Assignee: BRUNO }),
        ],
      })

      pegar('c17')
      passarSobre('c17', cellKey('s-2', 'u-b'))
      expect(cardsDe('Fazendo, Bruno')).toEqual(['c30', 'c17'])
      await soltarSobre('c17', cellKey('s-2', 'u-b'))

      expect(dublê.mover).toHaveBeenCalledTimes(1)
      expect(dublê.responsavel).toHaveBeenCalledWith('p-1', 'c17', { UserPublicId: 'u-b' })
      expect(avisos()).toEqual([{ tom: 'danger', texto }])
      expect(cardsDe('Fazendo, Ana')).toEqual(['c17'])
      expect(cardsDe('Fazendo, Bruno')).toEqual(['c30'])
      expect(cardsDe('A fazer, Ana')).toEqual([])
    },
  )
})

// ─── Q-01 ────────────────────────────────────────────────────────────────────

describe('o card nao vai e volta sem parar (Q-01)', () => {
  const ITENS = { 's-1': ['c1', 'c2'], 's-2': ['c3'], 's-3': [] }
  const CARDS = () => [card('c1'), card('c2'), card('c3', { StatePublicId: 's-2' })]
  const proximoQuadro = () =>
    act(() => {
      vi.advanceTimersToNextFrame()
    })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  it('um movimento entre celulas por quadro desenhado: a conta seguinte, no mesmo quadro, nao mexe', () => {
    const { espiao } = montar({ itens: ITENS, cards: CARDS() })

    pegar('c1')
    passarSobre('c1', 's-2')
    expect(cardsDe('Fazendo')).toEqual(['c3', 'c1'])
    // No mesmo quadro, a conta que aponta outra coluna — ou nenhuma, num instante — e
    // o vaivem que derrubava a tela.
    passarSobre('c1', 's-3')
    passarSobre('c1', null)
    expect(cardsDe('Fazendo')).toEqual(['c3', 'c1'])
    expect(cardsDe('Feito')).toEqual([])
    expect(espiao.setItems).toHaveBeenCalledTimes(1)

    // Assentada a tela, a proxima conta vale.
    proximoQuadro()
    passarSobre('c1', 's-3')
    expect(cardsDe('Feito')).toEqual(['c1'])
    expect(cardsDe('Fazendo')).toEqual(['c3'])
  })

  it('no teclado, o alvo vazio e de um instante: o card fica onde as setas o puseram, e e ali que ele e solto', async () => {
    montar({ itens: ITENS, cards: CARDS() })

    pegar('c1', 'teclado')
    passarSobre('c1', 's-2')
    proximoQuadro()
    passarSobre('c1', null)
    expect(cardsDe('Fazendo')).toEqual(['c3', 'c1'])
    expect(cardsDe('A fazer')).toEqual(['c2'])
    // O leitor de tela ouve onde o card esta, e nao que soltar devolve.
    expect(anuncioSobre('c1', null)).toBe('o card #1 em Fazendo, posição 2 de 2.')
    expect(anuncioAoSoltar('c1', null)).toBe('Soltou o card #1 em Fazendo, posição 2 de 2.')

    proximoQuadro()
    await soltarSobre('c1', null)
    expect(dublê.mover).toHaveBeenCalledTimes(1)
    expect(dublê.mover).toHaveBeenCalledWith('p-1', 'c1', {
      StatePublicId: 's-2',
      AfterPublicId: 'c3',
    })
    expect(cardsDe('Fazendo')).toEqual(['c3', 'c1'])
  })

  it('no mouse, fora das colunas o card volta para onde estava, e soltar ali nao grava', async () => {
    montar({ itens: ITENS, cards: CARDS() })

    pegar('c1')
    passarSobre('c1', 's-2')
    proximoQuadro()
    passarSobre('c1', null)
    expect(cardsDe('A fazer')).toEqual(['c1', 'c2'])
    expect(anuncioSobre('c1', null)).toBe('o card #1 fora das colunas: soltar aqui devolve o card.')
    expect(anuncioAoSoltar('c1', null)).toBe('o card #1 voltou para o lugar.')

    proximoQuadro()
    await soltarSobre('c1', null)
    expect(dublê.mover).not.toHaveBeenCalled()
    expect(dublê.lugar).not.toHaveBeenCalled()
    expect(cardsDe('A fazer')).toEqual(['c1', 'c2'])
  })
})

// ─── Q-17 ────────────────────────────────────────────────────────────────────

describe('com filtro (Q-17)', () => {
  /** O que o cabecalho da coluna diz da contagem, com o texto para leitor de tela. */
  const contagemDe = (nome: string) =>
    regiao(nome).querySelector('h2')?.nextElementSibling?.textContent

  const VAZIO = { 's-1': [], 's-2': [], 's-3': [] }

  it('o cabecalho diz quantos passam de quantos ha, e o leitor de tela ouve que e com os filtros', () => {
    montar({
      columns: [
        coluna('s-1', 'A fazer'),
        coluna('s-2', 'Fazendo'),
        coluna('s-3', 'Feito', { closes: true, last: true, total: 20 }),
      ],
      lastColumnDays: 14,
      itens: { 's-1': ['c1'], 's-2': ['c2', 'c3', 'c4'], 's-3': ['c5', 'c6'] },
      cards: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((id) => card(id)),
      filtro: { semFiltro: { 's-1': 8, 's-2': 3, 's-3': 20 }, aoLimpar: vi.fn() },
    })

    expect(contagemDe('A fazer')).toBe('1 de 8 cards, com os filtros')
    // A coluna em que o filtro nao deixou ninguem de fora nao diz "de".
    expect(contagemDe('Fazendo')).toBe('3 cards')
    // Na coluna da regra dos dias, a linha dos 14 dias ja diz que a conta e parcial.
    expect(contagemDe('Feito')).toBe('2 cards')
    expect(screen.queryByText(/Nenhum card passa nos filtros/)).toBeNull()
  })

  it('todas as colunas vazias pelo filtro: o quadro diz que os outros continuam onde estao, e "Limpar filtros" limpa', () => {
    const aoLimpar = vi.fn()
    montar({
      itens: VAZIO,
      cards: [],
      filtro: { semFiltro: { 's-1': 2, 's-2': 1, 's-3': 0 }, aoLimpar },
    })

    expect(
      screen.getByText('Nenhum card passa nos filtros. Os outros continuam onde estão.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(aoLimpar).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['sem filtro, o quadro vazio e so vazio', {}, null],
    ['com uma coluna ainda lendo', { 's-2': { loading: true } }, {}],
    ['com uma coluna que nao carregou', { 's-2': { failed: true } }, {}],
  ])('o bloco do filtro nao aparece %s', (_caso, estados, semFiltro) => {
    montar({
      itens: VAZIO,
      cards: [],
      estados,
      filtro: semFiltro === null ? null : { semFiltro, aoLimpar: vi.fn() },
    })

    expect(screen.queryByText(/Nenhum card passa nos filtros/)).toBeNull()
  })
})

// ─── Q-06 e Q-04 ─────────────────────────────────────────────────────────────

describe('o pe da coluna, logo depois do ultimo card (Q-06), e o cabecalho preso (Q-04)', () => {
  it('sem raias, o cabecalho fica fora da lista que rola; os cards rolam dentro dela', () => {
    montar({ itens: { 's-1': ['c1'], 's-2': [], 's-3': [] }, cards: [card('c1')] })

    const aFazer = regiao('A fazer')
    const lista = aFazer.querySelector('[data-board-scroll]')
    expect(lista?.contains(aFazer.querySelector('h2'))).toBe(false)
    expect(lista?.contains(noDoCard('c1'))).toBe(true)
  })

  it('"Mostrar mais" diz quantos vem — o que falta, ou uma pagina de quantos faltam — e mora logo depois do ultimo card', () => {
    const { espiao } = montar({
      itens: { 's-1': ['c1', 'c2', 'c3'], 's-2': ['c4', 'c5', 'c6'], 's-3': ['c7'] },
      cards: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'].map((id) => card(id)),
      estados: { 's-1': { total: 9, end: false }, 's-2': { total: 123, end: false } },
    })

    const mais = within(regiao('A fazer')).getByRole('button', { name: 'Mostrar mais 6' })
    expect(
      within(regiao('Fazendo')).getByRole('button', { name: 'Mostrar mais 50 de 120' }),
    ).toBeTruthy()
    // Lida a coluna inteira, nada a mostrar.
    expect(within(regiao('Feito')).queryByRole('button', { name: /^Mostrar mais/ })).toBeNull()

    const rola = regiao('A fazer').querySelector('[data-board-scroll]')
    expect(rola?.firstElementChild?.contains(noDoCard('c3'))).toBe(true)
    expect(rola?.contains(mais)).toBe(true)
    expect(
      noDoCard('c3').compareDocumentPosition(mais) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    fireEvent.click(mais)
    expect(espiao.loadMore).toHaveBeenCalledWith('s-1')
  })

  it('lendo a pagina seguinte, o botao espera', () => {
    montar({
      itens: { 's-1': ['c1'], 's-2': [], 's-3': [] },
      cards: [card('c1')],
      estados: { 's-1': { total: 9, end: false, loadingMore: true } },
    })

    const botao = within(regiao('A fazer')).getByRole('button', { name: 'Carregando…' })
    expect((botao as HTMLButtonElement).disabled).toBe(true)
  })

  it('no Feito, "Ultimos 14 dias · 2 na lista" sob o nome, e a nota dos escondidos logo depois do ultimo card; os dois levam a lista nessa coluna', () => {
    const { aoVerNaLista } = montar({
      columns: [
        coluna('s-1', 'A fazer'),
        coluna('s-2', 'Fazendo'),
        coluna('s-3', 'Feito', { closes: true, last: true, total: 5 }),
      ],
      lastColumnDays: 14,
      itens: { 's-1': [], 's-2': [], 's-3': ['c7', 'c8', 'c9'] },
      cards: ['c7', 'c8', 'c9'].map((id) => card(id, { StatePublicId: 's-3' })),
    })

    const feito = regiao('Feito')
    const regra = [...feito.querySelectorAll('p')].find((p) => p.textContent?.startsWith('Últimos'))
    expect(regra?.textContent).toBe('Últimos 14 dias · 2 na lista')
    fireEvent.click(within(feito).getByRole('button', { name: '2 na lista' }))
    expect(aoVerNaLista).toHaveBeenLastCalledWith('s-3')

    const nota = within(feito).getByText(
      /2 cards entraram aqui há mais de 14 dias e ficam só na lista/,
    )
    const rola = feito.querySelector('[data-board-scroll]')
    expect(nota.parentElement).toBe(rola)
    expect(rola?.firstElementChild?.contains(noDoCard('c9'))).toBe(true)
    fireEvent.click(within(nota).getByRole('button', { name: 'Ver na lista' }))
    expect(aoVerNaLista).toHaveBeenCalledTimes(2)
    expect(aoVerNaLista).toHaveBeenLastCalledWith('s-3')
  })

  it('a coluna que nao carregou diz logo abaixo do cabecalho, sem o "Nenhum card", e tenta de novo', () => {
    const { espiao } = montar({
      itens: { 's-1': [], 's-2': [], 's-3': [] },
      cards: [],
      estados: { 's-1': { failed: true } },
    })

    const aFazer = regiao('A fazer')
    expect(within(aFazer).getByText('Não deu para carregar esta coluna.')).toBeTruthy()
    expect(within(aFazer).queryByText('Nenhum card')).toBeNull()
    fireEvent.click(within(aFazer).getByRole('button', { name: 'Tentar de novo' }))
    expect(espiao.loadColumn).toHaveBeenCalledWith('s-1')
  })
})

// ─── Q-11 e Q-13 ─────────────────────────────────────────────────────────────

describe('no teclado (Q-11, Q-13)', () => {
  /** O topo de cada card na tela, com 40 de altura: o jsdom nao mede nada. */
  function medirCards(topos: Record<string, number>) {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const id = this instanceof HTMLElement ? this.dataset.card : undefined
      const topo = id === undefined ? undefined : topos[id]
      return topo === undefined ? retangulo({}) : retangulo({ top: topo, width: 272, height: 40 })
    })
  }

  /** Aperta a tecla no card com o foco; devolve se o navegador seguiria com ela. */
  const tecla = (key: string, extra: Partial<KeyboardEventInit> = {}) =>
    fireEvent.keyDown(document.activeElement ?? document.body, { key, ...extra })

  const QUATRO = [
    coluna('s-1', 'A fazer'),
    coluna('s-2', 'Fazendo'),
    coluna('s-3', 'Revisão'),
    coluna('s-4', 'Feito', { closes: true, last: true }),
  ]

  it('o quadro e uma parada so do Tab: o primeiro card, e depois o ultimo que teve o foco', () => {
    const { espiao } = montar({
      itens: { 's-1': ['c1', 'c2'], 's-2': ['c3'], 's-3': [] },
      cards: [card('c1'), card('c2'), card('c3', { StatePublicId: 's-2' })],
    })

    expect(paradas()).toEqual(['c1'])
    const todos = [...document.querySelectorAll<HTMLElement>('[data-card]')]
    expect(todos.map((no) => no.tabIndex).sort()).toEqual([-1, -1, 0])

    act(() => noDoCard('c3').focus())
    expect(paradas()).toEqual(['c3'])
    // O "Criar" de cada coluna continua sendo uma parada.
    expect(screen.getByRole('button', { name: 'Criar card em Fazendo' }).tabIndex).toBe(0)

    // O card que tinha a vez saiu do quadro: a vez volta ao primeiro.
    act(() => screen.getByRole('button', { name: 'Criar card em A fazer' }).focus())
    act(() => espiao.board?.setItems({ 's-1': ['c1', 'c2'], 's-2': [], 's-3': [] }))
    expect(paradas()).toEqual(['c1'])
  })

  it('as setas andam: para cima e para baixo na coluna, Home e End nas pontas, e para os lados o card da proxima coluna com card, na mesma altura', () => {
    montar({
      columns: QUATRO,
      itens: { 's-1': ['c1', 'c2', 'c3'], 's-2': [], 's-3': ['c4', 'c5', 'c6'], 's-4': [] },
      cards: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((id) => card(id)),
    })
    medirCards({ c1: 100, c2: 200, c3: 300, c4: 120, c5: 210, c6: 330 })
    act(() => noDoCard('c1').focus())

    // As setas nao rolam a pagina: elas sao do quadro.
    expect(tecla('ArrowDown')).toBe(false)
    expect(document.activeElement).toBe(noDoCard('c2'))
    expect(paradas()).toEqual(['c2'])
    tecla('End')
    expect(document.activeElement).toBe(noDoCard('c3'))
    tecla('Home')
    expect(document.activeElement).toBe(noDoCard('c1'))
    tecla('ArrowUp')
    expect(document.activeElement).toBe(noDoCard('c1'))

    tecla('ArrowDown')
    // Fazendo esta vazia: a seta vai a Revisao, ao card mais perto da altura do #2.
    tecla('ArrowRight')
    expect(document.activeElement).toBe(noDoCard('c5'))
    // Depois de Revisao, so o Feito vazio: o foco fica.
    tecla('ArrowRight')
    expect(document.activeElement).toBe(noDoCard('c5'))
    tecla('ArrowLeft')
    expect(document.activeElement).toBe(noDoCard('c2'))

    // Com Shift (ou outro modificador), a tecla nao e do quadro.
    expect(tecla('ArrowDown', { shiftKey: true })).toBe(true)
    expect(document.activeElement).toBe(noDoCard('c2'))
  })

  it('Enter abre o card: o card e um link para ele, e nem o quadro nem o arraste seguram o Enter', () => {
    montar({
      itens: { 's-1': ['c1', 'c2'], 's-2': [], 's-3': [] },
      cards: [card('c1'), card('c2')],
    })

    const segundo = noDoCard('c2')
    expect(segundo.getAttribute('href')).toBe('/projects/p-1/reports/c2')
    act(() => segundo.focus())
    // O Enter segue para o navegador, que abre o link (o jsdom nao segue link pelo Enter).
    expect(fireEvent.keyDown(segundo, { key: 'Enter', code: 'Enter' })).toBe(true)
    expect(arraste.pegou).not.toHaveBeenCalled()
    fireEvent.click(segundo)
    expect(screen.getByTestId('endereco').textContent).toBe('/projects/p-1/reports/c2')
  })

  it('com o card na mao, as setas sao do arraste: o foco nao anda', () => {
    montar({
      itens: { 's-1': ['c1', 'c2'], 's-2': [], 's-3': [] },
      cards: [card('c1'), card('c2')],
    })
    act(() => noDoCard('c1').focus())

    pegar('c1', 'teclado')
    tecla('ArrowDown')
    expect(document.activeElement).toBe(noDoCard('c1'))

    desistir('c1')
    tecla('ArrowDown')
    expect(document.activeElement).toBe(noDoCard('c2'))
  })

  it('no arraste pelo teclado, o lugar reservado e o proprio card, marcado, e a copia erguida some; Esc desiste sem gravar', async () => {
    montar({
      itens: { 's-1': ['c1', 'c2'], 's-2': [], 's-3': [] },
      cards: [card('c1'), card('c2')],
    })
    const primeiro = noDoCard('c1')
    act(() => primeiro.focus())

    fireEvent.keyDown(primeiro, { key: ' ', code: 'Space' })
    expect(arraste.pegou).toHaveBeenCalledWith('keydown')

    const item = primeiro.closest('li') as HTMLElement
    expect(item.className).toContain('outline-dashed')
    expect(item.className).toContain('outline-offset-2')
    expect(item.className).not.toContain('bg-surface-strong')
    expect(primeiro.className).not.toContain('invisible')
    expect(copiaErguida('Card c1')?.closest('.opacity-0')).not.toBeNull()

    // O teclado do arraste passa a ouvir no instante seguinte.
    await umInstante()
    fireEvent.keyDown(primeiro, { key: 'Escape', code: 'Escape' })
    await umInstante()
    expect(item.className).not.toContain('outline-dashed')
    expect(cardsDe('A fazer')).toEqual(['c1', 'c2'])
    expect(dublê.mover).not.toHaveBeenCalled()
    expect(dublê.lugar).not.toHaveBeenCalled()
  })

  it('no mouse, o lugar reservado e uma caixa tracejada, e a copia erguida segue o ponteiro', async () => {
    montar({
      itens: { 's-1': ['c1', 'c2'], 's-2': [], 's-3': [] },
      cards: [card('c1'), card('c2')],
    })
    const primeiro = noDoCard('c1')

    fireEvent.mouseDown(primeiro, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.mouseMove(primeiro, { clientX: 30, clientY: 10 })
    expect(arraste.pegou).toHaveBeenCalledWith('mousedown')

    const item = primeiro.closest('li') as HTMLElement
    expect(item.className).toContain('outline-dashed')
    expect(item.className).toContain('bg-surface-strong')
    expect(primeiro.className).toContain('invisible')
    expect(copiaErguida('Card c1')?.closest('.opacity-0')).toBeNull()

    fireEvent.mouseUp(primeiro)
    // O sensor tira os ouvintes do documento um instante depois de soltar.
    await umInstante(60)
    expect(dublê.mover).not.toHaveBeenCalled()
  })
})

// ─── Q-10 e Q-03 ─────────────────────────────────────────────────────────────

describe('no toque e na tela estreita (Q-10, Q-03)', () => {
  /**
   * A area do quadro e as colunas na tela, rolada `deslocamento` para a direita: o
   * jsdom nao mede nada.
   */
  function medirColunas(
    area: { left: number; right: number },
    colunas: Record<string, [number, number]>,
  ) {
    const tela = { deslocamento: 0 }
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const chave = this instanceof HTMLElement ? this.dataset.column : undefined
      const lugar = chave === undefined ? undefined : colunas[chave]
      if (lugar) {
        const [esquerda, direita] = lugar
        return retangulo({
          left: esquerda - tela.deslocamento,
          width: direita - esquerda,
          height: 600,
        })
      }
      if (this.querySelector(':scope > [data-column]'))
        return retangulo({ left: area.left, width: area.right - area.left, height: 600 })
      return retangulo({})
    })
    return tela
  }

  const ITENS = { 's-1': ['c1', 'c2'], 's-2': ['c3'], 's-3': [] }
  const CARDS = () => [card('c1'), card('c2'), card('c3', { StatePublicId: 's-2' })]

  describe('segurar para pegar', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vi.fn() })
    })

    afterEach(() => {
      // O sensor tira os ouvintes do documento um instante depois de soltar.
      act(() => {
        vi.runOnlyPendingTimers()
      })
      Reflect.deleteProperty(navigator, 'vibrate')
    })

    it('segurar 450 ms pega o card, e o aparelho vibra; antes disso, nao', () => {
      montar({ itens: ITENS, cards: CARDS() })
      const primeiro = noDoCard('c1')

      fireEvent.touchStart(primeiro, { touches: [{ clientX: 10, clientY: 10 }] })
      act(() => {
        vi.advanceTimersByTime(449)
      })
      expect(arraste.pegou).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(arraste.pegou).toHaveBeenCalledWith('touchstart')
      expect(navigator.vibrate).toHaveBeenCalledWith(15)

      fireEvent.touchEnd(primeiro)
    })

    it('deslizar o dedo antes disso continua rolando: o card nao e pego', () => {
      montar({ itens: ITENS, cards: CARDS() })
      const primeiro = noDoCard('c1')

      fireEvent.touchStart(primeiro, { touches: [{ clientX: 10, clientY: 10 }] })
      act(() => {
        vi.advanceTimersByTime(200)
      })
      fireEvent.touchMove(primeiro, { touches: [{ clientX: 10, clientY: 30 }] })
      act(() => {
        vi.advanceTimersByTime(600)
      })
      expect(arraste.pegou).not.toHaveBeenCalled()
      expect(navigator.vibrate).not.toHaveBeenCalled()

      fireEvent.touchEnd(primeiro)
    })
  })

  it('na borda, o quadro anda uma coluna por vez, com uma pausa entre uma e outra; longe da borda, fica parado', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    // O relogio de mentira comeca no zero: a primeira coluna anda sem esperar a pausa.
    vi.advanceTimersByTime(1000)
    medirColunas(
      { left: 0, right: 1000 },
      { 's-1': [0, 272], 's-2': [284, 556], 's-3': [568, 840] },
    )
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset.column ? 272 : 0
    })
    montar({ itens: ITENS, cards: CARDS() })
    const area = areaDoQuadro()
    const rolar = vi.fn()
    Object.assign(area, { scrollBy: rolar })

    // No mouse, quem rola o quadro e a biblioteca.
    pegar('c1')
    expect(podeRolar(area)).toBe(true)
    desistir('c1')

    const toque = eventoQuePega('toque', { x: 500, y: 300 })
    pegar('c1', toque)
    // No toque sem raias, a biblioteca nao rola a area do quadro: quem rola e a borda.
    expect(podeRolar(area)).toBe(false)

    moverDedo('c1', toque, 480)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(rolar).toHaveBeenCalledTimes(1)
    expect(rolar).toHaveBeenLastCalledWith({ left: 284, behavior: 'smooth' })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(rolar).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(rolar).toHaveBeenCalledTimes(2)

    moverDedo('c1', toque, -480)
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(rolar).toHaveBeenLastCalledWith({ left: -284, behavior: 'smooth' })

    const vezes = rolar.mock.calls.length
    moverDedo('c1', toque, 0)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(rolar).toHaveBeenCalledTimes(vezes)

    // Solto o card, a borda para.
    desistir('c1')
    moverDedo('c1', toque, 480)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(rolar).toHaveBeenCalledTimes(vezes)
  })

  it('no celular, a fila de colunas diz quantos cards cada uma tem, marca a que esta a vista e leva ate ela', () => {
    const tela = medirColunas(
      { left: 0, right: 390 },
      { 's-1': [16, 347], 's-2': [359, 690], 's-3': [702, 1033] },
    )
    montar({ itens: ITENS, cards: CARDS() })
    const area = areaDoQuadro()
    const rolar = vi.fn()
    Object.assign(area, { scrollBy: rolar })
    // A margem do quadro no celular.
    area.style.paddingLeft = '16px'

    const fila = screen.getByRole('navigation', { name: 'Colunas do quadro' })
    const botoes = within(fila).getAllByRole('button')
    expect(botoes.map((botao) => botao.textContent)).toEqual(['A fazer2', 'Fazendo1', 'Feito0'])
    expect(botoes.map((botao) => botao.getAttribute('aria-current'))).toEqual(['true', null, null])

    fireEvent.click(within(fila).getByRole('button', { name: /^Feito/ }))
    // So o quadro rola, e a coluna fica no comeco da tela, depois da margem.
    expect(rolar).toHaveBeenCalledWith({ left: 702 - 16, behavior: 'smooth' })

    tela.deslocamento = 686
    fireEvent.scroll(area)
    expect(botoes.map((botao) => botao.getAttribute('aria-current'))).toEqual([null, null, 'true'])
  })

  it('a coluna escondida a direita diz o nome na borda, e o botao rola so o quadro ate ela (Q-03)', () => {
    const rolarPagina = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
    const tela = medirColunas(
      { left: 0, right: 700 },
      { 's-1': [0, 272], 's-2': [284, 556], 's-3': [568, 840] },
    )
    montar({ itens: ITENS, cards: CARDS() })
    const area = areaDoQuadro()
    const rolar = vi.fn()
    Object.assign(area, { scrollBy: rolar })

    const ir = screen.getByRole('button', { name: 'Ir para a coluna Feito' })
    expect(ir.textContent).toBe('Feito›')
    fireEvent.click(ir)
    expect(rolar).toHaveBeenCalledWith({ left: 140, behavior: 'smooth' })
    expect(rolarPagina).not.toHaveBeenCalled()

    // Rolado o quadro, nada mais fica escondido: o nome sai da borda.
    tela.deslocamento = 140
    fireEvent.scroll(area)
    expect(screen.queryByRole('button', { name: /^Ir para a coluna/ })).toBeNull()
  })
})
