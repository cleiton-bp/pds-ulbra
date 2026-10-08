import {
  type Announcements,
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  ReportStateCountViewModel,
  ReportSummaryViewModel,
  SprintViewModel,
} from '@/contracts'
import { describeError, projectReportService, sprintService } from '@/data'
import {
  CardTypeIcon,
  cardHeadline,
  PersonAvatar,
  StatusLozenge,
  statusTone,
} from '@/features/reports/cardLook'
import { backlogKeyboardCoordinates } from '@/features/reports/sprints/backlogKeyboard'
import {
  CloseSprintDialog,
  formatPoints,
  SprintDialog,
  sprintDates,
} from '@/features/reports/sprints/sprintLook'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import {
  DropdownGroup,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
} from '@/shared/components/DropdownMenu'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { cn } from '@/shared/lib/cn'

/** A lista do backlog, ao lado das listas das sprints. */
const BACKLOG = 'backlog'

/** Quantos cards cada lista le de uma vez. */
const PAGE = 100

const MOUSE = { activationConstraint: { distance: 5 } }
// No toque, segurar um instante: senao, rolar a lista arrastaria o card.
const TOQUE = { activationConstraint: { delay: 250, tolerance: 6 } }

type Listas = Record<string, string[]>

/**
 * O backlog e as sprints que nao foram concluidas: a em andamento, as planejadas, e o backlog
 * embaixo, cada um na ordem que o time arruma.
 *
 * **Arrastar** leva o card para outra lista ou para outro lugar na mesma — com o mouse,
 * com o toque (segurando um instante) ou com o teclado (espaco pega, setas, espaco
 * solta). **O menu de cada card** faz o mesmo sem arrastar: mover para uma sprint ou
 * para o backlog, o topo, o fim. O card abre pelo titulo.
 */
