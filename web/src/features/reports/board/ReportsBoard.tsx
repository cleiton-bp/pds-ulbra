import {
  type Announcements,
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS, getEventCoordinates } from '@dnd-kit/utilities'
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  MAX_CARD_TITLE_LENGTH,
  type ProjectPriorityViewModel,
  type PublicOutcome,
  type ReportDetailViewModel,
  type ReportSummaryViewModel,
  type TeamMemberViewModel,
} from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { isPanelError } from '@/data/errors'
import { BoardCardFace } from '@/features/reports/board/BoardCardFace'
import { boardCollision } from '@/features/reports/board/boardCollision'
import { boardKeyboardCoordinates } from '@/features/reports/board/boardKeyboard'
import {
  type BoardColumn,
  type BoardItems,
  type BoardLane,
  boardCells,
  boardLanes,
  cardAbove,
  cellKey,
  columnOf,
  type LaneBy,
  laneOfCard,
  moveBetween,
  moveToCell,
  NO_LANE,
  splitCell,
} from '@/features/reports/board/boardState'
import {
  BOARD_PAGE_SIZE,
  type Board,
  type BoardColumnState,
} from '@/features/reports/board/useBoard'
import { CloseReportDialog } from '@/features/reports/CloseReportDialog'
import { useKeepFocus } from '@/features/reports/useKeepFocus'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { cn } from '@/shared/lib/cn'
import { formatRelative } from '@/shared/lib/datetime'

/** O mouse so pega depois de andar alguns pixels: o clique continua abrindo o card. */
const MOUSE = { activationConstraint: { distance: 6 } }

/**
 * No toque, segurar um instante: deslizar o dedo continua rolando o quadro. Meio
 * segundo, e nao um quarto: quem le a coluna rolando com pausas pegava o card sem
 * querer, e a ordem nova era gravada sem ninguem perceber.
 */
const TOQUE = { activationConstraint: { delay: 450, tolerance: 8 } }

/** Quanto tempo depois de soltar o clique ainda e o do proprio soltar. */
const CLIQUE_DO_SOLTAR_MS = 300

/** No toque, a faixa da borda que rola o quadro, e quanto ele espera entre uma coluna e a outra. */
const BORDA_DO_TOQUE_PX = 48
const PAUSA_POR_COLUNA_MS = 600

/** As teclas que andam entre os cards fora do arraste. */
const TECLAS_DE_ANDAR = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']

/** Como o card foi pego: muda o que a tela mostra enquanto ele esta na mao. */
type Mao = 'ponteiro' | 'toque' | 'teclado'

/** Um card solto num lugar novo, esperando a API — ou o desfecho, na coluna que encerra. */
interface Soltura {
  id: string
  de: string
  /** O lugar de antes na coluna de origem: e para onde o card volta se algo der errado. */
  indice: number
  para: string
  /** O lugar na coluna de destino, para po-lo de volta ali numa segunda tentativa. */
  indicePara: number
  /** O card logo acima, no lugar novo; nulo e o topo. */
  acima: string | null
  /** A raia de onde saiu e a raia onde caiu; nulas sem raias. */
  raiaDe: string | null
  raiaPara: string | null
}

/** O que acompanha a gravacao: o desfecho, na coluna que encerra; o sim de reabrir, ao sair dela. */
interface Confirmado {
  fim?: { Outcome: PublicOutcome; Reason: string }
  reabrir?: boolean
}

/**
 * O quadro: uma coluna por estado, os cards na ordem que o time arrumou.
 *
 * **Arrastar e o mesmo movimento do seletor de coluna**, com o lugar junto: a API
 * grava o evento, a etapa publica anda pela espera, e soltar um relato aberto na
 * coluna que encerra pede o desfecho e o motivo antes de mover. **Tirar dela um relato
 * encerrado pergunta antes**: a API o reabre, e quem relatou deixa de ver o
 * encerramento. Arrumar dentro da coluna so muda o lugar — sem evento.
 *
 * **Na altura da janela.** Cada coluna rola por dentro, com o cabecalho e o "Criar"
 * presos no alto, e a barra de rolar para os lados fica sempre a vista no pe da tela:
 * o quadro tinha a altura da coluna mais comprida, e a barra, o "Criar" e o "Mostrar
 * mais" moravam milhares de pixels abaixo. Na borda, a coluna escondida diz o nome.
 *
 * **Mouse, toque e teclado.** O mouse pega depois de andar alguns pixels, entao o
 * clique continua abrindo o card. O toque pede segurar um instante, e deslizar
 * continua rolando o quadro. No teclado, **o quadro e uma parada so do Tab**: as setas
 * andam entre os cards, Home e End vao ao primeiro e ao ultimo da coluna, Enter abre
 * (o card e um link) e espaco pega; com o card na mao, as setas escolhem o lugar,
 * espaco (ou Enter) solta e Esc desiste. Soltar fora das colunas que recebem devolve
 * o card.
 *
 * **A tela mostra o lugar antes da resposta**, e volta atras se a API recusar: so o
 * card que nao andou volta, e as duas colunas envolvidas sao lidas de novo.
 *
 * **Raias.** Agrupado por responsavel ou por prioridade, cada coluna se divide em
 * celulas, uma por raia, e o arraste passa a ser de celula em celula: soltar em outra
 * raia troca o responsavel (ou a prioridade) do card, e na diagonal muda a coluna e a
 * raia juntas. A raia e um recorte do que ja foi lido — a coluna continua lida de 50
 * em 50, com o "Mostrar mais" embaixo de todas as raias e o "Criar" no cabecalho.
 */
