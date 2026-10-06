import {
  type Announcements,
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
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
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { PublicOutcome, ReportSummaryViewModel } from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { isPanelError } from '@/data/errors'
import { BoardCardFace } from '@/features/reports/board/BoardCardFace'
import { boardCollision } from '@/features/reports/board/boardCollision'
import { boardKeyboardCoordinates } from '@/features/reports/board/boardKeyboard'
import {
  type BoardColumn,
  cardAbove,
  columnOf,
  moveBetween,
} from '@/features/reports/board/boardState'
import type { Board, BoardColumnState } from '@/features/reports/board/useBoard'
import { CloseReportDialog } from '@/features/reports/CloseReportDialog'
import { useKeepFocus } from '@/features/reports/useKeepFocus'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { cn } from '@/shared/lib/cn'

/** O mouse so pega depois de andar alguns pixels: o clique continua abrindo o card. */
const MOUSE = { activationConstraint: { distance: 6 } }

/** No toque, segurar um instante: deslizar o dedo continua rolando o quadro. */
const TOQUE = { activationConstraint: { delay: 250, tolerance: 8 } }

/** Quanto tempo depois de soltar o clique ainda e o do proprio soltar. */
const CLIQUE_DO_SOLTAR_MS = 300

/** Um card solto num lugar novo, esperando a API — ou o desfecho, na coluna que encerra. */
interface Soltura {
  id: string
  de: string
  /** O lugar de antes na coluna de origem: e para onde o card volta se algo der errado. */
  indice: number
  para: string
  /** O lugar na coluna de destino, para pô-lo de volta ali numa segunda tentativa. */
  indicePara: number
  /** O card logo acima, no lugar novo; nulo e o topo. */
  acima: string | null
}

/**
 * O quadro: uma coluna por estado, os cards na ordem que o time arrumou.
 *
 * **Arrastar e o mesmo movimento do seletor de coluna**, com o lugar junto: a API
 * grava o evento, a etapa publica anda pela espera, e soltar um relato aberto na
 * coluna que encerra pede o desfecho e o motivo antes de mover. Arrumar dentro da
 * coluna so muda o lugar — sem evento.
 *
 * **Mouse, toque e teclado.** O mouse pega depois de andar alguns pixels, entao o
 * clique continua abrindo o card. O toque pede segurar um instante, e deslizar
 * continua rolando o quadro. No teclado, espaco pega, as setas escolhem o lugar,
 * espaco (ou Enter) solta e Esc desiste — e Enter, fora do arraste, abre o card,
 * porque o card e um link. Soltar fora das colunas que recebem devolve o card.
 *
 * **A tela mostra o lugar antes da resposta**, e volta atras se a API recusar: so o
 * card que nao andou volta, e as duas colunas envolvidas sao lidas de novo.
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
  destacados,
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
  /** Criar um card ja nesta coluna. */
  aoCriar: (chave: string) => void
  /** Os cards que outra pessoa acabou de mudar: piscam um contorno por um instante. */
  destacados: ReadonlySet<string>
}) {
  // As colunas numa referencia: a conta das setas le a de agora a cada tecla, e as
  // opcoes do teclado continuam as mesmas entre uma renderizacao e outra.
  const colunasRef = useRef(columns)
  colunasRef.current = columns
  const teclado = useMemo(
    () => ({
      coordinateGetter: boardKeyboardCoordinates(colunasRef, board.itemsRef),
      // Espaco pega; espaco, Enter e Tab soltam; Esc desiste. Fora do arraste, o Enter
      // fica com o link, que abre o card — e no meio dele, se nao soltasse, abriria o
      // card com o arraste ainda valendo por tras do dialogo.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter', 'Tab'] },
    }),
    [board.itemsRef],
  )
  const colisao = useMemo(() => boardCollision(board.itemsRef), [board.itemsRef])

  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE),
    useSensor(TouchSensor, TOQUE),
    useSensor(KeyboardSensor, teclado),
  )

  const porChave = Object.fromEntries(columns.map((coluna) => [coluna.key, coluna]))
  const chaveDe = (id: string) => (id in porChave ? id : columnOf(board.itemsRef.current, id))

  const [ativo, setAtivo] = useState<string | null>(null)
  const inicio = useRef<{ de: string; indice: number } | null>(null)
  const [encerrando, setEncerrando] = useState<Soltura | null>(null)
  const [salvandoEncerramento, setSalvandoEncerramento] = useState(false)

  // O que outra pessoa muda espera a mao terminar: o arraste, o movimento gravando e o
  // desfecho aberto seguram as releituras do tempo real (ver `board.hold`).
  const soltarArraste = useRef<(() => void) | null>(null)
  const soltarDesfecho = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (encerrando !== null) return
    soltarDesfecho.current?.()
    soltarDesfecho.current = null
  }, [encerrando])
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
  // ele andava — outro card solto, uma coluna relida, uma pagina a mais.
  const devolver = (id: string, de: string, indice: number) =>
    board.setItems(moveBetween(board.itemsRef.current, id, de, indice))

  function aoPegar({ active, activatorEvent }: DragStartEvent) {
    const id = String(active.id)
    const de = columnOf(board.itemsRef.current, id)
    if (!de) return

    inicio.current = { de, indice: (board.itemsRef.current[de] ?? []).indexOf(id) }
    if (activatorEvent.type !== 'keydown') fimDoArraste.current = Number.POSITIVE_INFINITY
    largarArraste()
    soltarArraste.current = board.hold()
    setAtivo(id)
  }

  function aoPassar({ active, over }: DragOverEvent) {
    const id = String(active.id)
    const atual = board.itemsRef.current
    const de = columnOf(atual, id)
    const comeco = inicio.current

    // Fora das colunas que recebem: o card volta para a coluna de onde saiu.
    if (!over) {
      if (comeco && de !== comeco.de) devolver(id, comeco.de, comeco.indice)
      return
    }

    const para = chaveDe(String(over.id))
    if (!de || !para || de === para || !porChave[para]?.accepts) return

    // Sobre um card: antes ou depois dele, pelo meio dele. Sobre a coluna vazia, no fim.
    const destino = atual[para] ?? []
    const indiceDoOutro = destino.indexOf(String(over.id))
    const translado = active.rect.current.translated
    const passouDoMeio = translado !== null && translado.top > over.rect.top + over.rect.height / 2
    const indice = indiceDoOutro >= 0 ? indiceDoOutro + (passouDoMeio ? 1 : 0) : destino.length

    board.setItems(moveBetween(atual, id, para, indice))
  }

  function aoSoltar({ active, over }: DragEndEvent) {
    setAtivo(null)
    marcarFimDoArraste()
    // Solta antes de gravar: a gravacao segura por conta propria, ja na primeira linha.
    largarArraste()

    const id = String(active.id)
    const comeco = inicio.current
    inicio.current = null
    if (!comeco) return

    let atual = board.itemsRef.current
    const para = columnOf(atual, id)

    if (!over || !para || !porChave[para]?.accepts) {
      devolver(id, comeco.de, comeco.indice)
      return
    }

    // Na mesma coluna, o lugar final e o do card sobre o qual ele foi solto.
    const ids = atual[para] ?? []
    const alvo = chaveDe(String(over.id)) === para ? ids.indexOf(String(over.id)) : -1
    const daqui = ids.indexOf(id)
    if (alvo >= 0 && alvo !== daqui) {
      atual = { ...atual, [para]: arrayMove(ids, daqui, alvo) }
      board.setItems(atual)
    }

    const final = atual[para] ?? []
    if (para === comeco.de && final.indexOf(id) === comeco.indice) return

    void soltar({
      id,
      de: comeco.de,
      indice: comeco.indice,
      para,
      indicePara: final.indexOf(id),
      acima: cardAbove(final, id),
    })
  }

  function aoDesistir({ active }: DragCancelEvent) {
    setAtivo(null)
    marcarFimDoArraste()
    largarArraste()
    const comeco = inicio.current
    inicio.current = null
    if (comeco) devolver(String(active.id), comeco.de, comeco.indice)
  }

  /** Grava o lugar novo. Devolve se deu certo. */
  async function soltar(
    soltura: Soltura,
    fim?: { Outcome: PublicOutcome; Reason: string },
  ): Promise<boolean> {
    const liberar = board.hold()
    try {
      return await gravar(soltura, fim, liberar)
    } finally {
      if (soltarDesfecho.current !== liberar) liberar()
    }
  }

  async function gravar(
    soltura: Soltura,
    fim: { Outcome: PublicOutcome; Reason: string } | undefined,
    liberar: () => void,
  ): Promise<boolean> {
    const card = board.cards[soltura.id]
    const mudouDeColuna = soltura.para !== soltura.de

    // **Pergunta antes de mover**, como o seletor: o relato aberto que cai na coluna
    // que encerra precisa do desfecho e do motivo, que e o que quem relatou vai ler.
    if (
      mudouDeColuna &&
      !fim &&
      porChave[soltura.para]?.closes &&
      card?.Kind === 'Report' &&
      !card.Closed
    ) {
      // O card fica no lugar novo enquanto o desfecho esta aberto: a releitura espera
      // ate ele ser confirmado ou desistido.
      soltarDesfecho.current?.()
      soltarDesfecho.current = liberar
      setEncerrando(soltura)
      return false
    }

    // A segunda tentativa, depois de uma falha que devolveu o card: ele volta ao lugar
    // em que foi solto.
    if (columnOf(board.itemsRef.current, soltura.id) !== soltura.para)
      board.setItems(
        moveBetween(board.itemsRef.current, soltura.id, soltura.para, soltura.indicePara),
      )

    if (mudouDeColuna) {
      board.adjustTotal(soltura.de, -1)
      board.adjustTotal(soltura.para, 1)
    }

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
      return true
    } catch (falha) {
      // O conflito e de outra pessoa ter mexido no card, ou no vizinho de referencia,
      // enquanto este estava na mao: o quadro e relido aqui mesmo, e o texto diz isso.
      toast.error(
        isPanelError(falha) && falha.status === 409
          ? 'Outra pessoa mexeu neste card, ou nesta coluna, enquanto você o movia. O quadro foi relido: solte de novo, se ainda quiser.'
          : describeError(falha),
      )
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
    const chave = chaveDe(String(id))
    if (!chave) return 'fora das colunas'
    const ids = board.itemsRef.current[chave] ?? []
    const indice =
      sobre !== undefined && ids.includes(String(sobre))
        ? ids.indexOf(String(sobre))
        : ids.indexOf(String(id))
    const nome = porChave[chave]?.name ?? ''
    return indice >= 0 ? `${nome}, posição ${indice + 1} de ${ids.length}` : nome
  }

  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Pegou ${rotulo(active.id)}, em ${lugar(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${rotulo(active.id)} em ${lugar(active.id, over.id)}.`
        : `${rotulo(active.id)} fora das colunas: soltar aqui devolve o card.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Soltou ${rotulo(active.id)} em ${lugar(active.id)}.`
        : `${rotulo(active.id)} voltou para o lugar.`,
    onDragCancel: ({ active }) => `Movimento desfeito: ${rotulo(active.id)} voltou para o lugar.`,
  }

  const cardAtivo = ativo ? board.cards[ativo] : undefined

  // O card com o foco que sai da coluna por outra pessoa nao leva o foco para o comeco
  // da pagina.
  const area = useRef<HTMLDivElement>(null)
  useKeepFocus(area)

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={colisao}
        onDragStart={aoPegar}
        onDragOver={aoPassar}
        onDragEnd={aoSoltar}
        onDragCancel={aoDesistir}
        accessibility={{
          announcements: anuncios,
          screenReaderInstructions: {
            draggable:
              'Enter abre o card. Para mudar o card de lugar, aperte espaço: as setas escolhem o lugar — para os lados, a coluna —, espaço ou Enter solta e Esc desiste.',
          },
        }}
      >
        <div
          ref={area}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:snap-none sm:px-0"
        >
          {columns.map((coluna) => (
            <Coluna
              key={coluna.key}
              coluna={coluna}
              ids={board.items[coluna.key] ?? []}
              cards={board.cards}
              estado={board.state[coluna.key]}
              soonDays={soonDays}
              lastColumnDays={lastColumnDays}
              aoMostrarMais={() => {
                board.loadMore(coluna.key).catch((falha) => toast.error(describeError(falha)))
              }}
              aoTentarDeNovo={() => void board.loadColumn(coluna.key)}
              aoVerNaLista={() => aoVerNaLista(coluna.key)}
              aoCriar={() => aoCriar(coluna.key)}
              destacados={destacados}
            />
          ))}
        </div>

        <DragOverlay>
          {cardAtivo ? <BoardCardFace card={cardAtivo} soonDays={soonDays} lifted /> : null}
        </DragOverlay>
      </DndContext>

      {encerrando && (
        <CloseReportDialog
          coluna={porChave[encerrando.para]?.name ?? null}
          encerrando={salvandoEncerramento}
          aoConfirmar={(outcome, reason) => {
            setSalvandoEncerramento(true)
            // Falhando, o dialogo fica, com o motivo escrito: da para tentar de novo
            // ou desistir — como no dialogo do card.
            void soltar(encerrando, { Outcome: outcome, Reason: reason }).then((deu) => {
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
    </>
  )
}

function Coluna({
  coluna,
  ids,
  cards,
  estado,
  soonDays,
  lastColumnDays,
  aoMostrarMais,
  aoTentarDeNovo,
  aoVerNaLista,
  aoCriar,
  destacados,
}: {
  coluna: BoardColumn
  ids: string[]
  cards: Record<string, ReportSummaryViewModel>
  estado: BoardColumnState | undefined
  soonDays: number
  lastColumnDays: number
  aoMostrarMais: () => void
  aoTentarDeNovo: () => void
  aoVerNaLista: () => void
  aoCriar: () => void
  destacados: ReadonlySet<string>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.key, disabled: !coluna.accepts })
  const titulo = coluna.retired ? `${coluna.name} (aposentada)` : coluna.name
  const carregando = !estado || estado.loading
  // A regra dos dias deixa na lista o que entrou na ultima coluna ha mais tempo. A
  // contagem conta todos; a coluna, so os que ficam.
  const escondidos =
    coluna.last && lastColumnDays > 0 && estado && !estado.loading
      ? Math.max(0, coluna.total - estado.total)
      : 0
  const diasDaRegra = lastColumnDays === 1 ? '1 dia' : `${lastColumnDays} dias`
  const total = estado && !estado.loading ? estado.total : coluna.total

  // A coluna inteira recebe — o cabecalho tambem: e para la que a mao mira.
  return (
    <section
      ref={setNodeRef}
      aria-label={titulo}
      // O foco do card que saiu desta coluna fica nela (ver `useKeepFocus`).
      data-focus-group
      className={cn(
        'flex w-[85vw] max-w-80 flex-none snap-start flex-col rounded-lg border border-transparent bg-surface-sunken sm:w-68',
        isOver && coluna.accepts && 'border-accent',
      )}
    >
      {/* O nome em caixa alta e a contagem logo depois dele: o cabecalho rotula a
          coluna, e nao compete com os titulos dos cards. O nome que nao cabe vai inteiro
          no `title`. */}
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <h2
          title={titulo}
          className="min-w-0 truncate font-semibold text-caption text-fg-muted uppercase tracking-wide"
        >
          {titulo}
        </h2>
        <span className="flex-none text-caption text-fg-muted tabular-nums">
          {total}
          <span className="sr-only">{total === 1 ? ' card' : ' cards'}</span>
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

      {/* Escrito, e nao numa dica: a dica nao abre no toque, e quem arrasta pelo
          celular precisa saber antes de soltar. */}
      {coluna.closes && (
        <p className="px-3 pb-1.5 text-caption text-fg-muted leading-snug">
          Soltar um relato aberto aqui encerra: o painel pede o desfecho e o motivo.
        </p>
      )}
      {!coluna.accepts && (
        <p className="px-3 pb-1.5 text-caption text-fg-muted leading-snug">
          {coluna.retired
            ? 'Aposentada: não recebe card. Os que estão aqui saem arrastando.'
            : 'Ainda fora da fila: daqui o card sai arrastando, e não volta.'}
        </p>
      )}

      <SortableContext id={coluna.key} items={ids} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-20 flex-1 flex-col gap-2 rounded-lg px-2 pt-1 pb-2">
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
                  recebe={coluna.accepts}
                  destacado={destacados.has(id)}
                />
              ) : null
            })
          )}

          {!carregando && !estado?.failed && ids.length === 0 && (
            <li className="rounded-lg border border-border border-dashed px-3 py-4 text-center text-caption text-fg-muted">
              Nenhum card
            </li>
          )}
        </ul>
      </SortableContext>

      {estado?.failed && (
        <div className="px-3 pb-3">
          <p className="mb-2 text-caption text-fg-muted">Não deu para carregar esta coluna.</p>
          <Button size="sm" onClick={aoTentarDeNovo}>
            Tentar de novo
          </Button>
        </div>
      )}

      {estado && !estado.loading && !estado.end && ids.length < estado.total && (
        <div className="px-2 pb-2">
          <Button
            size="sm"
            className="w-full"
            disabled={estado.loadingMore}
            onClick={aoMostrarMais}
          >
            {estado.loadingMore ? 'Carregando…' : 'Mostrar mais'}
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

      {/* Criar ja na coluna, no pe dela, onde o olho termina de ler a coluna. So na que
          recebe: nas outras, o card nasceria onde ninguem pode coloca-lo. */}
      {coluna.accepts && (
        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={aoCriar}
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
      )}
    </section>
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
 * arrasta.
 */
function CardArrastavel({
  id,
  card,
  soonDays,
  recebe,
  destacado,
}: {
  id: string
  card: ReportSummaryViewModel
  soonDays: number
  /** Outra pessoa acabou de muda-lo. */
  destacado: boolean
  /** A coluna recebe card. Na que nao recebe, o card sai arrastando, mas ninguem cai em cima dele. */
  recebe: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: recebe ? false : { draggable: false, droppable: true },
    attributes: { role: 'link', roleDescription: 'card arrastável' },
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
    >
      <Link
        to={id}
        {...attributes}
        {...listeners}
        // Segurar o card no celular e pegar, e nao abrir a previa do link (iPhone) nem
        // selecionar o texto.
        className="block touch-manipulation select-none rounded-lg outline-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-accent"
      >
        <BoardCardFace card={card} soonDays={soonDays} highlighted={destacado} />
      </Link>
    </li>
  )
}