export function SprintBacklog({
  projectPublicId,
  sprints,
  colunas,
  versao,
  aoMudou,
}: {
  projectPublicId: string
  /** As sprints que nao foram concluidas; nula enquanto carrega. */
  sprints: SprintViewModel[] | null
  colunas: ReportStateCountViewModel[] | null
  /** Sobe quando um card ou uma sprint mudou fora daqui: as listas sao relidas. */
  versao: number
  /** Algo mudou aqui: as sprints (os numeros delas) e o quadro precisam saber. */
  aoMudou: () => void
}) {
  const secoes = [...(sprints ?? []).map((sprint) => sprint.PublicId), BACKLOG]
  const chaveDasSecoes = secoes.join(',')
  const [listas, setListas] = useState<Listas | null>(null)
  const listasRef = useRef<Listas | null>(null)
  listasRef.current = listas
  const [totais, setTotais] = useState<Record<string, number>>({})
  const [cards, setCards] = useState<Record<string, ReportSummaryViewModel>>({})
  const [falhou, setFalhou] = useState(false)
  const leitura = useRef(0)
  const segurando = useRef(false)

  const ler = useCallback(async () => {
    if (sprints === null) return
    const minha = ++leitura.current
    try {
      const paginas = await Promise.all(
        chaveDasSecoes.split(',').map(async (secao) => {
          const pagina = await projectReportService.listReports(projectPublicId, 1, null, false, {
            order: 'backlog',
            pageSize: PAGE,
            sprint: secao,
          })
          return [secao, pagina] as const
        }),
      )
      // A leitura velha, ou a que chega no meio de um arraste, nao passa por cima.
      if (minha !== leitura.current || segurando.current) return
      const novos: Record<string, ReportSummaryViewModel> = {}
      const novasListas: Listas = {}
      const novosTotais: Record<string, number> = {}
      for (const [secao, pagina] of paginas) {
        novasListas[secao] = pagina.reports.map((card) => card.PublicId)
        novosTotais[secao] = pagina.total
        for (const card of pagina.reports) novos[card.PublicId] = card
      }
      setCards(novos)
      setListas(novasListas)
      setTotais(novosTotais)
      setFalhou(false)
    } catch {
      if (minha === leitura.current) setFalhou(true)
    }
  }, [projectPublicId, chaveDasSecoes, sprints])

  // biome-ignore lint/correctness/useExhaustiveDependencies: a versao e o gatilho da releitura
  useEffect(() => {
    void ler()
  }, [ler, versao])

  // ─── Mover ─────────────────────────────────────────────────────────────────
  const secaoDe = (id: string, de: Listas | null = listasRef.current): string | undefined =>
    id in (de ?? {}) ? id : Object.keys(de ?? {}).find((secao) => de?.[secao]?.includes(id))

  async function gravar(id: string, secao: string, depoisDe: string | null, topo: boolean) {
    try {
      const aberto = await projectReportService.setSprint(projectPublicId, id, {
        SprintPublicId: secao === BACKLOG ? null : secao,
        AfterPublicId: depoisDe,
        Top: depoisDe === null && topo,
      })
      setCards((atual) => ({ ...atual, [id]: { ...atual[id], ...aberto } }))
      aoMudou()
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      void ler()
    }
  }

  /** Move pelo menu: para o topo ou o fim de uma lista. */
  function moverPara(id: string, secao: string, topo: boolean) {
    const de = secaoDe(id)
    if (!listas || !de) return
    setListas((atual) => {
      if (!atual) return atual
      const semEle = { ...atual, [de]: (atual[de] ?? []).filter((item) => item !== id) }
      const destino = semEle[secao] ?? []
      semEle[secao] = topo ? [id, ...destino] : [...destino, id]
      return semEle
    })
    void gravar(id, secao, null, topo)
  }

  const secoesRef = useRef(secoes)
  secoesRef.current = secoes
  const teclado = useMemo(() => backlogKeyboardCoordinates(secoesRef, listasRef), [])
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE),
    useSensor(TouchSensor, TOQUE),
    useSensor(KeyboardSensor, { coordinateGetter: teclado }),
  )
  const [ativo, setAtivo] = useState<string | null>(null)
  const origem = useRef<{ secao: string; indice: number } | null>(null)

  function aoPegar({ active }: DragStartEvent) {
    const id = String(active.id)
    const secao = secaoDe(id)
    if (!secao) return
    segurando.current = true
    origem.current = { secao, indice: listasRef.current?.[secao]?.indexOf(id) ?? 0 }
    setAtivo(id)
  }

  // Ao passar sobre outra lista, o card ja vai para ela: o lugar se escolhe la dentro.
  function aoPassar({ active, over }: DragOverEvent) {
    if (!over) return
    const id = String(active.id)
    const de = secaoDe(id)
    const para = secaoDe(String(over.id))
    if (!de || !para || de === para) return
    setListas((atual) => {
      if (!atual) return atual
      const destino = atual[para] ?? []
      const naFrente = destino.indexOf(String(over.id))
      const indice = naFrente >= 0 ? naFrente : destino.length
      return {
        ...atual,
        [de]: (atual[de] ?? []).filter((item) => item !== id),
        [para]: [...destino.slice(0, indice), id, ...destino.slice(indice)],
      }
    })
  }

  function aoSoltar({ active, over }: DragEndEvent) {
    const id = String(active.id)
    setAtivo(null)
    segurando.current = false
    const antes = origem.current
    origem.current = null
    const atual = listasRef.current
    if (!over || !atual || !antes) {
      void ler()
      return
    }
    const secao = secaoDe(id, atual)
    if (!secao) return
    let lista = atual[secao] ?? []
    const alvo = String(over.id)
    const de = lista.indexOf(id)
    const para = alvo === secao ? lista.length - 1 : lista.indexOf(alvo)
    if (para >= 0 && de !== para) {
      lista = [...lista]
      lista.splice(de, 1)
      lista.splice(para, 0, id)
      setListas({ ...atual, [secao]: lista })
    }
    const indice = lista.indexOf(id)
    if (secao === antes.secao && indice === antes.indice) return
    void gravar(id, secao, indice > 0 ? (lista[indice - 1] ?? null) : null, indice === 0)
  }

  const nomeDaSecao = (secao: string) =>
    secao === BACKLOG
      ? 'o backlog'
      : (sprints?.find((sprint) => sprint.PublicId === secao)?.Name ?? 'a sprint')
  const numeroDe = (id: string) => (cards[id] ? `#${cards[id].Number}` : 'o card')
  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Pegou ${numeroDe(String(active.id))}.`,
    onDragOver: ({ active, over }) => {
      if (!over) return undefined
      const secao = secaoDe(String(over.id)) ?? BACKLOG
      const lista = listasRef.current?.[secao] ?? []
      const posicao = lista.indexOf(String(over.id))
      return posicao >= 0
        ? `${numeroDe(String(active.id))} em ${nomeDaSecao(secao)}, posição ${posicao + 1} de ${lista.length}.`
        : `${numeroDe(String(active.id))} em ${nomeDaSecao(secao)}.`
    },
    onDragEnd: ({ active, over }) =>
      over
        ? `${numeroDe(String(active.id))} solto em ${nomeDaSecao(secaoDe(String(active.id)) ?? BACKLOG)}.`
        : `${numeroDe(String(active.id))} voltou ao lugar.`,
    onDragCancel: ({ active }) => `${numeroDe(String(active.id))} voltou ao lugar.`,
  }

  // ─── As sprints ────────────────────────────────────────────────────────────
  const [dialogo, setDialogo] = useState<
    | { tipo: 'start' | 'edit'; sprint: SprintViewModel }
    | { tipo: 'close'; sprint: SprintViewModel }
    | { tipo: 'delete'; sprint: SprintViewModel }
    | null
  >(null)
  const [criando, setCriando] = useState(false)
  const temAtiva = (sprints ?? []).some((sprint) => sprint.State === 'Active')

  async function criarSprint() {
    setCriando(true)
    try {
      const nova = await sprintService.createSprint(projectPublicId, {})
      toast.done(`${nova.Name} criada.`)
      aoMudou()
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setCriando(false)
    }
  }

  if (sprints === null || (listas === null && !falhou)) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (falhou && listas === null) {
    return (
      <div className="max-w-170 rounded-xl border border-border bg-surface-raised p-5">
        <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
          Não deu para carregar o backlog agora. Nada se perdeu: a falha foi ao consultar.
        </p>
        <Button onClick={() => void ler()}>Tentar de novo</Button>
      </div>
    )
  }

  const destinosDoMenu = (secaoAtual: string) =>
    secoes
      .filter((secao) => secao !== secaoAtual)
      .map((secao) => ({ secao, nome: secao === BACKLOG ? 'Backlog' : nomeDaSecao(secao) }))

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={aoPegar}
        onDragOver={aoPassar}
        onDragEnd={aoSoltar}
        onDragCancel={() => {
          setAtivo(null)
          segurando.current = false
          origem.current = null
          void ler()
        }}
        accessibility={{
          announcements: anuncios,
          screenReaderInstructions: {
            draggable:
              'Para mudar o card de lugar, aperte espaço: as setas escolhem o lugar, inclusive em outra sprint ou no backlog; espaço solta e Esc desiste. O menu do card faz o mesmo sem arrastar.',
          },
        }}
      >
        <div className="flex flex-col gap-5">
          {secoes.map((secao) => {
            const sprint = sprints.find((item) => item.PublicId === secao) ?? null
            const ids = listas?.[secao] ?? []
            return (
              <Secao
                key={secao}
                secao={secao}
                sprint={sprint}
                total={totais[secao] ?? ids.length}
                cartoes={ids.map((id) => cards[id]).filter((card) => card !== undefined)}
                colunas={colunas}
                temAtiva={temAtiva}
                criandoSprint={criando}
                aoCriarSprint={() => void criarSprint()}
                aoIniciar={(alvo) => setDialogo({ tipo: 'start', sprint: alvo })}
                aoEditar={(alvo) => setDialogo({ tipo: 'edit', sprint: alvo })}
                aoConcluir={(alvo) => setDialogo({ tipo: 'close', sprint: alvo })}
                aoApagar={(alvo) => setDialogo({ tipo: 'delete', sprint: alvo })}
                destinos={destinosDoMenu(secao)}
                aoMover={moverPara}
                ativo={ativo}
              />
            )
          })}
        </div>

        <DragOverlay>
          {ativo && cards[ativo] ? (
            <div className="rounded-lg border border-border bg-surface shadow-lg ring-2 ring-accent">
              <Linha card={cards[ativo]} colunas={colunas} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {(dialogo?.tipo === 'start' || dialogo?.tipo === 'edit') && (
        <SprintDialog
          projectPublicId={projectPublicId}
          sprint={dialogo.sprint}
          mode={dialogo.tipo}
          aoSalvar={() => {
            setDialogo(null)
            aoMudou()
          }}
          aoCancelar={() => setDialogo(null)}
        />
      )}

      {dialogo?.tipo === 'close' && (
        <CloseSprintDialog
          projectPublicId={projectPublicId}
          sprint={dialogo.sprint}
          planejadas={sprints.filter((sprint) => sprint.State === 'Planned')}
          aoFechar={() => {
            setDialogo(null)
            aoMudou()
          }}
          aoCancelar={() => setDialogo(null)}
        />
      )}

      <ConfirmDialog
        open={dialogo?.tipo === 'delete'}
        onOpenChange={(aberto) => {
          if (!aberto) setDialogo(null)
        }}
        title={dialogo?.tipo === 'delete' ? `Apagar ${dialogo.sprint.Name}` : 'Apagar a sprint'}
        description={
          dialogo?.tipo === 'delete'
            ? `${dialogo.sprint.Cards === 0 ? 'A sprint está vazia.' : dialogo.sprint.Cards === 1 ? 'O card dela volta para o fim do backlog.' : `Os ${dialogo.sprint.Cards} cards dela voltam para o fim do backlog.`} Só a sprint planejada se apaga.`
            : ''
        }
        confirmLabel="Apagar"
        tone="warn"
        onConfirm={async () => {
          if (dialogo?.tipo !== 'delete') return
          try {
            await sprintService.deleteSprint(projectPublicId, dialogo.sprint.PublicId)
            toast.done(`${dialogo.sprint.Name} apagada.`)
            setDialogo(null)
            aoMudou()
          } catch (falha) {
            toast.error(describeError(falha))
          }
        }}
      />
    </>
  )
}

/** Uma lista: o cabecalho da sprint (ou do backlog) e os cards dela. */
function Secao({
  secao,
  sprint,
  total,
  cartoes,
  colunas,
  temAtiva,
  criandoSprint,
  aoCriarSprint,
  aoIniciar,
  aoEditar,
  aoConcluir,
  aoApagar,
  destinos,
  aoMover,
  ativo,
}: {
  secao: string
  sprint: SprintViewModel | null
  total: number
  cartoes: ReportSummaryViewModel[]
  colunas: ReportStateCountViewModel[] | null
  temAtiva: boolean
  criandoSprint: boolean
  aoCriarSprint: () => void
  aoIniciar: (sprint: SprintViewModel) => void
  aoEditar: (sprint: SprintViewModel) => void
  aoConcluir: (sprint: SprintViewModel) => void
  aoApagar: (sprint: SprintViewModel) => void
  destinos: { secao: string; nome: string }[]
  aoMover: (id: string, secao: string, topo: boolean) => void
  ativo: string | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: secao })
  const tituloId = `secao-${secao}`
  const pontos = cartoes.reduce((soma, card) => soma + (card.StoryPoints ?? 0), 0)

  return (
    <section
      aria-labelledby={tituloId}
      className={cn(
        'rounded-xl border bg-surface-raised',
        sprint?.State === 'Active' ? 'border-accent' : 'border-border',
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-border border-b px-4 py-2.5">
        <div className="min-w-0">
          <h3
            id={tituloId}
            className="flex flex-wrap items-baseline gap-x-2 font-semibold text-body text-fg"
          >
            {sprint ? sprint.Name : 'Backlog'}
            {sprint && (
              <span className="font-normal text-detail text-fg-muted">
                {' '}
                {sprintDates(sprint)}
                {sprint.State === 'Active' ? ' · em andamento' : ' · planejada'}
              </span>
            )}
          </h3>
          {sprint?.Goal && <p className="mt-0.5 text-caption text-fg-muted">{sprint.Goal}</p>}
        </div>
        <div className="flex flex-none items-center gap-2">
          <span className="text-caption text-fg-muted tabular-nums">
            {total} {total === 1 ? 'card' : 'cards'} ·{' '}
            {formatPoints(sprint ? sprint.Points : pontos)}{' '}
            {(sprint ? sprint.Points : pontos) === 1 ? 'ponto' : 'pontos'}
          </span>
          {sprint === null ? (
            <Button size="sm" disabled={criandoSprint} onClick={aoCriarSprint}>
              {criandoSprint ? 'Criando…' : 'Criar sprint'}
            </Button>
          ) : sprint.State === 'Active' ? (
            <Button size="sm" onClick={() => aoConcluir(sprint)}>
              Concluir sprint
            </Button>
          ) : // O porque escrito, e nao numa dica: a dica nao abre no toque nem no teclado.
          temAtiva ? (
            <span className="text-caption text-fg-muted">
              Inicia depois que a em andamento for concluída
            </span>
          ) : (
            <Button size="sm" onClick={() => aoIniciar(sprint)}>
              Iniciar sprint
            </Button>
          )}
          {sprint && (
            <DropdownMenu
              trigger={
                <button
                  type="button"
                  aria-label={`Mais ações de ${sprint.Name}`}
                  className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-sunken hover:text-fg"
                >
                  <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
                    <circle cx="3.5" cy="8" r="1.3" />
                    <circle cx="8" cy="8" r="1.3" />
                    <circle cx="12.5" cy="8" r="1.3" />
                  </svg>
                </button>
              }
            >
              <DropdownGroup>
                <DropdownItem onSelect={() => aoEditar(sprint)}>Editar</DropdownItem>
                {sprint.State === 'Planned' && (
                  <DropdownItem onSelect={() => aoApagar(sprint)}>Apagar</DropdownItem>
                )}
              </DropdownGroup>
            </DropdownMenu>
          )}
        </div>
      </header>

      <SortableContext
        id={secao}
        items={cartoes.map((card) => card.PublicId)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          ref={setNodeRef}
          aria-label={sprint ? `Cards de ${sprint.Name}` : 'Cards do backlog'}
          className={cn('min-h-12 divide-y divide-border', isOver && 'bg-surface-sunken')}
        >
          {cartoes.length === 0 && (
            <li className="px-4 py-3 text-detail text-fg-muted">
              {sprint
                ? 'Nenhum card nesta sprint. Arraste do backlog, ou use o menu de um card.'
                : 'Nada no backlog.'}
            </li>
          )}
          {cartoes.map((card) => (
            <ItemArrastavel
              key={card.PublicId}
              card={card}
              colunas={colunas}
              destinos={destinos}
              aoMover={(destino, topo) => aoMover(card.PublicId, destino, topo)}
              escondido={ativo === card.PublicId}
              secao={secao}
            />
          ))}
        </ul>
      </SortableContext>
      {total > cartoes.length && (
        <p className="px-4 py-2 text-caption text-fg-muted">
          Mostrando {cartoes.length} de {total}. Os outros estão na Lista.
        </p>
      )}
    </section>
  )
}

function ItemArrastavel({
  card,
  colunas,
  destinos,
  aoMover,
  escondido,
  secao,
}: {
  card: ReportSummaryViewModel
  colunas: ReportStateCountViewModel[] | null
  destinos: { secao: string; nome: string }[]
  aoMover: (secao: string, topo: boolean) => void
  escondido: boolean
  secao: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: card.PublicId,
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(escondido && 'opacity-40')}
    >
      <Linha
        card={card}
        colunas={colunas}
        alca={
          <button
            type="button"
            aria-label={`Mover #${card.Number}`}
            className="flex size-6 flex-none cursor-grab touch-none items-center justify-center rounded text-fg-muted hover:bg-surface-sunken hover:text-fg"
            {...attributes}
            {...listeners}
          >
            <svg viewBox="0 0 12 12" className="size-3" fill="currentColor" aria-hidden>
              <circle cx="4" cy="3" r="1" />
              <circle cx="8" cy="3" r="1" />
              <circle cx="4" cy="6" r="1" />
              <circle cx="8" cy="6" r="1" />
              <circle cx="4" cy="9" r="1" />
              <circle cx="8" cy="9" r="1" />
            </svg>
          </button>
        }
        menu={
          <DropdownMenu
            trigger={
              <button
                type="button"
                aria-label={`Mover #${card.Number} para…`}
                className="flex size-6 flex-none items-center justify-center rounded text-fg-muted hover:bg-surface-sunken hover:text-fg"
              >
                <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
                  <circle cx="3.5" cy="8" r="1.3" />
                  <circle cx="8" cy="8" r="1.3" />
                  <circle cx="12.5" cy="8" r="1.3" />
                </svg>
              </button>
            }
          >
            <DropdownGroup>
              {destinos.map((destino) => (
                <DropdownItem key={destino.secao} onSelect={() => aoMover(destino.secao, false)}>
                  Mover para {destino.nome}
                </DropdownItem>
              ))}
            </DropdownGroup>
            <DropdownSeparator />
            <DropdownGroup>
              <DropdownItem quiet onSelect={() => aoMover(secao, true)}>
                Para o topo
              </DropdownItem>
              <DropdownItem quiet onSelect={() => aoMover(secao, false)}>
                Para o fim
              </DropdownItem>
            </DropdownGroup>
          </DropdownMenu>
        }
      />
    </li>
  )
}