export function ReportsBoard({
  projectPublicId,
  board,
  columns,
  soonDays,
  lastColumnDays,
  aoMudarColunas,
  aoVerNaLista,
  aoCriar,
  aoCriadoNaColuna,
  sprintPublicId,
  destacados,
  agrupar = 'none',
  prioridades = null,
  pessoas = null,
  filtro = null,
  revelar = null,
}: {
  projectPublicId: string
  board: Board
  columns: BoardColumn[]
  soonDays: number
  /** A regra do Ciclo para a ultima coluna; zero quando ela mostra todos (ou ainda nao chegou). */
  lastColumnDays: number
  /** Um card trocou de coluna: a contagem das colunas precisa ser lida de novo. */
  aoMudarColunas: () => void
  /** Os escondidos da ultima coluna, na lista. */
  aoVerNaLista: (chave: string) => void
  /** O dialogo completo do card novo, ja nesta coluna e com o titulo que foi digitado. */
  aoCriar: (chave: string, titulo: string) => void
  /** O card criado pelo campo do alto da coluna, ja no quadro: a tela conta e avisa. */
  aoCriadoNaColuna: (card: ReportDetailViewModel, coluna: string) => void
  /** Com a sprint ligada, a em andamento: o card criado numa coluna do quadro entra nela. */
  sprintPublicId?: string
  /** Os cards que outra pessoa acabou de mudar: piscam um contorno por um instante. */
  destacados: ReadonlySet<string>
  /** As raias: nada, por responsavel, ou por prioridade. */
  agrupar?: LaneBy
  /** As prioridades do projeto, para a ordem das raias de prioridade. */
  prioridades?: ProjectPriorityViewModel[] | null
  /** O time, para as raias de quem esta sem card. */
  pessoas?: TeamMemberViewModel[] | null
  /**
   * Com filtro ligado: quantos cards cada coluna tem sem ele ("2 de 10") e como limpar.
   * Nulo sem filtro.
   */
  filtro?: { semFiltro: Record<string, number> | null; aoLimpar: () => void } | null
  /** O card que acabou de nascer pelo dialogo: o quadro rola ate ele. */
  revelar?: string | null
}) {
  const porRaia = agrupar === 'none' ? null : agrupar

  // A raia de cada card vem do dado dele, menos a do card que esta na mao: esse fica
  // na raia em que foi solto ate a API responder (`forcadas`).
  const cardsRef = useRef(board.cards)
  cardsRef.current = board.cards
  const [, setForcadas] = useState<Record<string, string>>({})
  const forcadasRef = useRef<Record<string, string>>({})
  const forcar = (id: string, raia: string | null) => {
    const novo = { ...forcadasRef.current }
    if (raia === null || (porRaia && raia === laneOfCard(cardsRef.current[id], porRaia)))
      delete novo[id]
    else novo[id] = raia
    forcadasRef.current = novo
    setForcadas(novo)
  }

  // As raias saem do dado dos cards lidos — e nao das forcadas: a raia de onde o card
  // saiu fica na tela ate a API responder.
  const raias: BoardLane[] | null = porRaia
    ? boardLanes(
        columns.flatMap((coluna) =>
          (board.items[coluna.key] ?? []).flatMap((id) => {
            const card = board.cards[id]
            return card ? [card] : []
          }),
        ),
        porRaia,
        prioridades,
        pessoas,
      )
    : null

  const comRaias = raias !== null

  // As colunas e as raias numa referencia: a conta das setas le as de agora a cada
  // tecla, e as opcoes do teclado continuam as mesmas entre uma renderizacao e outra.
  const colunasRef = useRef(columns)
  colunasRef.current = columns
  const raiasRef = useRef<string[] | null>(null)
  raiasRef.current = raias?.map((raia) => raia.key) ?? null
  const porRaiaRef = useRef(porRaia)
  porRaiaRef.current = porRaia

  /**
   * Os cards de cada celula agora — sem raias, de cada coluna. Lida na hora, por quem
   * arrasta: a ordem muda no meio do arraste, antes da proxima renderizacao.
   */
  const celulasRef = useMemo<RefObject<BoardItems>>(
    () => ({
      get current() {
        const por = porRaiaRef.current
        return boardCells(
          board.itemsRef.current,
          colunasRef.current.map((coluna) => coluna.key),
          raiasRef.current,
          (id) =>
            forcadasRef.current[id] ?? (por ? laneOfCard(cardsRef.current[id], por) : NO_LANE),
        )
      },
    }),
    [board.itemsRef],
  )

  const teclado = useMemo(
    () => ({
      coordinateGetter: boardKeyboardCoordinates(colunasRef, celulasRef, raiasRef),
      // Espaco pega; espaco, Enter e Tab soltam; Esc desiste. Fora do arraste, o Enter
      // fica com o link, que abre o card — e no meio dele, se nao soltasse, abriria o
      // card com o arraste ainda valendo por tras do dialogo.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter', 'Tab'] },
    }),
    [celulasRef],
  )
  const colisao = useMemo(() => boardCollision(celulasRef), [celulasRef])

  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE),
    useSensor(TouchSensor, TOQUE),
    useSensor(KeyboardSensor, teclado),
  )

  const porChave = Object.fromEntries(columns.map((coluna) => [coluna.key, coluna]))
  /** A celula de um alvo do arraste: a propria, ou a do card. */
  const chaveDe = (celulas: BoardItems, id: string) => (id in celulas ? id : columnOf(celulas, id))
  const recebe = (celula: string) => {
    const { coluna, raia } = splitCell(celula)
    return (
      porChave[coluna]?.accepts === true &&
      (raia === null || raias?.find((linha) => linha.key === raia)?.accepts !== false)
    )
  }
  const nomeDaRaia = (raia: string | null) =>
    raia === null ? '' : (raias?.find((linha) => linha.key === raia)?.name ?? '')

  const [ativo, setAtivo] = useState<string | null>(null)
  // O card na mao, para quem precisa saber na hora — a tecla que chega antes da
  // proxima renderizacao.
  const ativoRef = useRef<string | null>(null)
  const [mao, setMao] = useState<Mao>('ponteiro')
  const maoRef = useRef<Mao>('ponteiro')
  /** De onde o card saiu: a celula, e a coluna e o lugar nela, para voltar. */
  const inicio = useRef<{
    celula: string
    de: string
    indice: number
    raia: string | null
  } | null>(null)
  const [encerrando, setEncerrando] = useState<Soltura | null>(null)
  const [salvandoEncerramento, setSalvandoEncerramento] = useState(false)
  /** O relato encerrado tirado da coluna que encerra, esperando o sim de reabrir. */
  const [reabrindo, setReabrindo] = useState<Soltura | null>(null)
  /** O sim ja foi dado: fechar a pergunta depois dele nao devolve o card. */
  const reabrirConfirmado = useRef(false)
  /**
   * A altura de cada raia no instante em que o card foi pego. Enquanto ele esta na mao,
   * as raias nao crescem: a celula atravessada na diagonal recebia o card, a raia dela
   * crescia, e a de baixo — o alvo — fugia de debaixo do ponteiro.
   */
  const [congeladas, setCongeladas] = useState<Record<string, number> | null>(null)

  /**
   * Um movimento entre celulas por quadro desenhado. Mover o card muda a altura das
   * duas colunas, e a conta de onde ele esta podia apontar de volta a celula de onde
   * ele acabou de sair — ou nenhuma, num instante —, e o card ia e voltava sem parar:
   * a tela inteira caia. A proxima conta vale depois que a tela assentou.
   */
  const travado = useRef(false)
  const travar = () => {
    travado.current = true
    requestAnimationFrame(() => {
      travado.current = false
    })
  }

  // O que outra pessoa muda espera a mao terminar: o arraste, o movimento gravando e o
  // desfecho (ou o sim de reabrir) aberto seguram as releituras do tempo real (ver
  // `board.hold`).
  const soltarArraste = useRef<(() => void) | null>(null)
  const soltarDesfecho = useRef<(() => void) | null>(null)
  const perguntando = encerrando ?? reabrindo
  useEffect(() => {
    if (perguntando !== null) return
    soltarDesfecho.current?.()
    soltarDesfecho.current = null
  }, [perguntando])
  const largarArraste = () => {
    soltarArraste.current?.()
    soltarArraste.current = null
  }
  // Sair do quadro no meio da mao — trocar para a lista com o desfecho aberto — solta o
  // que ela segurava: os avisos continuam chegando, e a releitura presa deixaria o
  // quadro parado na volta.
  useEffect(
    () => () => {
      soltarArraste.current?.()
      soltarDesfecho.current?.()
    },
    [],
  )

  // O clique que vem junto do soltar nao abre o card. Ele cai no card quando o dedo
  // segura, pega e solta sem andar; a biblioteca o engole antes do React — nem o
  // link nem quem o guardasse ali o veem —, mas nao impede o navegador de seguir o
  // link, e a pagina inteira recarregava no endereco do card. Por isso a guarda fica
  // na janela, antes de todos: vale do pegar ate um instante depois de soltar, e para
  // no primeiro clique. O instante e o de quando o navegador criou o clique, e nao o
  // de quando ele chega: depois de soltar, o quadro inteiro se redesenha. O arraste
  // pelo teclado nao clica, e o Enter logo depois de soltar continua abrindo o card.
  const fimDoArraste = useRef(Number.NEGATIVE_INFINITY)
  useEffect(() => {
    const guarda = (evento: MouseEvent) => {
      const fim = fimDoArraste.current
      if (fim === Number.POSITIVE_INFINITY) {
        // No meio do arraste, nao abre, e a guarda continua de pe para o soltar.
        evento.preventDefault()
        return
      }
      if (evento.timeStamp - fim > CLIQUE_DO_SOLTAR_MS) return
      fimDoArraste.current = Number.NEGATIVE_INFINITY
      evento.preventDefault()
    }
    window.addEventListener('click', guarda, true)
    return () => window.removeEventListener('click', guarda, true)
  }, [])
  const marcarFimDoArraste = () => {
    if (fimDoArraste.current === Number.POSITIVE_INFINITY) fimDoArraste.current = performance.now()
  }

  // Devolve so este card ao lugar de antes: o resto do quadro pode ter mudado enquanto
  // ele andava — outro card solto, uma coluna relida, uma pagina a mais. E a raia
  // volta a ser a do dado dele.
  const devolver = (id: string, de: string, indice: number) => {
    forcar(id, null)
    board.setItems(moveBetween(board.itemsRef.current, id, de, indice))
  }

  /** Leva o card para a celula, no lugar `indice` dela. */
  const levar = (id: string, celula: string, indice: number, celulas: BoardItems) => {
    const { coluna, raia } = splitCell(celula)
    forcar(id, raia)
    board.setItems(moveToCell(board.itemsRef.current, id, coluna, celulas[celula] ?? [], indice))
  }

  /** O fim da mao: o card solto, devolvido ou desistido. */
  const largarMao = () => {
    setAtivo(null)
    ativoRef.current = null
    setCongeladas(null)
    dedo.current = null
    marcarFimDoArraste()
    largarArraste()
  }

  function aoPegar({ active, activatorEvent }: DragStartEvent) {
    const id = String(active.id)
    const celula = columnOf(celulasRef.current, id)
    const de = columnOf(board.itemsRef.current, id)
    if (!celula || !de) return

    inicio.current = {
      celula,
      de,
      indice: (board.itemsRef.current[de] ?? []).indexOf(id),
      raia: splitCell(celula).raia,
    }
    const nova: Mao =
      activatorEvent.type === 'keydown'
        ? 'teclado'
        : activatorEvent.type.startsWith('touch')
          ? 'toque'
          : 'ponteiro'
    maoRef.current = nova
    setMao(nova)
    // No celular, um toque curto diz que pegou — onde houver como.
    if (nova === 'toque') navigator.vibrate?.(15)
    if (nova !== 'teclado') fimDoArraste.current = Number.POSITIVE_INFINITY
    if (porRaia && area.current) {
      const alturas: Record<string, number> = {}
      for (const linha of area.current.querySelectorAll<HTMLElement>('[data-lane-row]'))
        alturas[linha.dataset.laneRow ?? ''] = linha.offsetHeight
      setCongeladas(alturas)
    }
    largarArraste()
    soltarArraste.current = board.hold()
    ativoRef.current = id
    setAtivo(id)
  }

  function aoPassar({ active, over }: DragOverEvent) {
    if (travado.current) return
    const id = String(active.id)
    const celulas = celulasRef.current
    const de = columnOf(celulas, id)
    const comeco = inicio.current

    // Fora das colunas que recebem: o card volta para a coluna de onde saiu. No
    // teclado o alvo so some por um instante — a coluna rolando ate o lugar, o card
    // trocando de lista —, e o card fica onde esta.
    if (!over) {
      if (maoRef.current === 'teclado') return
      if (comeco && de !== comeco.celula) {
        devolver(id, comeco.de, comeco.indice)
        travar()
      }
      return
    }

    const para = chaveDe(celulas, String(over.id))
    if (!de || !para || de === para || !recebe(para)) return

    // Sobre um card: antes ou depois dele, pelo meio dele. Sobre a celula vazia, no fim.
    // No teclado, a ponta de cima do card e o ponteiro (ver `boardCollision`).
    const destino = celulas[para] ?? []
    const indiceDoOutro = destino.indexOf(String(over.id))
    const translado = active.rect.current.translated
    const passouDoMeio = translado !== null && translado.top > over.rect.top + over.rect.height / 2
    const indice = indiceDoOutro >= 0 ? indiceDoOutro + (passouDoMeio ? 1 : 0) : destino.length

    levar(id, para, indice, celulas)
    travar()
  }

  // No toque, a borda do quadro anda uma coluna por vez, com uma pausa entre uma e
  // outra: a rolagem da biblioteca corria da primeira ate a ultima em dois segundos, e
  // cair na vizinha pedia tirar o dedo no instante certo.
  const dedo = useRef<number | null>(null)
  function aoMover({ activatorEvent, delta }: DragMoveEvent) {
    if (maoRef.current !== 'toque') return
    const comeco = getEventCoordinates(activatorEvent)
    dedo.current = comeco ? comeco.x + delta.x : null
  }
  const passoAPasso = ativo !== null && mao === 'toque' && raias === null
  useEffect(() => {
    if (!passoAPasso) return
    let ultimo = 0
    const passo = setInterval(() => {
      const el = area.current
      const x = dedo.current
      if (!el || x === null || performance.now() - ultimo < PAUSA_POR_COLUNA_MS) return
      const caixa = el.getBoundingClientRect()
      const sentido =
        x > caixa.right - BORDA_DO_TOQUE_PX ? 1 : x < caixa.left + BORDA_DO_TOQUE_PX ? -1 : 0
      if (sentido === 0) return
      ultimo = performance.now()
      const largura = el.querySelector<HTMLElement>('[data-column]')?.offsetWidth ?? caixa.width
      el.scrollBy({ left: sentido * (largura + 12), behavior: 'smooth' })
    }, 100)
    return () => clearInterval(passo)
  }, [passoAPasso])

  function aoSoltar({ active, over }: DragEndEvent) {
    const porTeclado = maoRef.current === 'teclado'
    largarMao()
    // Solta antes de gravar: a gravacao segura por conta propria, ja na primeira linha.

    const id = String(active.id)
    const comeco = inicio.current
    inicio.current = null
    if (!comeco) return

    const celulas = celulasRef.current
    const para = columnOf(celulas, id)

    // No teclado, o alvo vazio e de um instante: o card fica onde as setas o puseram.
    if ((!over && !porTeclado) || !para || !recebe(para)) {
      devolver(id, comeco.de, comeco.indice)
      return
    }

    // Na mesma celula, o lugar final e o do card sobre o qual ele foi solto.
    const ids = celulas[para] ?? []
    const alvo =
      over && chaveDe(celulas, String(over.id)) === para ? ids.indexOf(String(over.id)) : -1
    const daqui = ids.indexOf(id)
    if (alvo >= 0 && alvo !== daqui) levar(id, para, alvo, celulas)

    const { coluna, raia } = splitCell(para)
    const final = board.itemsRef.current[coluna] ?? []
    if (coluna === comeco.de && final.indexOf(id) === comeco.indice && raia === comeco.raia) return

    void soltar({
      id,
      de: comeco.de,
      indice: comeco.indice,
      para: coluna,
      indicePara: final.indexOf(id),
      acima: cardAbove(final, id),
      raiaDe: comeco.raia,
      raiaPara: raia,
    })
  }

  function aoDesistir({ active }: DragCancelEvent) {
    largarMao()
    const comeco = inicio.current
    inicio.current = null
    if (comeco) devolver(String(active.id), comeco.de, comeco.indice)
  }

  /** Grava o lugar novo. Devolve se deu certo. */
  async function soltar(soltura: Soltura, confirmado: Confirmado = {}): Promise<boolean> {
    const liberar = board.hold()
    try {
      return await gravar(soltura, confirmado, liberar)
    } finally {
      if (soltarDesfecho.current !== liberar) liberar()
    }
  }

  async function gravar(
    soltura: Soltura,
    { fim, reabrir }: Confirmado,
    liberar: () => void,
  ): Promise<boolean> {
    const card = board.cards[soltura.id]
    const mudouDeColuna = soltura.para !== soltura.de
    const mudouDeLugar = mudouDeColuna || soltura.indicePara !== soltura.indice
    const mudouDeRaia = soltura.raiaPara !== soltura.raiaDe
    const relato = card?.Kind === 'Report'

    // **Pergunta antes de mover**, como o seletor: o relato aberto que cai na coluna
    // que encerra precisa do desfecho e do motivo, que e o que quem relatou vai ler.
    // E o encerrado que sai dela reabre — o lado de fora deixa de ver o encerramento —,
    // entao tambem pergunta. O que quem relatou ja confirmou nao reabre, como no card
    // aberto: so anda, sem pergunta. O card fica no lugar novo enquanto a pergunta esta
    // aberta: a releitura espera ate ela ser respondida.
    const encerra =
      mudouDeColuna && !fim && porChave[soltura.para]?.closes && relato && !card.Closed
    const reabre =
      mudouDeColuna &&
      !reabrir &&
      relato &&
      card.Closed &&
      !card.ClosureConfirmed &&
      porChave[soltura.de]?.closes &&
      !porChave[soltura.para]?.closes
    if (encerra || reabre) {
      soltarDesfecho.current?.()
      soltarDesfecho.current = liberar
      if (encerra) setEncerrando(soltura)
      else {
        // A marca do sim nasce com a pergunta, e nao morre ao fechar: o Esc com a
        // gravacao no ar fecha a pergunta antes de ela terminar (ver o `ConfirmDialog`).
        reabrirConfirmado.current = false
        setReabrindo(soltura)
      }
      return false
    }

    // A segunda tentativa, depois de uma falha que devolveu o card: ele volta ao lugar
    // — e a raia — em que foi solto.
    if (columnOf(board.itemsRef.current, soltura.id) !== soltura.para)
      board.setItems(
        moveBetween(board.itemsRef.current, soltura.id, soltura.para, soltura.indicePara),
      )
    if (mudouDeRaia) forcar(soltura.id, soltura.raiaPara)

    if (mudouDeColuna) {
      board.adjustTotal(soltura.de, -1)
      board.adjustTotal(soltura.para, 1)
    }

    const numero = card ? `#${card.Number}` : 'o card'
    const nomeDe = porChave[soltura.de]?.name ?? 'a coluna de antes'
    const nomePara = porChave[soltura.para]?.name ?? 'a outra coluna'

    if (mudouDeLugar) {
      try {
        const resposta: ReportSummaryViewModel = mudouDeColuna
          ? await projectReportService.moveReport(projectPublicId, soltura.id, {
              StatePublicId: soltura.para,
              AfterPublicId: soltura.acima,
              ...fim,
            })
          : await projectReportService.setPosition(projectPublicId, soltura.id, {
              AfterPublicId: soltura.acima,
            })

        board.update(resposta)
        // Uma coluna relida no meio do caminho pode ter tirado o card do lugar: a API ja
        // o pos ali, e a coluna e lida de novo.
        if (columnOf(board.itemsRef.current, soltura.id) !== soltura.para)
          void board.reloadColumn(soltura.para)
        if (mudouDeColuna) aoMudarColunas()
        // Encerrar muda o que uma pessoa de fora le: o aviso diz que valeu, e quando
        // ela le — com a espera do Ciclo, so depois.
        if (fim) toast.done(avisoDeEncerrado(resposta))
      } catch (falha) {
        toast.error(textoDaFalha(falha, numero, nomeDe, nomePara, mudouDeColuna))
        devolver(soltura.id, soltura.de, soltura.indice)
        if (mudouDeColuna) {
          board.adjustTotal(soltura.de, 1)
          board.adjustTotal(soltura.para, -1)
        }
        void board.reloadColumn(soltura.de)
        if (mudouDeColuna) {
          void board.reloadColumn(soltura.para)
          aoMudarColunas()
        }
        return false
      }
    }

    // A raia nova e o campo do card: o responsavel, ou a prioridade. Falhando, o card
    // fica onde a API o pos e volta para a raia do dado dele.
    if (mudouDeRaia && porRaia) {
      const valor = soltura.raiaPara === NO_LANE ? null : soltura.raiaPara
      try {
        const mudado =
          porRaia === 'assignee'
            ? await projectReportService.setAssignee(projectPublicId, soltura.id, {
                UserPublicId: valor,
              })
            : await projectReportService.setPriority(projectPublicId, soltura.id, {
                PriorityPublicId: valor,
              })
        board.update(mudado)
      } catch (falha) {
        // **O movimento ja esta gravado** (e, na coluna que encerra, o encerramento):
        // o card fica onde a API o pos, e so a raia volta. Devolver "falso" deixaria o
        // dialogo do desfecho aberto, e o "Cancelar" dele desfaria na tela o que o
        // servidor ja fez.
        const campo = porRaia === 'assignee' ? 'o responsável' : 'a prioridade'
        toast.error(
          isPanelError(falha) && falha.status === 0
            ? `Sem conexão: o ${numero} ficou em ${nomePara}, mas ${campo} continua o de antes. Quando a internet voltar, arraste de novo.`
            : `O ${numero} ficou em ${nomePara}, mas ${campo} não mudou: ${describeError(falha)}`,
        )
      } finally {
        forcar(soltura.id, null)
      }
    }
    return true
  }

  // Fechar o dialogo do card le de novo a coluna dele: comentario e anexo mudam os
  // numeros da frente, e essas respostas nao trazem o card.
  const location = useLocation()
  const aberto = useRef<string | null>(null)
  useEffect(() => {
    const ultimo = location.pathname.split('/').filter(Boolean).at(-1) ?? ''
    if (columnOf(board.itemsRef.current, ultimo) !== undefined) {
      aberto.current = ultimo
      return
    }
    if (aberto.current) {
      const chave = columnOf(board.itemsRef.current, aberto.current)
      aberto.current = null
      if (chave) void board.reloadColumn(chave)
    }
  }, [location.pathname, board.itemsRef, board.reloadColumn])

  const rotulo = (id: UniqueIdentifier) => {
    const card = board.cards[String(id)]
    return card ? `o card #${card.Number}` : 'o card'
  }

  /**
   * Onde o card fica. Sobre outro card da mesma coluna, o lugar e o dele: dentro da
   * coluna, a biblioteca reordena so na tela, e e soltar que grava essa ordem.
   */
  const lugar = (id: UniqueIdentifier, sobre?: UniqueIdentifier) => {
    const celulas = celulasRef.current
    const chave = chaveDe(celulas, String(id))
    if (!chave) return 'fora das colunas'
    const ids = celulas[chave] ?? []
    const indice =
      sobre !== undefined && ids.includes(String(sobre))
        ? ids.indexOf(String(sobre))
        : ids.indexOf(String(id))
    const { coluna, raia } = splitCell(chave)
    const nome = `${porChave[coluna]?.name ?? ''}${raia === null ? '' : `, raia ${nomeDaRaia(raia)}`}`
    return indice >= 0 ? `${nome}, posição ${indice + 1} de ${ids.length}` : nome
  }

  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Pegou ${rotulo(active.id)}, em ${lugar(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${rotulo(active.id)} em ${lugar(active.id, over.id)}.`
        : maoRef.current === 'teclado'
          ? `${rotulo(active.id)} em ${lugar(active.id)}.`
          : `${rotulo(active.id)} fora das colunas: soltar aqui devolve o card.`,
    // No teclado, o alvo vazio na hora de soltar e de um instante: o card fica onde
    // as setas o puseram (ver `aoSoltar`).
    onDragEnd: ({ active, over }) =>
      over || maoRef.current === 'teclado'
        ? `Soltou ${rotulo(active.id)} em ${lugar(active.id)}.`
        : `${rotulo(active.id)} voltou para o lugar.`,
    onDragCancel: ({ active }) => `Movimento desfeito: ${rotulo(active.id)} voltou para o lugar.`,
  }

  const cardAtivo = ativo ? board.cards[ativo] : undefined

  const mostrarMais = (chave: string) => {
    board.loadMore(chave).catch((falha) => toast.error(describeError(falha)))
  }

  // As celulas desta renderizacao — com a raia de quem esta na mao.
  const celulasDaTela = raias === null ? board.items : celulasRef.current
  /** As raias recolhidas, so nesta tela: voltar ao quadro abre todas. */
  const [recolhidas, setRecolhidas] = useState<ReadonlySet<string>>(new Set())
  const alternarRaia = (raia: string) =>
    setRecolhidas((atual) => {
      const novo = new Set(atual)
      if (novo.has(raia)) novo.delete(raia)
      else novo.add(raia)
      return novo
    })

  // O card com o foco que sai da coluna por outra pessoa nao leva o foco para o comeco
  // da pagina.
  const area = useRef<HTMLDivElement>(null)
  useKeepFocus(area)

  /** O link de um card na tela, ou nada quando ele nao esta desenhado. */
  const noDoCard = (id: string) =>
    area.current?.querySelector<HTMLElement>(`[data-card="${id}"]`) ?? null

  // ─── O teclado fora do arraste ────────────────────────────────────────────
  // O quadro e uma parada so do Tab: o card que tem a vez e o ultimo que teve o foco
  // (ou o primeiro da tela). Antes, cada card era uma parada, e chegar a segunda coluna
  // pedia passar por todos os da primeira.
  const [vez, setVez] = useState<string | null>(null)
  const raiasAbertas = raias?.filter((raia) => !recolhidas.has(raia.key)).map((raia) => raia.key)
  const naOrdem =
    raiasAbertas === undefined
      ? columns.flatMap((coluna) => celulasDaTela[coluna.key] ?? [])
      : raiasAbertas.flatMap((raia) =>
          columns.flatMap((coluna) => celulasDaTela[cellKey(coluna.key, raia)] ?? []),
        )
  const parada = vez !== null && naOrdem.includes(vez) ? vez : (naOrdem[0] ?? null)

  /** O card para onde a tecla leva, a partir deste. */
  function vizinho(id: string, tecla: string): string | undefined {
    const celulas = celulasDaTela
    const celula = columnOf(celulas, id)
    if (!celula) return undefined
    const ids = celulas[celula] ?? []
    const i = ids.indexOf(id)
    const { coluna, raia } = splitCell(celula)

    /** Na ponta da celula, a raia aberta de cima ou de baixo, na mesma coluna. */
    const outraRaia = (sentido: 1 | -1) => {
      if (!raiasAbertas || raia === null) return undefined
      for (
        let k = raiasAbertas.indexOf(raia) + sentido;
        k >= 0 && k < raiasAbertas.length;
        k += sentido
      ) {
        const lista = celulas[cellKey(coluna, raiasAbertas[k] ?? '')] ?? []
        if (lista.length > 0) return sentido === 1 ? lista[0] : lista.at(-1)
      }
      return undefined
    }

    /** A proxima coluna com card, na mesma raia: o card dela mais perto desta altura. */
    const aoLado = (sentido: 1 | -1) => {
      const caixa = noDoCard(id)?.getBoundingClientRect()
      const altura = caixa ? caixa.top + caixa.height / 2 : 0
      const ordem = columns.map((item) => item.key)
      for (let j = ordem.indexOf(coluna) + sentido; j >= 0 && j < ordem.length; j += sentido) {
        const lista = (celulas[cellKey(ordem[j] ?? '', raia)] ?? []).filter((card) =>
          noDoCard(card),
        )
        if (lista.length === 0) continue
        const distancia = (card: string) => {
          const rect = noDoCard(card)?.getBoundingClientRect()
          return rect ? Math.abs(rect.top + rect.height / 2 - altura) : Number.POSITIVE_INFINITY
        }
        return lista.reduce((melhor, card) => (distancia(card) < distancia(melhor) ? card : melhor))
      }
      return undefined
    }

    switch (tecla) {
      case 'Home':
        return ids[0]
      case 'End':
        return ids.at(-1)
      case 'ArrowUp':
        return ids[i - 1] ?? outraRaia(-1)
      case 'ArrowDown':
        return ids[i + 1] ?? outraRaia(1)
      case 'ArrowLeft':
        return aoLado(-1)
      case 'ArrowRight':
        return aoLado(1)
      default:
        return undefined
    }
  }

  const andar = (evento: KeyboardEvent) => {
    // Com o card na mao, as setas sao do arraste.
    if (ativoRef.current !== null || !TECLAS_DE_ANDAR.includes(evento.key)) return
    if (evento.altKey || evento.ctrlKey || evento.metaKey || evento.shiftKey) return
    const link = (evento.target as Element).closest<HTMLElement>('[data-card]')
    if (!link) return
    evento.preventDefault()
    const alvo = vizinho(link.dataset.card ?? '', evento.key)
    const no = alvo ? noDoCard(alvo) : null
    if (!no) return
    no.focus({ preventScroll: true })
    no.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }

  const aoFocar = (evento: FocusEvent) => {
    const id = (evento.target as Element).closest<HTMLElement>('[data-card]')?.dataset.card
    if (id) setVez(id)
  }

  // As teclas e o foco chegam pela area inteira: o card com o foco e quem as recebe.
  const andarAgora = useRef(andar)
  andarAgora.current = andar
  const focarAgora = useRef(aoFocar)
  focarAgora.current = aoFocar
  // biome-ignore lint/correctness/useExhaustiveDependencies: com raias, o elemento que rola e outro.
  useEffect(() => {
    const el = area.current
    if (!el) return
    const tecla = (evento: KeyboardEvent) => andarAgora.current(evento)
    const foco = (evento: FocusEvent) => focarAgora.current(evento)
    el.addEventListener('keydown', tecla)
    el.addEventListener('focusin', foco)
    return () => {
      el.removeEventListener('keydown', tecla)
      el.removeEventListener('focusin', foco)
    }
  }, [comRaias])

  // ─── A borda: a coluna escondida diz o nome ──────────────────────────────
  const [bordas, setBordas] = useState<{ proxima: string | null; atual: string | null }>({
    proxima: null,
    atual: null,
  })
  const medirBordas = useCallback(() => {
    const el = area.current
    if (!el) return
    const caixa = el.getBoundingClientRect()
    const nos = [...el.querySelectorAll<HTMLElement>('[data-column]')]
    const proxima =
      nos.find((no) => no.getBoundingClientRect().right > caixa.right + 4)?.dataset.column ?? null
    const atual =
      nos.find((no) => no.getBoundingClientRect().left >= caixa.left - 4)?.dataset.column ?? null
    setBordas((antes) =>
      antes.proxima === proxima && antes.atual === atual ? antes : { proxima, atual },
    )
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: as raias trocam o elemento que rola, e as colunas, a largura dele.
  useEffect(() => {
    const el = area.current
    if (!el) return
    medirBordas()
    el.addEventListener('scroll', medirBordas, { passive: true })
    window.addEventListener('resize', medirBordas)
    const observador =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => medirBordas())
    observador?.observe(el)
    return () => {
      el.removeEventListener('scroll', medirBordas)
      window.removeEventListener('resize', medirBordas)
      observador?.disconnect()
    }
  }, [medirBordas, comRaias, columns.length])

  /**
   * Rola o quadro ate a coluna: no comeco da tela, ou — a escondida da borda — no fim.
   * So o quadro rola: levar a coluna "a vista" pela pagina arrastava o conteudo inteiro.
   */
  const irParaColuna = (chave: string, ponta: 'start' | 'end') => {
    const el = area.current
    const alvo = el?.querySelector<HTMLElement>(`[data-column="${chave}"]`)
    if (!el || !alvo) return
    const caixa = el.getBoundingClientRect()
    const coluna = alvo.getBoundingClientRect()
    const estilo = getComputedStyle(el)
    const left =
      ponta === 'start'
        ? coluna.left - caixa.left - Number.parseFloat(estilo.paddingLeft)
        : coluna.right - caixa.right + Number.parseFloat(estilo.paddingRight)
    el.scrollBy({ left, behavior: 'smooth' })
  }

  // ─── O card que acabou de nascer ──────────────────────────────────────────
  const revelado = useRef<string | null>(null)
  useEffect(() => {
    if (!revelar || revelado.current === revelar) return
    const no = noDoCard(revelar)
    if (!no) return
    revelado.current = revelar
    no.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  })

  /** Cria o card do time ja nesta coluna, pelo campo do alto dela. */
  const criarNaColuna = async (chave: string, titulo: string) => {
    const card = await projectReportService.createTeamCard(projectPublicId, {
      Title: titulo,
      Description: null,
      StatePublicId: chave,
      ...(sprintPublicId ? { SprintPublicId: sprintPublicId } : {}),
    })
    aoCriadoNaColuna(card, porChave[chave]?.name ?? '')
    // Nasce no topo, logo abaixo do campo: a lista rolada volta ate ele.
    requestAnimationFrame(() =>
      noDoCard(card.PublicId)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }),
    )
  }

  const vazioPeloFiltro =
    filtro !== null &&
    columns.length > 0 &&
    columns.every((coluna) => {
      const estado = board.state[coluna.key]
      return (
        estado && !estado.loading && !estado.failed && (board.items[coluna.key]?.length ?? 0) === 0
      )
    })

  /** Com filtro, o total sem ele — menos na coluna da regra dos dias, que ja diz que e parcial. */
  const semFiltroDa = (coluna: BoardColumn) =>
    filtro?.semFiltro && !(coluna.last && lastColumnDays > 0)
      ? filtro.semFiltro[coluna.key]
      : undefined

  const nomeProxima = bordas.proxima ? porChave[bordas.proxima]?.name : undefined

  return (
    <div className="flex min-h-80 flex-1 flex-col">
      {vazioPeloFiltro && filtro && (
        <div className="mb-3 max-w-170 flex-none rounded-xl border border-border border-dashed bg-surface-raised p-5">
          <p className="mb-3 text-detail text-fg-muted leading-relaxed">
            Nenhum card passa nos filtros. Os outros continuam onde estão.
          </p>
          <Button onClick={filtro.aoLimpar}>Limpar filtros</Button>
        </div>
      )}

      {/* No celular cabe uma coluna por vez: as colunas em fila, com quantos cards cada
          uma tem, levam direto a ela. */}
      <nav
        aria-label="Colunas do quadro"
        className="-mx-4 mb-2 flex flex-none gap-1.5 overflow-x-auto px-4 pb-1 sm:hidden"
      >
        {columns.map((coluna) => (
          <button
            key={coluna.key}
            type="button"
            aria-current={bordas.atual === coluna.key || undefined}
            onClick={() => irParaColuna(coluna.key, 'start')}
            className={cn(
              'flex h-7 flex-none items-center gap-1 rounded-full border px-2.5 text-caption transition-colors',
              bordas.atual === coluna.key
                ? 'border-accent bg-surface-strong text-fg'
                : 'border-border bg-surface text-fg-muted',
            )}
          >
            {coluna.name}
            <span className="tabular-nums">{totalDa(coluna, board.state[coluna.key])}</span>
          </button>
        ))}
      </nav>

      <DndContext
        sensors={sensors}
        collisionDetection={colisao}
        onDragStart={aoPegar}
        onDragMove={aoMover}
        onDragOver={aoPassar}
        onDragEnd={aoSoltar}
        onDragCancel={aoDesistir}
        // No toque sem raias, quem rola o quadro para os lados e a borda passo a passo.
        autoScroll={{
          canScroll: (el) => !(maoRef.current === 'toque' && raias === null && el === area.current),
        }}
        accessibility={{
          announcements: anuncios,
          screenReaderInstructions: {
            draggable:
              'As setas andam entre os cards e Enter abre o card. Para mudar o card de lugar, aperte espaço: as setas escolhem o lugar — para os lados, a coluna —, espaço ou Enter solta e Esc desiste.',
          },
        }}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          {raias === null ? (
            <div
              ref={area}
              // Relativa: o texto escondido para leitor de tela da coluna fora da vista fica
              // dentro dela, e nao alarga a pagina.
              className="relative -mx-4 flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden px-4 pb-3 sm:mx-0 sm:snap-none sm:px-0"
            >
              {columns.map((coluna) => (
                <Coluna
                  key={coluna.key}
                  coluna={coluna}
                  ids={board.items[coluna.key] ?? []}
                  cards={board.cards}
                  estado={board.state[coluna.key]}
                  semFiltro={semFiltroDa(coluna)}
                  soonDays={soonDays}
                  lastColumnDays={lastColumnDays}
                  aoMostrarMais={() => mostrarMais(coluna.key)}
                  aoTentarDeNovo={() => void board.loadColumn(coluna.key)}
                  aoVerNaLista={() => aoVerNaLista(coluna.key)}
                  criar={{
                    aoCriar: (titulo) => criarNaColuna(coluna.key, titulo),
                    aoMaisDetalhes: (titulo) => aoCriar(coluna.key, titulo),
                  }}
                  destacados={destacados}
                  mao={mao}
                  parada={parada}
                />
              ))}
            </div>
          ) : (
            <div
              ref={area}
              data-board-scroll
              className="relative -mx-4 min-h-0 flex-1 overflow-auto px-4 pb-3 sm:mx-0 sm:px-0"
            >
              <div className="flex w-max min-w-full flex-col gap-3">
                {/* O cabecalho das colunas, uma vez, em cima de todas as raias — preso no
                    alto: rolada a raia da Carla, ninguem sabia qual faixa era "Fazendo". */}
                <div className="sticky top-0 z-sticky flex gap-3 bg-surface pb-1">
                  {columns.map((coluna) => (
                    <div
                      key={coluna.key}
                      data-column={coluna.key}
                      className={cn(
                        LARGURA,
                        'rounded-lg bg-surface-sunken dark:border dark:border-border',
                      )}
                    >
                      <CabecalhoDaColuna
                        coluna={coluna}
                        total={totalDa(coluna, board.state[coluna.key])}
                        semFiltro={semFiltroDa(coluna)}
                        escondidos={escondidosDa(coluna, board.state[coluna.key], lastColumnDays)}
                        lastColumnDays={lastColumnDays}
                        aoVerNaLista={() => aoVerNaLista(coluna.key)}
                      />
                      {coluna.accepts && (
                        <CriarNaColuna
                          coluna={coluna}
                          aoCriar={(titulo) => criarNaColuna(coluna.key, titulo)}
                          aoMaisDetalhes={(titulo) => aoCriar(coluna.key, titulo)}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {raias.map((raia, posicao) => {
                  const celulas = columns.map((coluna) => ({
                    coluna,
                    chave: cellKey(coluna.key, raia.key),
                  }))
                  const quantos = celulas.reduce(
                    (soma, { chave }) => soma + (celulasDaTela[chave]?.length ?? 0),
                    0,
                  )
                  const recolhida = recolhidas.has(raia.key)
                  const compacta = raia.empty === true && quantos === 0
                  const altura = congeladas?.[raia.key]
                  return (
                    <section
                      key={raia.key}
                      aria-label={`${raia.name}: ${quantos} ${quantos === 1 ? 'card' : 'cards'}`}
                    >
                      <h3 className="sticky left-0 w-max max-w-[calc(100vw-2rem)]">
                        <button
                          type="button"
                          aria-expanded={!recolhida}
                          onClick={() => alternarRaia(raia.key)}
                          className="flex h-8 items-center gap-1.5 rounded-md px-1.5 font-semibold text-detail text-fg hover:bg-surface-sunken"
                        >
                          <svg
                            viewBox="0 0 12 12"
                            className={cn(
                              'size-3 text-fg-muted transition-transform',
                              !recolhida && 'rotate-90',
                            )}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M4.5 2.5 8 6l-3.5 3.5" />
                          </svg>
                          {raia.name}
                          <span className="font-normal text-caption text-fg-muted tabular-nums">
                            {compacta
                              ? '· 0 — solte um card aqui para passar a esta pessoa'
                              : quantos}
                          </span>
                        </button>
                      </h3>
                      {!recolhida && (
                        <div
                          data-lane-row={raia.key}
                          className={cn(
                            'mt-1 flex gap-3',
                            altura !== undefined && 'overflow-hidden',
                          )}
                          style={altura !== undefined ? { height: altura } : undefined}
                        >
                          {celulas.map(({ coluna, chave }) => {
                            const estado = board.state[coluna.key]
                            return (
                              <Celula
                                key={chave}
                                celula={chave}
                                rotulo={`${coluna.name}, ${raia.name}`}
                                coluna={coluna}
                                recebe={coluna.accepts && raia.accepts}
                                ids={celulasDaTela[chave] ?? []}
                                cards={board.cards}
                                // A coluna lendo: a espera aparece na primeira raia so.
                                carregando={(!estado || estado.loading) && posicao === 0}
                                soonDays={soonDays}
                                destacados={destacados}
                                compacta={compacta}
                                mao={mao}
                                parada={parada}
                              />
                            )
                          })}
                        </div>
                      )}
                    </section>
                  )
                })}

                {/* O pe de cada coluna, embaixo de todas as raias: o que falta ler e o que
                    a regra dos dias deixou na lista. */}
                <div className="flex gap-3">
                  {columns.map((coluna) => (
                    <div key={coluna.key} className={LARGURA}>
                      <PeDaColuna
                        coluna={coluna}
                        estado={board.state[coluna.key]}
                        lidos={board.items[coluna.key]?.length ?? 0}
                        lastColumnDays={lastColumnDays}
                        aoMostrarMais={() => mostrarMais(coluna.key)}
                        aoTentarDeNovo={() => void board.loadColumn(coluna.key)}
                        aoVerNaLista={() => aoVerNaLista(coluna.key)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* A coluna fora da tela, a direita: a borda esmaece e o nome dela leva ate la.
              O "Feito" — o destino mais comum do dia — ficava escondido sem pista. O
              atalho tem a camada do cabecalho preso e vem depois dele no documento:
              fica por cima da fileira de cabecalhos, e abaixo da gaveta. */}
          {bordas.proxima && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 hidden w-10 fade-right sm:block"
              />
              <button
                type="button"
                onClick={() => bordas.proxima && irParaColuna(bordas.proxima, 'end')}
                aria-label={`Ir para a coluna ${nomeProxima ?? ''}`}
                className="absolute top-2 right-1 z-sticky hidden h-7 max-w-40 items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-detail text-fg shadow-sm transition-colors hover:bg-surface-sunken sm:flex"
              >
                <span className="truncate">{nomeProxima}</span>
                <span aria-hidden>›</span>
              </button>
            </>
          )}
        </div>

        <DragOverlay>
          {cardAtivo ? (
            // No teclado, o lugar reservado e o proprio card, e a copia erguida some: com
            // o quadro rolando para os lados, ela ficava longe do lugar.
            <div className={cn(mao === 'teclado' && 'opacity-0')}>
              <BoardCardFace card={cardAtivo} soonDays={soonDays} lifted />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {encerrando && (
        <CloseReportDialog
          coluna={porChave[encerrando.para]?.name ?? null}
          maisLeitores={board.cards[encerrando.id]?.DuplicateReporters ?? 0}
          encerrando={salvandoEncerramento}
          aoConfirmar={(outcome, reason) => {
            setSalvandoEncerramento(true)
            // Falhando, o dialogo fica, com o motivo escrito: da para tentar de novo
            // ou desistir — como no dialogo do card.
            void soltar(encerrando, { fim: { Outcome: outcome, Reason: reason } }).then((deu) => {
              setSalvandoEncerramento(false)
              if (deu) setEncerrando(null)
            })
          }}
          aoCancelar={() => {
            // Desistir de encerrar e desistir do movimento: o card volta ao lugar.
            devolver(encerrando.id, encerrando.de, encerrando.indice)
            setEncerrando(null)
          }}
        />
      )}

      {reabrindo && (
        <ConfirmDialog
          open
          // Esc e o "Cancelar": o card volta para a coluna que encerra. Depois do sim, a
          // gravacao ja decidiu onde ele fica — e, falhando, ja o devolveu —, mesmo que o
          // Esc feche a pergunta com ela no ar.
          onOpenChange={(aberto) => {
            if (aberto) return
            if (!reabrirConfirmado.current) devolver(reabrindo.id, reabrindo.de, reabrindo.indice)
            setReabrindo(null)
          }}
          tone="warn"
          title={`Reabrir o relato #${board.cards[reabrindo.id]?.Number ?? ''}?`}
          description={`Tirar o #${board.cards[reabrindo.id]?.Number ?? ''} de ${porChave[reabrindo.de]?.name ?? 'a coluna que encerra'} reabre o relato: quem relatou volta a ver o relato em andamento, e o motivo do encerramento sai da página de acompanhamento.`}
          cancelLabel="Cancelar"
          confirmLabel="Reabrir e mover"
          onConfirm={async () => {
            // Falhando, o card volta e o aviso diz por que: a pergunta fecha do mesmo jeito.
            reabrirConfirmado.current = true
            await soltar(reabrindo, { reabrir: true })
          }}
        />
      )}
    </div>
  )
}

/** A largura de uma coluna — e de cada celula dela, com raias. */
const LARGURA = 'w-[85vw] max-w-80 flex-none sm:w-68'

/** O total que o cabecalho mostra: o da leitura, quando ja chegou; senao, o da contagem. */
function totalDa(coluna: BoardColumn, estado: BoardColumnState | undefined) {
  return estado && !estado.loading ? estado.total : coluna.total
}

/**
 * Quantos a regra dos dias deixa so na lista: a contagem conta todos; a coluna, so os
 * que ficam.
 */
function escondidosDa(
  coluna: BoardColumn,
  estado: BoardColumnState | undefined,
  lastColumnDays: number,
) {
  return coluna.last && lastColumnDays > 0 && estado && !estado.loading
    ? Math.max(0, coluna.total - estado.total)
    : 0
}

/** O aviso de que o relato encerrou pelo quadro — e de quando quem relatou le o motivo. */
function avisoDeEncerrado(card: ReportSummaryViewModel) {
  const vence = card.PublicStageDueAt
  return vence && new Date(vence).getTime() > Date.now()
    ? `#${card.Number} encerrado. O motivo aparece para quem relatou ${formatRelative(vence)}.`
    : `#${card.Number} encerrado. Quem relatou já pode ler o motivo.`
}