/** A linha de um card no backlog: tipo, numero, titulo, coluna, pontos e responsavel. */
function Linha({
  card,
  colunas,
  alca,
  menu,
}: {
  card: ReportSummaryViewModel
  colunas: ReportStateCountViewModel[] | null
  alca?: React.ReactNode
  menu?: React.ReactNode
}) {
  const titulo = cardHeadline(card)
  return (
    <div className="flex min-w-0 items-center gap-2 px-3 py-2">
      {alca}
      <CardTypeIcon card={card} />
      <span className="flex-none font-mono text-caption text-fg-muted">#{card.Number}</span>
      <Link
        to={card.PublicId}
        className={cn(
          'min-w-0 flex-1 truncate text-detail underline-offset-2 hover:underline',
          card.Finished
            ? 'text-fg-muted line-through'
            : titulo.titled
              ? 'text-fg'
              : 'text-fg-muted',
        )}
      >
        {titulo.text}
      </Link>
      {card.SubtaskCount > 0 && (
        <span className="hidden flex-none text-caption text-fg-muted sm:inline">
          {card.SubtasksDone}/{card.SubtaskCount}
        </span>
      )}
      {card.StateName && (
        <StatusLozenge
          name={card.StateName}
          tone={statusTone(card.StatePublicId, colunas)}
          className="hidden max-w-28 flex-none sm:inline-flex"
        />
      )}
      <PointsChip points={card.StoryPoints} />
      {card.Assignee && <PersonAvatar pessoa={card.Assignee} />}
      {menu}
    </div>
  )
}

/** Os pontos do card, num selo; sem estimativa, nada. */
export function PointsChip({ points }: { points: number | null }) {
  if (points === null) return null
  return (
    <span
      title={`${formatPoints(points)} ${points === 1 ? 'ponto' : 'pontos'}`}
      className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-surface-sunken px-1.5 font-medium text-caption text-fg tabular-nums"
    >
      <span aria-hidden>{formatPoints(points)}</span>
      <span className="sr-only">
        {formatPoints(points)} {points === 1 ? 'ponto' : 'pontos'}
      </span>
    </span>
  )
}