/**
 * O que dizer quando o movimento falha: qual card, e que ele voltou. "Erro 500" e
 * "Falha de rede ao contatar a API" nao diziam nada a quem trabalha no quadro, e a
 * pessoa ia conferir na lista se o movimento tinha valido.
 */
function textoDaFalha(
  falha: unknown,
  numero: string,
  de: string,
  para: string,
  mudouDeColuna: boolean,
) {
  const status = isPanelError(falha) ? falha.status : -1
  // O conflito e de outra pessoa ter mexido no card, ou no vizinho de referencia,
  // enquanto este estava na mao: o quadro e relido aqui mesmo, e o texto diz isso.
  if (status === 409)
    return 'Outra pessoa mexeu neste card, ou nesta coluna, enquanto você o movia. O quadro foi relido: solte de novo, se ainda quiser.'
  const voltou = mudouDeColuna ? `voltou para ${de}` : 'voltou para onde estava'
  if (status === 0)
    return `Sem conexão: o ${numero} ${voltou}. Quando a internet voltar, arraste de novo.`
  const tentativa = mudouDeColuna
    ? `Não deu para mover o ${numero} para ${para}.`
    : `Não deu para mudar o ${numero} de lugar.`
  // A recusa com motivo (4xx) diz o motivo; a falha do servidor, so que vale tentar de novo.
  if (status >= 400 && status < 500) return `${tentativa} ${describeError(falha)} Ele ${voltou}.`
  return `${tentativa} Ele ${voltou} — tente de novo.`
}

function Coluna({
  coluna,
  ids,
  cards,
  estado,
  semFiltro,
  soonDays,
  lastColumnDays,
  aoMostrarMais,
  aoTentarDeNovo,
  aoVerNaLista,
  criar,
  destacados,
  mao,
  parada,
}: {
  coluna: BoardColumn
  ids: string[]
  cards: Record<string, ReportSummaryViewModel>
  estado: BoardColumnState | undefined
  semFiltro: number | undefined
  soonDays: number
  lastColumnDays: number
  aoMostrarMais: () => void
  aoTentarDeNovo: () => void
  aoVerNaLista: () => void
  criar: { aoCriar: (titulo: string) => Promise<void>; aoMaisDetalhes: (titulo: string) => void }
  destacados: ReadonlySet<string>
  mao: Mao
  parada: string | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.key, disabled: !coluna.accepts })
  const titulo = coluna.retired ? `${coluna.name} (desativada)` : coluna.name
  const carregando = !estado || estado.loading

  // A coluna inteira recebe — o cabecalho tambem: e para la que a mao mira.
  return (
    <section
      ref={setNodeRef}
      aria-label={titulo}
      data-column={coluna.key}
      // O foco do card que saiu desta coluna fica nela (ver `useKeepFocus`).
      data-focus-group
      className={cn(
        'flex snap-start flex-col rounded-lg border border-transparent bg-surface-sunken dark:border-border',
        LARGURA,
        isOver && coluna.accepts && 'border-accent dark:border-accent',
      )}
    >
      <CabecalhoDaColuna
        coluna={coluna}
        total={totalDa(coluna, estado)}
        semFiltro={semFiltro}
        escondidos={escondidosDa(coluna, estado, lastColumnDays)}
        lastColumnDays={lastColumnDays}
        aoVerNaLista={aoVerNaLista}
      />

      {/* Criar ja na coluna, logo abaixo do cabecalho: o card novo nasce no topo, bem
          embaixo do campo. So na que recebe: nas outras, o card nasceria onde ninguem
          pode coloca-lo. */}
      {coluna.accepts && (
        <CriarNaColuna
          coluna={coluna}
          aoCriar={criar.aoCriar}
          aoMaisDetalhes={criar.aoMaisDetalhes}
        />
      )}

      {/* A lista rola por dentro: o cabecalho e o "Criar" ficam a vista, e o pe vem logo
          depois do ultimo card. */}
      <div data-board-scroll className="min-h-0 flex-1 overflow-y-auto">
        <ListaDaCelula
          celula={coluna.key}
          ids={ids}
          cards={cards}
          carregando={carregando}
          recebe={coluna.accepts}
          soonDays={soonDays}
          destacados={destacados}
          mao={mao}
          parada={parada}
          vazia={
            !carregando && !estado?.failed && ids.length === 0 ? (
              <li className="rounded-lg border border-border border-dashed px-3 py-4 text-center text-caption text-fg-muted">
                Nenhum card
              </li>
            ) : null
          }
        />

        <PeDaColuna
          coluna={coluna}
          estado={estado}
          lidos={ids.length}
          lastColumnDays={lastColumnDays}
          aoMostrarMais={aoMostrarMais}
          aoTentarDeNovo={aoTentarDeNovo}
          aoVerNaLista={aoVerNaLista}
        />
      </div>
    </section>
  )
}

/** O nome da coluna, quantos cards ela tem e o que ela faz de diferente. */
function CabecalhoDaColuna({
  coluna,
  total,
  semFiltro,
  escondidos,
  lastColumnDays,
  aoVerNaLista,
}: {
  coluna: BoardColumn
  total: number
  /** Com filtro ligado, quantos a coluna tem sem ele. */
  semFiltro: number | undefined
  escondidos: number
  lastColumnDays: number
  aoVerNaLista: () => void
}) {
  const titulo = coluna.retired ? `${coluna.name} (desativada)` : coluna.name
  const filtrada = semFiltro !== undefined && semFiltro !== total
  return (
    <>
      {/* O nome em caixa alta e a contagem logo depois dele: o cabecalho rotula a
          coluna, e nao compete com os titulos dos cards. O nome que nao cabe vai inteiro
          no `title`. Com filtro, "2 de 10": quem esquece o filtro ligado nao acha que o
          trabalho sumiu. */}
      <header className="flex flex-none items-center gap-2 px-3 pt-3 pb-2">
        <h2
          title={titulo}
          className="min-w-0 truncate font-semibold text-caption text-fg-muted uppercase tracking-wide"
        >
          {titulo}
        </h2>
        <span className="flex-none text-caption text-fg-muted tabular-nums">
          {filtrada ? `${total} de ${semFiltro}` : total}
          <span className="sr-only">
            {(filtrada ? semFiltro : total) === 1 ? ' card' : ' cards'}
            {filtrada && ', com os filtros'}
          </span>
        </span>
        {/* O visto marca a coluna que encerra; o que ela faz esta escrito logo abaixo. */}
        {coluna.closes && (
          <svg
            viewBox="0 0 12 12"
            className="ml-auto size-3.5 flex-none text-chip-green-glyph"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M2.5 6.3 4.8 8.6 9.5 3.9" />
          </svg>
        )}
      </header>

      {/* A regra dos dias, a vista: o numero do cabecalho conta so os recentes, e quem
          procura o card que fechou ha tres semanas achava que ele tinha sumido. */}
      {coluna.last && lastColumnDays > 0 && (
        <p className="flex-none px-3 pb-1.5 text-caption text-fg-muted leading-snug">
          {lastColumnDays === 1 ? 'Último dia' : `Últimos ${lastColumnDays} dias`}
          {escondidos > 0 && (
            <>
              {' · '}
              <button
                type="button"
                onClick={aoVerNaLista}
                className="font-medium text-fg underline-offset-2 hover:underline"
              >
                {escondidos} na lista
              </button>
            </>
          )}
        </p>
      )}

      {/* Escrito, e nao numa dica: a dica nao abre no toque, e quem arrasta pelo
          celular precisa saber antes de soltar — o que entra e o que sai. */}
      {coluna.closes && (
        <p className="flex-none px-3 pb-1.5 text-caption text-fg-muted leading-snug">
          Soltar um relato aberto aqui encerra; tirar daqui reabre.
        </p>
      )}
      {!coluna.accepts && (
        <p className="flex-none px-3 pb-1.5 text-caption text-fg-muted leading-snug">
          {coluna.retired
            ? 'Desativada: não recebe card. Os que estão aqui saem arrastando.'
            : 'Ainda fora da fila: daqui o card sai arrastando, e não volta.'}
        </p>
      )}
    </>
  )
}

/**
 * Criar um card do time ja na coluna, sem sair do quadro: um campo de uma linha, em
 * que Enter cria e o campo continua aberto para o proximo — numa reuniao, sao varios
 * cards curtos seguidos. O card nasce logo abaixo do campo. "Mais detalhes" abre o
 * dialogo completo nesta coluna, com o titulo ja digitado; Esc fecha.
 */
function CriarNaColuna({
  coluna,
  aoCriar,
  aoMaisDetalhes,
}: {
  coluna: BoardColumn
  aoCriar: (titulo: string) => Promise<void>
  aoMaisDetalhes: (titulo: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const botao = useRef<HTMLButtonElement>(null)

  const fechar = () => {
    setAberto(false)
    setTitulo('')
    setErro(null)
    // O foco volta ao "Criar", e nao ao comeco da pagina.
    requestAnimationFrame(() => botao.current?.focus())
  }

  async function criar() {
    const texto = titulo.trim()
    if (texto.length === 0 || criando) return
    setCriando(true)
    setErro(null)
    try {
      await aoCriar(texto)
      setTitulo('')
    } catch (falha) {
      // O titulo fica no campo: quem escreveu tenta de novo sem reescrever.
      setErro(describeError(falha))
    } finally {
      setCriando(false)
    }
  }

  if (!aberto)
    return (
      <div className="flex-none px-2 pb-1">
        <button
          ref={botao}
          type="button"
          onClick={() => setAberto(true)}
          // O nome inteiro, e nao so "Criar": cada coluna tem o seu botao.
          aria-label={`Criar card em ${coluna.name}`}
          className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-detail text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
        >
          <svg
            viewBox="0 0 12 12"
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M6 2.5v7M2.5 6h7" />
          </svg>
          Criar
        </button>
      </div>
    )

  return (
    <form
      className="flex-none px-2 pb-2"
      onSubmit={(evento) => {
        evento.preventDefault()
        void criar()
      }}
      // Sair do campo vazio fecha; com texto, ele fica — o que se escreveu nao se perde.
      // O foco que fica dentro (o Tab do campo ao "Mais detalhes") nao e sair: fechando
      // ali, o foco caia no comeco da pagina e o teclado nunca alcancava o botao.
      onBlur={(evento) => {
        if (evento.currentTarget.contains(evento.relatedTarget as Node | null)) return
        if (titulo.trim().length === 0 && !criando) {
          setAberto(false)
          setErro(null)
        }
      }}
    >
      <input
        // biome-ignore lint/a11y/noAutofocus: o campo abre pelo clique no "Criar", e e nele que se digita.
        autoFocus
        value={titulo}
        onChange={(evento) => {
          setTitulo(evento.target.value)
          if (erro) setErro(null)
        }}
        onKeyDown={(evento) => {
          if (evento.key !== 'Escape') return
          evento.preventDefault()
          evento.stopPropagation()
          fechar()
        }}
        maxLength={MAX_CARD_TITLE_LENGTH}
        aria-label={`Título do card novo em ${coluna.name}`}
        aria-invalid={erro !== null || undefined}
        placeholder="Título do card — Enter cria, Esc fecha"
        className="block h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-detail text-fg placeholder:text-fg-placeholder focus:border-accent focus:outline-none"
      />
      {erro && (
        <p role="alert" className="mt-1 px-0.5 text-caption text-error-fg leading-snug">
          {erro}
        </p>
      )}
      <div className="mt-1 flex items-center justify-between gap-2 px-0.5 text-caption text-fg-muted">
        <span aria-live="polite">{criando ? 'Criando…' : ''}</span>
        <button
          type="button"
          // Antes do blur do campo: sem isto, o campo vazio fechava e o clique se perdia.
          onMouseDown={(evento) => evento.preventDefault()}
          // O campo fica como esta, com o que se escreveu: desistir do dialogo nao
          // perde o titulo.
          onClick={() => aoMaisDetalhes(titulo.trim())}
          className="font-medium text-fg underline-offset-2 hover:underline"
        >
          Mais detalhes
        </button>
      </div>
    </form>
  )
}

/** Os cards de uma celula — sem raias, da coluna inteira —, na ordem do quadro. */
function ListaDaCelula({
  celula,
  ids,
  cards,
  carregando,
  recebe,
  soonDays,
  destacados,
  vazia,
  compacta = false,
  mao,
  parada,
}: {
  celula: string
  ids: string[]
  cards: Record<string, ReportSummaryViewModel>
  carregando: boolean
  recebe: boolean
  soonDays: number
  destacados: ReadonlySet<string>
  vazia: ReactNode
  /** A raia de quem esta sem card: baixa, so para receber. */
  compacta?: boolean
  mao: Mao
  parada: string | null
}) {
  return (
    <SortableContext id={celula} items={ids} strategy={verticalListSortingStrategy}>
      <ul
        className={cn(
          'flex flex-col gap-2 rounded-lg px-2 pt-1 pb-2',
          compacta ? 'min-h-10' : 'min-h-20',
        )}
      >
        {carregando ? (
          <>
            <li>
              <Skeleton className="h-20 w-full" />
            </li>
            <li>
              <Skeleton className="h-16 w-full" />
            </li>
          </>
        ) : (
          ids.map((id) => {
            const card = cards[id]
            return card ? (
              <CardArrastavel
                key={id}
                id={id}
                card={card}
                soonDays={soonDays}
                recebe={recebe}
                destacado={destacados.has(id)}
                mao={mao}
                vez={parada === id}
              />
            ) : null
          })
        )}
        {vazia}
      </ul>
    </SortableContext>
  )
}

/** Uma celula do quadro com raias: a coluna, dentro de uma raia. Recebe como a coluna. */
function Celula({
  celula,
  rotulo,
  coluna,
  recebe,
  ids,
  cards,
  carregando,
  soonDays,
  destacados,
  compacta,
  mao,
  parada,
}: {
  celula: string
  rotulo: string
  coluna: BoardColumn
  /** A coluna recebe, e a raia tambem. */
  recebe: boolean
  ids: string[]
  cards: Record<string, ReportSummaryViewModel>
  carregando: boolean
  soonDays: number
  destacados: ReadonlySet<string>
  compacta: boolean
  mao: Mao
  parada: string | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: celula, disabled: !recebe })
  return (
    <section
      ref={setNodeRef}
      aria-label={rotulo}
      data-focus-group
      className={cn(
        'flex flex-col rounded-lg border border-transparent bg-surface-sunken pt-1 dark:border-border',
        LARGURA,
        isOver && recebe && 'border-accent dark:border-accent',
      )}
    >
      {/* No celular, uma coluna por vez na tela: o nome dela em cada raia, para nao se
          perder ao rolar. Na tela larga, o cabecalho de cima basta. */}
      <p className="px-3 pt-1 text-caption text-fg-muted uppercase tracking-wide sm:hidden">
        {coluna.name}
      </p>
      <ListaDaCelula
        celula={celula}
        ids={ids}
        cards={cards}
        carregando={carregando}
        recebe={coluna.accepts}
        soonDays={soonDays}
        destacados={destacados}
        vazia={null}
        compacta={compacta}
        mao={mao}
        parada={parada}
      />
    </section>
  )
}

/** O pe da coluna, logo depois do ultimo card: a falha da leitura, o "Mostrar mais" e os que ficaram na lista. */
function PeDaColuna({
  coluna,
  estado,
  lidos,
  lastColumnDays,
  aoMostrarMais,
  aoTentarDeNovo,
  aoVerNaLista,
}: {
  coluna: BoardColumn
  estado: BoardColumnState | undefined
  /** Quantos cards da coluna ja estao na tela. */
  lidos: number
  lastColumnDays: number
  aoMostrarMais: () => void
  aoTentarDeNovo: () => void
  aoVerNaLista: () => void
}) {
  const escondidos = escondidosDa(coluna, estado, lastColumnDays)
  const diasDaRegra = lastColumnDays === 1 ? '1 dia' : `${lastColumnDays} dias`
  const faltam = estado ? estado.total - lidos : 0
  const proximos = Math.min(faltam, BOARD_PAGE_SIZE)

  return (
    <>
      {estado?.failed && (
        <div className="px-3 pb-3">
          <p className="mb-2 text-caption text-fg-muted">Não deu para carregar esta coluna.</p>
          <Button size="sm" onClick={aoTentarDeNovo}>
            Tentar de novo
          </Button>
        </div>
      )}

      {estado && !estado.loading && !estado.end && faltam > 0 && (
        <div className="px-2 pb-2">
          <Button
            size="sm"
            className="w-full"
            disabled={estado.loadingMore}
            onClick={aoMostrarMais}
          >
            {estado.loadingMore
              ? 'Carregando…'
              : proximos < faltam
                ? `Mostrar mais ${proximos} de ${faltam}`
                : `Mostrar mais ${faltam}`}
          </Button>
        </div>
      )}

      {escondidos > 0 && (
        <p className="px-3 pb-3 text-caption text-fg-muted leading-snug">
          {escondidos === 1
            ? `1 card entrou aqui há mais de ${diasDaRegra} e fica só na lista. `
            : `${escondidos} cards entraram aqui há mais de ${diasDaRegra} e ficam só na lista. `}
          <button
            type="button"
            onClick={aoVerNaLista}
            className="font-medium text-fg underline-offset-2 hover:underline"
          >
            Ver na lista
          </button>
        </p>
      )}
    </>
  )
}

/**
 * O quadro carregando: a moldura das colunas, com cards de espera — e nao uma lista,
 * que faria a tela trocar de forma quando o quadro chegasse.
 */
export function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden pb-4">
      {['w-11/12', 'w-3/4', 'w-5/6'].map((largura) => (
        <div
          key={largura}
          className="flex w-[85vw] max-w-80 flex-none flex-col gap-2 rounded-lg bg-surface-sunken p-2 sm:w-68"
        >
          <Skeleton className={`mx-1 mt-1 mb-1 h-3 ${largura === 'w-3/4' ? 'w-20' : 'w-16'}`} />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  )
}

/**
 * O card no quadro: **um link para o card**, como o titulo na linha da lista — Enter
 * e o clique abrem, o meio do mouse abre em outra aba —, e ao mesmo tempo o que se
 * arrasta. So o card que tem a vez entra na ordem do Tab; as setas levam aos outros.
 */
function CardArrastavel({
  id,
  card,
  soonDays,
  recebe,
  destacado,
  mao,
  vez,
}: {
  id: string
  card: ReportSummaryViewModel
  soonDays: number
  /** Outra pessoa acabou de muda-lo. */
  destacado: boolean
  /** A coluna recebe card. Na que nao recebe, o card sai arrastando, mas ninguem cai em cima dele. */
  recebe: boolean
  mao: Mao
  /** E a parada do Tab no quadro. */
  vez: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: recebe ? false : { draggable: false, droppable: true },
    attributes: { role: 'link', roleDescription: 'card arrastável' },
  })

  // O lugar reservado: uma caixa tracejada, igual nos dois temas — o card apagado quase
  // sumia no escuro. No teclado, o proprio card, marcado: a copia erguida some.
  const reservado = isDragging && mao !== 'teclado'
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        isDragging && 'rounded-lg outline-2 outline-accent/70 outline-dashed',
        reservado && 'bg-surface-strong -outline-offset-2',
        isDragging && mao === 'teclado' && 'outline-offset-2',
      )}
    >
      <Link
        to={id}
        {...attributes}
        {...listeners}
        tabIndex={vez ? 0 : -1}
        data-card={id}
        // Segurar o card no celular e pegar, e nao abrir a previa do link (iPhone) nem
        // selecionar o texto.
        className={cn(
          'block touch-manipulation select-none rounded-lg outline-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-accent',
          reservado && 'invisible',
        )}
      >
        <BoardCardFace card={card} soonDays={soonDays} highlighted={destacado} />
      </Link>
    </li>
  )
}
