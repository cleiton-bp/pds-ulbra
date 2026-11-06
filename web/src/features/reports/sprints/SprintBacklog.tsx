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
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'
import {
  MAX_STORY_POINTS,
  type ReportStateCountViewModel,
  type ReportSummaryViewModel,
  type SprintViewModel,
} from '@/contracts'
import { describeError, NO_REPORT_FILTERS, projectReportService, sprintService } from '@/data'
import {
  CardTypeIcon,
  cardHeadline,
  headlineText,
  PersonAvatar,
  PriorityIcon,
  StatusLozenge,
  SubtaskMatchMark,
  statusTone,
} from '@/features/reports/cardLook'
import { backlogKeyboardCoordinates } from '@/features/reports/sprints/backlogKeyboard'
import {
  CloseSprintDialog,
  pointsText,
  SprintDialog,
  sprintDates,
  todayIso,
} from '@/features/reports/sprints/sprintLook'
import { ACTIVE_FILTER_CLASS, SearchShortcutHint } from '@/features/reports/WorkFilterBar'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { PointsChip, pointsShort } from '@/shared/components/cardFace'
import {
  DropdownGroup,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
} from '@/shared/components/DropdownMenu'
import { DueChip } from '@/shared/components/DueChip'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/cn'
import { dueState } from '@/shared/lib/dueDate'

/** A lista do backlog, ao lado das listas das sprints. */
const BACKLOG = 'backlog'

/** Quantos cards cada lista le de uma vez. */
const PAGE = 100

/** Quanto a busca espera depois da ultima tecla: uma leitura por palavra, e nao por letra. */
const BUSCA_MS = 300

const MOUSE = { activationConstraint: { distance: 5 } }
// No toque, segurar um instante: senao, rolar a lista arrastaria o card.
const TOQUE = { activationConstraint: { delay: 250, tolerance: 6 } }

type Listas = Record<string, string[]>

/** As listas recolhidas, lembradas neste navegador por projeto: preferencia de quem olha. */
const chaveDasRecolhidas = (projeto: string) => `pds.web.backlog.recolhidas.${projeto}`

function lerRecolhidas(projeto: string): ReadonlySet<string> {
  try {
    const bruto = window.localStorage.getItem(chaveDasRecolhidas(projeto))
    const lista: unknown = bruto ? JSON.parse(bruto) : []
    return new Set(
      Array.isArray(lista) ? lista.filter((item): item is string => typeof item === 'string') : [],
    )
  } catch {
    return new Set()
  }
}

/**
 * O backlog e as sprints que nao foram concluidas: a em andamento, as planejadas, e o backlog
 * embaixo, cada um na ordem que o time arruma.
 *
 * **Arrastar** leva o card para outra lista ou para outro lugar na mesma — com o mouse,
 * com o toque (segurando um instante) ou com o teclado (espaco pega, setas, espaco
 * solta). **O menu de cada card** faz o mesmo sem arrastar: mover para uma sprint ou
 * para o backlog, o topo, o fim — e o aviso de que foi traz "Desfazer". O card abre
 * pelo titulo.
 *
 * **Planejar sem abrir card**: a linha mostra a prioridade e o prazo perto ou vencido, e
 * os pontos se estimam ali mesmo. **A busca** (titulo, texto, #numero) e "Meus cards"
 * escondem o que nao bate, sem mudar a ordem — e acham o pai tambem pela subtarefa.
 * Cada lista se recolhe, e fica recolhida neste navegador.
 */
export function SprintBacklog({
  projectPublicId,
  sprints,
  colunas,
  versao,
  aoMudou,
  soonDays,
  sprintWeeks,
  searchInputId,
  aoContarBacklog,
  barra,
}: {
  projectPublicId: string
  /** As sprints que nao foram concluidas; nula enquanto carrega. */
  sprints: SprintViewModel[] | null
  colunas: ReportStateCountViewModel[] | null
  /** Sobe quando um card ou uma sprint mudou fora daqui: as listas sao relidas. */
  versao: number
  /** Algo mudou aqui: as sprints (os numeros delas) e o quadro precisam saber. */
  aoMudou: () => void
  /** Faltando ate quantos dias o prazo fica em destaque — a regra do projeto. */
  soonDays: number
  /** A duracao com que as sprints nascem, em semanas: o dialogo de iniciar conta dela. */
  sprintWeeks?: number
  /** O id do campo de busca: o "/" da tela o alcanca por ele, como o da barra de filtros. */
  searchInputId?: string
  /**
   * Quantos cards o backlog tem, a cada leitura sem a busca: a aba "Backlog" diz o
   * numero sem uma leitura so para isso.
   */
  aoContarBacklog?: (total: number) => void
  /**
   * O fim da linha da busca: o "Como funciona" e os arquivados, que a tela poe no mesmo
   * lugar da barra da lista e do quadro. Aparece tambem enquanto o backlog carrega.
   */
  barra?: ReactNode
}) {
  const secoes = [...(sprints ?? []).map((sprint) => sprint.PublicId), BACKLOG]
  const chaveDasSecoes = secoes.join(',')
  const [listas, setListas] = useState<Listas | null>(null)
  const listasRef = useRef<Listas | null>(null)
  listasRef.current = listas
  const [totais, setTotais] = useState<Record<string, number>>({})
  /** Quantos cada lista leu: o rodape de "faltam cards" compara com isto, e nao com o de agora. */
  const [lidos, setLidos] = useState<Record<string, number>>({})
  const [cards, setCards] = useState<Record<string, ReportSummaryViewModel>>({})
  const [falhou, setFalhou] = useState(false)
  const leitura = useRef(0)
  const segurando = useRef(false)
  const contar = useRef(aoContarBacklog)
  contar.current = aoContarBacklog

  // ─── A busca ───────────────────────────────────────────────────────────────
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [meus, setMeus] = useState(false)
  useEffect(() => {
    const espera = setTimeout(() => setBuscaAplicada(busca.trim()), BUSCA_MS)
    return () => clearTimeout(espera)
  }, [busca])
  const buscando = buscaAplicada !== '' || meus

  const ler = useCallback(async () => {
    if (sprints === null) return
    const minha = ++leitura.current
    // A busca vai a API, na ordem do backlog: o que nao bate some, e a ordem fica.
    const filters =
      buscaAplicada !== '' || meus
        ? { ...NO_REPORT_FILTERS, search: buscaAplicada, assignees: meus ? ['me'] : [] }
        : undefined
    try {
      const paginas = await Promise.all(
        chaveDasSecoes.split(',').map(async (secao) => {
          const pagina = await projectReportService.listReports(projectPublicId, 1, null, false, {
            order: 'backlog',
            pageSize: PAGE,
            sprint: secao,
            filters,
          })
          return [secao, pagina] as const
        }),
      )
      // A leitura velha, ou a que chega no meio de um arraste, nao passa por cima.
      if (minha !== leitura.current || segurando.current) return
      const novos: Record<string, ReportSummaryViewModel> = {}
      const novasListas: Listas = {}
      const novosTotais: Record<string, number> = {}
      const novosLidos: Record<string, number> = {}
      for (const [secao, pagina] of paginas) {
        novasListas[secao] = pagina.reports.map((card) => card.PublicId)
        novosTotais[secao] = pagina.total
        novosLidos[secao] = pagina.reports.length
        for (const card of pagina.reports) novos[card.PublicId] = card
      }
      setCards(novos)
      setListas(novasListas)
      setTotais(novosTotais)
      setLidos(novosLidos)
      setFalhou(false)
      // So a leitura sem a busca e o tamanho do backlog: com ela, e o que bateu.
      const doBacklog = novosTotais[BACKLOG]
      if (!filters && doBacklog !== undefined) contar.current?.(doBacklog)
    } catch {
      if (minha === leitura.current) setFalhou(true)
    }
  }, [projectPublicId, chaveDasSecoes, sprints, buscaAplicada, meus])

  // biome-ignore lint/correctness/useExhaustiveDependencies: a versao e o gatilho da releitura
  useEffect(() => {
    void ler()
  }, [ler, versao])

  // ─── Recolher ──────────────────────────────────────────────────────────────
  const [recolhidas, setRecolhidas] = useState(() => lerRecolhidas(projectPublicId))
  const [projetoDasRecolhidas, setProjetoDasRecolhidas] = useState(projectPublicId)
  if (projetoDasRecolhidas !== projectPublicId) {
    setProjetoDasRecolhidas(projectPublicId)
    setRecolhidas(lerRecolhidas(projectPublicId))
  }
  function alternarRecolhida(secao: string) {
    const novas = new Set(recolhidas)
    if (novas.has(secao)) novas.delete(secao)
    else novas.add(secao)
    setRecolhidas(novas)
    try {
      window.localStorage.setItem(chaveDasRecolhidas(projectPublicId), JSON.stringify([...novas]))
    } catch {
      // Sem onde guardar, a lista fica recolhida ate sair da tela.
    }
  }

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

  /** Os gatilhos do menu de cada card e os titulos das listas: para onde o foco vai depois. */
  const gatilhos = useRef(new Map<string, HTMLButtonElement>())
  const titulos = useRef(new Map<string, HTMLHeadingElement>())

  // Depois de o menu fechar: ele devolve o foco ao proprio gatilho, que mudou de lista.
  function focarDepois(card: string | undefined, secao: string) {
    setTimeout(() => {
      const alvo = (card && gatilhos.current.get(card)) || titulos.current.get(secao)
      alvo?.focus()
    }, 30)
  }

  /**
   * Move pelo menu: para o topo ou o fim de uma lista. Para outra lista, o aviso diz
   * para onde foi e oferece desfazer, e o foco fica na linha seguinte da lista em que a
   * pessoa estava — e nao no comeco da pagina.
   */
  function moverPara(id: string, secao: string, topo: boolean) {
    const de = secaoDe(id)
    const atual = listasRef.current
    if (!atual || !de) return
    const daqui = atual[de] ?? []
    const indice = daqui.indexOf(id)
    const acima = indice > 0 ? (daqui[indice - 1] ?? null) : null
    setListas((antes) => {
      if (!antes) return antes
      const semEle = { ...antes, [de]: (antes[de] ?? []).filter((item) => item !== id) }
      const destino = semEle[secao] ?? []
      semEle[secao] = topo ? [id, ...destino] : [...destino, id]
      return semEle
    })
    void gravar(id, secao, null, topo)
    if (secao === de) return

    focarDepois(daqui[indice + 1] ?? daqui[indice - 1], de)
    toast.done(`${numeroDe(id)} foi para ${comArtigo(secao)}.`, {
      action: { label: 'Desfazer', run: () => devolver(id, de, acima) },
    })
  }

  /** Desfaz o movimento do menu: o card volta para a lista e o lugar de onde saiu. */
  function devolver(id: string, secao: string, acima: string | null) {
    setListas((antes) => {
      if (!antes) return antes
      const de = secaoDe(id, antes)
      const semEle = de
        ? { ...antes, [de]: (antes[de] ?? []).filter((item) => item !== id) }
        : { ...antes }
      const destino = semEle[secao] ?? []
      const lugar = acima === null ? 0 : destino.indexOf(acima) + 1
      semEle[secao] = [...destino.slice(0, lugar), id, ...destino.slice(lugar)]
      return semEle
    })
    void gravar(id, secao, acima, acima === null)
  }

  const secoesRef = useRef(secoes)
  secoesRef.current = secoes
  const [ativo, setAtivo] = useState<string | null>(null)
  // As setas do teclado andam pelo que esta na tela: a lista recolhida so tem o card que
  // esta sendo arrastado, quando ele passa por ela.
  const visiveisRef = useRef<Listas | null>(null)
  visiveisRef.current = listas
    ? Object.fromEntries(
        Object.entries(listas).map(([secao, ids]) => [
          secao,
          recolhidas.has(secao) ? ids.filter((id) => id === ativo) : ids,
        ]),
      )
    : null
  const teclado = useMemo(() => backlogKeyboardCoordinates(secoesRef, visiveisRef), [])
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE),
    useSensor(TouchSensor, TOQUE),
    useSensor(KeyboardSensor, { coordinateGetter: teclado }),
  )
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
      ? 'backlog'
      : (sprints?.find((sprint) => sprint.PublicId === secao)?.Name ?? 'sprint')
  /** "o backlog", "a Sprint 2": para onde o card foi. */
  const comArtigo = (secao: string) => (secao === BACKLOG ? 'o backlog' : `a ${nomeDaSecao(secao)}`)
  /** "no backlog", "na Sprint 2": onde o card esta. */
  const naSecao = (secao: string) => (secao === BACKLOG ? 'no backlog' : `na ${nomeDaSecao(secao)}`)
  const numeroDe = (id: string) => (cards[id] ? `#${cards[id].Number}` : 'O card')
  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Pegou ${numeroDe(String(active.id))}.`,
    onDragOver: ({ active, over }) => {
      if (!over) return undefined
      const secao = secaoDe(String(over.id)) ?? BACKLOG
      const lista = listasRef.current?.[secao] ?? []
      const posicao = lista.indexOf(String(over.id))
      return posicao >= 0
        ? `${numeroDe(String(active.id))} ${naSecao(secao)}, posição ${posicao + 1} de ${lista.length}.`
        : `${numeroDe(String(active.id))} ${naSecao(secao)}.`
    },
    onDragEnd: ({ active, over }) =>
      over
        ? `${numeroDe(String(active.id))} solto ${naSecao(secaoDe(String(active.id)) ?? BACKLOG)}.`
        : `${numeroDe(String(active.id))} voltou ao lugar.`,
    onDragCancel: ({ active }) => `${numeroDe(String(active.id))} voltou ao lugar.`,
  }

  // ─── Estimar ───────────────────────────────────────────────────────────────
  async function estimar(id: string, pontos: number | null): Promise<boolean> {
    try {
      const aberto = await projectReportService.setPoints(projectPublicId, id, { Points: pontos })
      setCards((atual) => ({ ...atual, [id]: { ...atual[id], ...aberto } }))
      aoMudou()
      return true
    } catch (falha) {
      toast.error(describeError(falha))
      return false
    }
  }

  // ─── As sprints ────────────────────────────────────────────────────────────
  const [dialogo, setDialogo] = useState<
    | { tipo: 'start' | 'edit'; sprint: SprintViewModel }
    | { tipo: 'close'; sprint: SprintViewModel }
    | { tipo: 'delete'; sprint: SprintViewModel }
    | null
  >(null)
  const [criando, setCriando] = useState(false)
  const emAndamento = (sprints ?? []).find((sprint) => sprint.State === 'Active') ?? null

  async function criarSprint() {
    setCriando(true)
    try {
      const nova = await sprintService.createSprint(projectPublicId, { Today: todayIso() })
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
        {barra && <div className="mb-1 flex flex-wrap items-center gap-2">{barra}</div>}
        <Skeleton className="h-24 w-full max-w-7xl" />
        <Skeleton className="h-40 w-full max-w-7xl" />
      </div>
    )
  }

  if (falhou && listas === null) {
    return (
      <>
        {barra && <div className="mb-4 flex flex-wrap items-center gap-2">{barra}</div>}
        <div className="max-w-170 rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
            Não deu para carregar o backlog agora. Nada se perdeu: a falha foi ao consultar.
          </p>
          <Button onClick={() => void ler()}>Tentar de novo</Button>
        </div>
      </>
    )
  }

  const destinosDoMenu = (secaoAtual: string) =>
    secoes
      .filter((secao) => secao !== secaoAtual)
      .map((secao) => ({ secao, nome: secao === BACKLOG ? 'o backlog' : nomeDaSecao(secao) }))
  const primeiroUso = sprints.length === 0

  return (
    // A barra (abas, busca e Arquivados) tem a largura toda, como na lista e no quadro: com o
    // teto nela, o Arquivados pulava de lugar ao trocar de aba. O teto fica so nas linhas,
    // embaixo (ver as secoes).
    <div>
      <BuscaDoBacklog
        id={searchInputId}
        barra={barra}
        busca={busca}
        aoBuscar={setBusca}
        meus={meus}
        aoAlternarMeus={() => setMeus((valor) => !valor)}
        aoLimpar={() => {
          setBusca('')
          setBuscaAplicada('')
          setMeus(false)
        }}
      />

      {/* O primeiro uso: o backlog vazio de sprints ensina o caminho, em vez de so constatar. */}
      {primeiroUso && (
        <div className="mb-5 max-w-170 rounded-xl border border-border border-dashed bg-surface-raised p-5">
          <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
            Comece criando uma sprint, leve para ela os cards desta semana (arrastando ou pelo menu
            ⋯ de cada card) e clique em Iniciar sprint.
          </p>
          <Button variant="primary" disabled={criando} onClick={() => void criarSprint()}>
            {criando ? 'Criando…' : 'Criar sprint'}
          </Button>
        </div>
      )}

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
        {/* Com teto na tela grande: a 1920 px o titulo ficava a mais de mil pixels dos pontos
            e de quem esta com o card, e o olho perdia a linha no caminho. */}
        <div className="flex max-w-7xl flex-col gap-5">
          {secoes.map((secao) => {
            const sprint = sprints.find((item) => item.PublicId === secao) ?? null
            const ids = listas?.[secao] ?? []
            const recolhida = recolhidas.has(secao)
            return (
              <Secao
                key={secao}
                secao={secao}
                sprint={sprint}
                emAndamento={emAndamento}
                total={totais[secao] ?? ids.length}
                lidos={lidos[secao] ?? ids.length}
                cartoes={(recolhida ? ids.filter((id) => id === ativo) : ids)
                  .map((id) => cards[id])
                  .filter((card) => card !== undefined)}
                colunas={colunas}
                soonDays={soonDays}
                buscando={buscando}
                recolhida={recolhida}
                aoRecolher={() => alternarRecolhida(secao)}
                comCriarSprint={!primeiroUso}
                criandoSprint={criando}
                aoCriarSprint={() => void criarSprint()}
                aoIniciar={(alvo) => setDialogo({ tipo: 'start', sprint: alvo })}
                aoEditar={(alvo) => setDialogo({ tipo: 'edit', sprint: alvo })}
                aoConcluir={(alvo) => setDialogo({ tipo: 'close', sprint: alvo })}
                aoApagar={(alvo) => setDialogo({ tipo: 'delete', sprint: alvo })}
                destinos={destinosDoMenu(secao)}
                aoMover={moverPara}
                aoEstimar={estimar}
                ativo={ativo}
                gatilhos={gatilhos.current}
                titulos={titulos.current}
              />
            )
          })}
        </div>

        <DragOverlay>
          {ativo && cards[ativo] ? (
            <div className="rounded-lg border border-border bg-surface shadow-lg ring-2 ring-accent">
              <Linha card={cards[ativo]} colunas={colunas} soonDays={soonDays} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {(dialogo?.tipo === 'start' || dialogo?.tipo === 'edit') && (
        <SprintDialog
          projectPublicId={projectPublicId}
          sprint={dialogo.sprint}
          mode={dialogo.tipo}
          semanas={sprintWeeks}
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
          aoIniciar={(proxima) => setDialogo({ tipo: 'start', sprint: proxima })}
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
            ? dialogo.sprint.Cards === 0
              ? 'A sprint está vazia e é apagada. Nada mais muda.'
              : dialogo.sprint.Cards === 1
                ? 'A sprint é apagada, e o card dela volta para o fim do backlog. Nada mais muda.'
                : `A sprint é apagada, e os ${dialogo.sprint.Cards} cards dela voltam para o fim do backlog. Nada mais muda.`
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
    </div>
  )
}

/**
 * A busca do backlog: o titulo, o texto ou o #numero, e "Meus cards". **Esconde o que nao
 * bate e nao muda a ordem** — a ordem e o plano do time.
 */
function BuscaDoBacklog({
  id,
  barra,
  busca,
  aoBuscar,
  meus,
  aoAlternarMeus,
  aoLimpar,
}: {
  /** O id do campo, para o "/" da tela. */
  id?: string
  /** O fim da linha: o "Como funciona" e os arquivados. */
  barra?: ReactNode
  busca: string
  aoBuscar: (texto: string) => void
  meus: boolean
  aoAlternarMeus: () => void
  aoLimpar: () => void
}) {
  const celular = useMediaQuery('(max-width: 39.99rem)')
  return (
    // O mesmo respiro da barra da lista e do quadro (`mt-3`): sem ele a busca encostava na
    // linha das abas.
    <search className="mt-3 mb-4 flex flex-wrap items-center gap-2" aria-label="Buscar no backlog">
      <label className="relative flex min-w-0 flex-[1_1_14rem] max-sm:flex-[1_1_8rem] sm:max-w-80">
        <span className="sr-only">Buscar no backlog</span>
        <svg
          viewBox="0 0 16 16"
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-fg-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" />
        </svg>
        <input
          id={id}
          type="search"
          value={busca}
          onChange={(evento) => aoBuscar(evento.target.value)}
          // No celular o campo divide a linha com "Meus cards" e os arquivados, como nas
          // outras abas: a frase inteira nao caberia.
          placeholder={celular ? 'Buscar' : 'Buscar no backlog: título ou #número'}
          title={id ? 'Busca no título, no texto e no #número (atalho: /)' : undefined}
          aria-keyshortcuts={id ? '/' : undefined}
          maxLength={200}
          className="peer h-8 w-full rounded-lg border border-border bg-surface-raised pr-9 pl-8 text-detail text-fg placeholder:text-fg-placeholder pointer-coarse:h-9"
        />
        <SearchShortcutHint visible={!!id && busca === ''} />
      </label>
      <button
        type="button"
        aria-pressed={meus}
        onClick={aoAlternarMeus}
        className={cn(
          'alvo-de-toque relative flex h-8 flex-none items-center gap-1.5 rounded-lg border px-3 text-detail transition-colors pointer-coarse:h-9',
          meus
            ? ACTIVE_FILTER_CLASS
            : 'border-border bg-surface text-fg-muted hover:bg-surface-sunken hover:text-fg',
        )}
      >
        Meus cards
      </button>
      {(busca.trim() !== '' || meus) && (
        <button
          type="button"
          onClick={aoLimpar}
          className="alvo-de-toque relative h-8 flex-none px-1 text-detail text-fg-muted underline-offset-2 hover:text-fg hover:underline pointer-coarse:h-9"
        >
          Limpar busca
        </button>
      )}
      {barra}
    </search>
  )
}

/** Uma lista: o cabecalho da sprint (ou do backlog) e os cards dela. */
function Secao({
  secao,
  sprint,
  emAndamento,
  total,
  lidos,
  cartoes,
  colunas,
  soonDays,
  buscando,
  recolhida,
  aoRecolher,
  comCriarSprint,
  criandoSprint,
  aoCriarSprint,
  aoIniciar,
  aoEditar,
  aoConcluir,
  aoApagar,
  destinos,
  aoMover,
  aoEstimar,
  ativo,
  gatilhos,
  titulos,
}: {
  secao: string
  sprint: SprintViewModel | null
  emAndamento: SprintViewModel | null
  total: number
  /** Quantos a leitura trouxe: mais que isso no total, e os outros estao na Lista. */
  lidos: number
  cartoes: ReportSummaryViewModel[]
  colunas: ReportStateCountViewModel[] | null
  soonDays: number
  buscando: boolean
  recolhida: boolean
  aoRecolher: () => void
  /** No primeiro uso, o "Criar sprint" fica no quadro que ensina o caminho, e nao aqui. */
  comCriarSprint: boolean
  criandoSprint: boolean
  aoCriarSprint: () => void
  aoIniciar: (sprint: SprintViewModel) => void
  aoEditar: (sprint: SprintViewModel) => void
  aoConcluir: (sprint: SprintViewModel) => void
  aoApagar: (sprint: SprintViewModel) => void
  destinos: { secao: string; nome: string }[]
  aoMover: (id: string, secao: string, topo: boolean) => void
  aoEstimar: (id: string, pontos: number | null) => Promise<boolean>
  ativo: string | null
  gatilhos: Map<string, HTMLButtonElement>
  titulos: Map<string, HTMLHeadingElement>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: secao })
  const { visiveis, fechando, caixa, medida } = useRecolherSuave(recolhida, cartoes)
  const tituloId = `secao-${secao}`
  const listaId = `lista-${secao}`
  const nome = sprint ? sprint.Name : 'Backlog'
  const pontos = sprint
    ? sprint.Points
    : cartoes.reduce((soma, card) => soma + (card.StoryPoints ?? 0), 0)

  return (
    <section
      aria-labelledby={tituloId}
      // A mesma borda leve em todas as secoes. A sprint em andamento tinha a borda na cor
      // do destaque (quase preta), que parecia selecao, e nao estado: o "em andamento" ja vem
      // escrito no cabecalho.
      className="rounded-xl border border-border bg-surface-raised"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-border border-b px-2 py-2 sm:px-3">
        <div className="flex min-w-0 items-start gap-1">
          <button
            type="button"
            aria-expanded={!recolhida}
            aria-controls={listaId}
            aria-label={recolhida ? `Expandir ${nome}` : `Recolher ${nome}`}
            onClick={aoRecolher}
            className="alvo-de-toque-icone relative flex size-8 flex-none items-center justify-center rounded-lg text-fg-muted hover:bg-surface-sunken hover:text-fg"
          >
            <svg
              viewBox="0 0 12 12"
              className={cn(
                'size-3 transition-transform duration-320 ease-in-out motion-reduce:transition-none',
                recolhida && '-rotate-90',
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m3 4.5 3 3 3-3" />
            </svg>
          </button>
          <div className="min-w-0 py-1">
            <h3
              id={tituloId}
              tabIndex={-1}
              ref={(no) => {
                if (no) titulos.set(secao, no)
                else titulos.delete(secao)
              }}
              className="flex flex-wrap items-baseline gap-x-2 font-semibold text-body text-fg outline-none"
            >
              {nome}
              {sprint && (
                <span className="font-normal text-detail text-fg-muted">
                  {' '}
                  {sprintDates(sprint)}
                  {sprint.State === 'Active' ? ', em andamento' : ', planejada'}
                </span>
              )}
            </h3>
            {sprint?.Goal && <p className="mt-0.5 text-caption text-fg-muted">{sprint.Goal}</p>}
          </div>
        </div>
        <div className="flex flex-none flex-wrap items-center justify-end gap-2">
          <span className="text-caption text-fg-muted tabular-nums">
            {buscando
              ? `${total} na busca`
              : `${total} ${total === 1 ? 'card' : 'cards'}, ${pointsText(pontos)}`}
          </span>
          {sprint === null ? (
            comCriarSprint && (
              <Button size="sm" disabled={criandoSprint} onClick={aoCriarSprint}>
                {criandoSprint ? 'Criando…' : 'Criar sprint'}
              </Button>
            )
          ) : sprint.State === 'Active' ? (
            <Button size="sm" onClick={() => aoConcluir(sprint)}>
              Concluir sprint
            </Button>
          ) : // O porque escrito, e nao numa dica: a dica nao abre no toque nem no teclado.
          emAndamento ? (
            <span className="text-caption text-fg-muted">
              Dá para iniciar quando a {emAndamento.Name} for concluída
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
                  className="alvo-de-toque-icone relative flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-sunken hover:text-fg"
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

      {/* A caixa que abre e fecha devagar (ver `useRecolherSuave`). */}
      <div ref={caixa} className="relative">
        {/* Enquanto fecha, a frase da lista recolhida invisivel, so para medir a altura em que
            o fechar termina: assim a caixa para na altura da frase, sem pulo no fim. */}
        {fechando && (
          <p
            ref={medida}
            aria-hidden
            className="pointer-events-none invisible absolute inset-x-0 top-0 min-h-12 px-4 py-3 text-detail"
          >
            Lista recolhida: {total} {total === 1 ? 'card' : 'cards'}. Um card arrastado até aqui
            vai para o fim dela.
          </p>
        )}
        <SortableContext
          id={secao}
          items={visiveis.map((card) => card.PublicId)}
          strategy={verticalListSortingStrategy}
        >
          {/* Recolhida, a lista continua aceitando o card arrastado: ele vai para o fim dela. */}
          <ul
            id={listaId}
            ref={setNodeRef}
            aria-label={sprint ? `Cards de ${sprint.Name}` : 'Cards do backlog'}
            className={cn('min-h-12 divide-y divide-border', isOver && 'bg-surface-sunken')}
          >
            {recolhida && !fechando ? (
              cartoes.length === 0 && (
                <li className="animate-fade-in px-4 py-3 text-detail text-fg-muted">
                  Lista recolhida: {total} {total === 1 ? 'card' : 'cards'}. Um card arrastado até
                  aqui vai para o fim dela.
                </li>
              )
            ) : visiveis.length === 0 ? (
              <li className="px-4 py-3 text-detail text-fg-muted">
                {buscando
                  ? 'Nenhum card desta lista na busca.'
                  : sprint
                    ? 'Nenhum card nesta sprint. Arraste do backlog, ou use o menu ⋯ de um card.'
                    : 'Nada no backlog. Os cards novos entram aqui.'}
              </li>
            ) : null}
            {visiveis.map((card) => (
              <ItemArrastavel
                key={card.PublicId}
                card={card}
                colunas={colunas}
                soonDays={soonDays}
                destinos={destinos}
                aoMover={(destino, topo) => aoMover(card.PublicId, destino, topo)}
                aoEstimar={(pontos) => aoEstimar(card.PublicId, pontos)}
                escondido={ativo === card.PublicId}
                secao={secao}
                gatilhos={gatilhos}
              />
            ))}
          </ul>
        </SortableContext>
      </div>
      {/* Contra o que a leitura trouxe, e nao contra a lista de agora: no meio de um
          arraste, ela tem um card a menos, e o rodape mentia. */}
      {!recolhida && ativo === null && total > lidos && (
        <p className="px-4 py-2 text-caption text-fg-muted">
          Mostrando os {lidos} primeiros de {total}. Os outros estão na Lista.
        </p>
      )}
    </section>
  )
}

/**
 * Abrir e fechar a lista leva o mesmo tempo da seta girando, numa curva que acelera e freia
 * devagar: a que freia forte cumpria quase todo o caminho nos primeiros 80ms e parecia rapida.
 */
const RECOLHER_MS = 320
const RECOLHER_CURVA = 'cubic-bezier(0.4, 0, 0.2, 1)'

/**
 * **A lista abre e fecha devagar**: a altura anda da lista inteira ate a faixa da lista
 * recolhida (e de volta), e os cards esmaecem no caminho. Antes os cards sumiam e voltavam
 * de uma vez, e a secao pulava.
 *
 * Ao fechar, os cards de antes continuam na tela ate o fim do movimento (`fechando`), e so
 * entao a lista recolhida aparece; ao abrir, a lista nova cresce da faixa ate a altura dela.
 * Sem movimento (preferencia do sistema, ou o ambiente de teste, que nao tem `matchMedia`),
 * a troca e na hora.
 */
function useRecolherSuave(recolhida: boolean, cartoes: ReportSummaryViewModel[]) {
  const caixa = useRef<HTMLDivElement>(null)
  const medida = useRef<HTMLParagraphElement>(null)
  const [fechando, setFechando] = useState<ReportSummaryViewModel[] | null>(null)
  const abertos = useRef(cartoes)
  const antes = useRef(recolhida)
  // A altura da lista recolhida, de onde o abrir parte: a frase quebra em duas linhas no
  // celular, e partir de uma altura fixa dava um pulo no comeco.
  const alturaRecolhida = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (!recolhida) abertos.current = cartoes
    else if (fechando === null && caixa.current)
      alturaRecolhida.current = caixa.current.offsetHeight
  })

  useLayoutEffect(() => {
    if (antes.current === recolhida) return
    antes.current = recolhida
    const elemento = caixa.current
    const comMovimento =
      typeof window.matchMedia === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!elemento || !comMovimento || typeof elemento.animate !== 'function') return
    if (recolhida) {
      // Antes de pintar: a lista recolhida nunca aparece pela metade.
      setFechando(abertos.current)
      return
    }
    // Abrir no meio do fechar desiste do fechar, e a lista cresce dali.
    setFechando(null)
    const altura = elemento.offsetHeight
    const inicio = alturaRecolhida.current ?? 48
    elemento.style.overflow = 'hidden'
    const movimento = elemento.animate(
      [
        { height: `${inicio}px`, opacity: 0.4 },
        { height: `${altura}px`, opacity: 1 },
      ],
      { duration: RECOLHER_MS, easing: RECOLHER_CURVA },
    )
    movimento.onfinish = () => {
      elemento.style.overflow = ''
    }
    return () => movimento.cancel()
  }, [recolhida])

  useLayoutEffect(() => {
    const elemento = caixa.current
    if (!fechando || !elemento) return
    const altura = elemento.offsetHeight
    // Para na altura da frase da lista recolhida (medida invisivel), e os cards somem de vez
    // no caminho: a frase entra esmaecendo no lugar, sem pulo de altura nem troca seca.
    const alvo = Math.max(medida.current?.offsetHeight ?? 48, 48)
    elemento.style.overflow = 'hidden'
    // `forwards` segura o fim (a altura da frase, os cards invisiveis) ate a troca: sem ele,
    // no quadro entre o fim do movimento e o React trocar os cards pela frase, a caixa
    // voltava a altura cheia com os cards a vista, e a lista inteira piscava.
    const movimento = elemento.animate(
      [
        { height: `${altura}px`, opacity: 1 },
        { height: `${alvo}px`, opacity: 0 },
      ],
      { duration: RECOLHER_MS, easing: RECOLHER_CURVA, fill: 'forwards' },
    )
    movimento.onfinish = () => setFechando(null)
    // Solto so depois da troca, no mesmo passo do React, antes de a tela ser pintada.
    return () => {
      movimento.cancel()
      elemento.style.overflow = ''
    }
  }, [fechando])

  return { visiveis: fechando ?? cartoes, fechando: fechando !== null, caixa, medida }
}

function ItemArrastavel({
  card,
  colunas,
  soonDays,
  destinos,
  aoMover,
  aoEstimar,
  escondido,
  secao,
  gatilhos,
}: {
  card: ReportSummaryViewModel
  colunas: ReportStateCountViewModel[] | null
  soonDays: number
  destinos: { secao: string; nome: string }[]
  aoMover: (secao: string, topo: boolean) => void
  aoEstimar: (pontos: number | null) => Promise<boolean>
  escondido: boolean
  secao: string
  gatilhos: Map<string, HTMLButtonElement>
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: card.PublicId,
  })
  // O alvo de toque e maior que o desenho: 24 px no mouse, 40 px no dedo.
  const alvo =
    // 24 de desenho tambem no toque, com o alvo invisivel em volta: com 40 de desenho, o "⋯"
    // esticava a linha do titulo e abria um vao ate a linha de baixo.
    'alvo-de-toque-icone relative flex size-6 flex-none items-center justify-center rounded text-fg-muted hover:bg-surface-sunken hover:text-fg'
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(escondido && 'opacity-40')}
    >
      <Linha
        card={card}
        colunas={colunas}
        soonDays={soonDays}
        alca={
          <button
            type="button"
            aria-label={`Mover #${card.Number}`}
            className={cn(alvo, 'cursor-grab touch-none')}
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
        pontos={<PontosNaLinha card={card} aoGravar={aoEstimar} />}
        menu={
          <DropdownMenu
            trigger={
              <button
                type="button"
                ref={(no) => {
                  if (no) gatilhos.set(card.PublicId, no)
                  else gatilhos.delete(card.PublicId)
                }}
                aria-label={`Mover #${card.Number} para…`}
                className={alvo}
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
                Para o topo desta lista
              </DropdownItem>
              <DropdownItem quiet onSelect={() => aoMover(secao, false)}>
                Para o fim desta lista
              </DropdownItem>
            </DropdownGroup>
          </DropdownMenu>
        }
      />
    </li>
  )
}

/**
 * A linha de um card no backlog: tipo, numero, titulo, prioridade, prazo perto ou
 * vencido, subtarefas, coluna, pontos e responsavel.
 *
 * A linha mede a propria largura (`@container`), e nao a da janela: larga, tudo numa
 * linha so; estreita (celular, tablet, notebook com o menu aberto), o titulo fica com a
 * primeira linha inteira e o resto desce para a de baixo. Numa linha so, no celular, o
 * titulo ficava com tres letras, e o prazo e a coluna tinham de sair.
 */
function Linha({
  card,
  colunas,
  soonDays,
  alca,
  pontos,
  menu,
}: {
  card: ReportSummaryViewModel
  colunas: ReportStateCountViewModel[] | null
  soonDays: number
  alca?: React.ReactNode
  /** Os pontos que se estimam na linha; sem eles, o selo so mostra. */
  pontos?: React.ReactNode
  menu?: React.ReactNode
}) {
  const titulo = cardHeadline(card)
  // O prazo so quando pede atencao: o que ainda tem tempo nao ajuda a planejar.
  const prazo =
    card.DueDate && !card.Finished && dueState(card.DueDate, soonDays) !== 'later'
      ? card.DueDate
      : null
  return (
    <div className="@container">
      {/* Na linha estreita (o celular) a alca sai: arrastar numa lista longa com o dedo era
          desconfortavel, e a faixa dela empurrava o conteudo; mover fica no menu "⋯", que
          ja diz "Mover para". O menu tem a folga do proprio alvo de toque, e a margem da
          direita cai para o titulo ganhar largura. */}
      <div className="flex min-w-0 items-center gap-1 py-2 pr-1 pl-3 @min-[30rem]:gap-2 @min-[30rem]:px-3">
        {alca && <span className="flex flex-none @max-[30rem]:hidden">{alca}</span>}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 @min-[56rem]:flex-nowrap">
          <CardTypeIcon card={card} />
          <span className="flex-none tabular-nums text-caption text-fg-muted">#{card.Number}</span>
          <Link
            to={card.PublicId}
            className={cn(
              'line-clamp-2 min-w-0 flex-1 break-words text-detail underline-offset-2 hover:underline @min-[56rem]:line-clamp-1',
              card.Finished ? 'text-fg-muted line-through' : 'text-fg',
            )}
          >
            {headlineText(titulo)}
          </Link>
          {/* O resto da linha. Na estreita ele desce inteiro para a linha de baixo, que fica
              com a largura toda; na larga a caixa se desfaz (`contents`) e cada item volta
              para a linha do titulo. Entre o titulo e o resto ficam 8 de respiro: o vao da
              linha mais o `mt-1`. */}
          <span className="order-3 mt-1 flex basis-full flex-wrap items-center gap-x-2 gap-y-1 @min-[56rem]:contents">
            {/* A busca e o "Meus cards" tambem acham o pai pela subtarefa: a marca diz isso. */}
            <SubtaskMatchMark card={card} className="max-w-40 flex-none" />
            {card.Priority && (
              <span className="flex min-w-0 max-w-28 flex-none text-caption text-fg-muted">
                <PriorityIcon priority={card.Priority} />
              </span>
            )}
            {prazo && (
              <DueChip
                day={prazo}
                soonDays={soonDays}
                compact
                className="max-w-full text-caption"
              />
            )}
            {card.SubtaskCount > 0 && (
              <span className="flex-none text-caption text-fg-muted">
                {card.SubtasksDone}/{card.SubtaskCount}
              </span>
            )}
            {card.StateName && (
              <StatusLozenge
                name={card.StateName}
                tone={statusTone(card.StatePublicId, colunas)}
                className="max-w-28 flex-none"
              />
            )}
            {pontos ?? <PointsChip points={card.StoryPoints} />}
            {card.Assignee && <PersonAvatar pessoa={card.Assignee} />}
          </span>
          {/* O menu vem por ultimo no documento, como no fim da linha larga: o Tab passa
              pelos pontos antes dele. Na linha estreita ele sobe (`order-2`) para o alto,
              ao lado do titulo, e a linha de baixo continua com a largura toda. */}
          {menu && <span className="order-2 flex flex-none @min-[56rem]:order-last">{menu}</span>}
        </div>
      </div>
    </div>
  )
}

/** O texto do campo virado em pontos: nulo e "sem estimativa"; indefinido, invalido. */
function lerPontos(texto: string): number | null | undefined {
  const limpo = texto.trim().replace(',', '.')
  if (limpo === '' || limpo === '—') return null
  const numero = Number(limpo)
  return Number.isFinite(numero) &&
    numero >= 0 &&
    numero <= MAX_STORY_POINTS &&
    numero * 2 === Math.trunc(numero * 2)
    ? numero
    : undefined
}

/**
 * Os pontos na propria linha: o selo — "—" sem estimativa — e um botao; clicar ou Enter
 * abre o campo no lugar, Enter grava e Esc desiste. **O valor invalido mostra a regra ali
 * mesmo**, e o campo fica aberto para corrigir. Sair do campo grava o que vale e
 * desiste do que nao vale.
 */
function PontosNaLinha({
  card,
  aoGravar,
}: {
  card: ReportSummaryViewModel
  aoGravar: (pontos: number | null) => Promise<boolean>
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [invalido, setInvalido] = useState(false)
  const [gravando, setGravando] = useState(false)
  const botao = useRef<HTMLButtonElement>(null)
  /** Enter ou Esc ja resolveram: o blur de quando o campo sai nao conta. */
  const resolvido = useRef(false)
  const idRegra = useId()

  function abrir() {
    resolvido.current = false
    setTexto(card.StoryPoints === null ? '' : String(card.StoryPoints).replace('.', ','))
    setInvalido(false)
    setEditando(true)
  }

  function fechar(focar: boolean) {
    resolvido.current = true
    setEditando(false)
    setInvalido(false)
    if (focar) requestAnimationFrame(() => botao.current?.focus())
  }

  async function confirmar(focar: boolean) {
    const valor = lerPontos(texto)
    if (valor === undefined) {
      if (focar) setInvalido(true)
      else fechar(false)
      return
    }
    if (valor === card.StoryPoints) {
      fechar(focar)
      return
    }
    resolvido.current = true
    setGravando(true)
    await aoGravar(valor)
    setGravando(false)
    fechar(focar)
  }

  if (editando) {
    return (
      <span className="flex flex-none items-center gap-1.5">
        <input
          // biome-ignore lint/a11y/noAutofocus: o campo nasce de um clique em "estimar"
          autoFocus
          type="text"
          inputMode="decimal"
          aria-label={`Pontos de #${card.Number}`}
          aria-invalid={invalido || undefined}
          aria-describedby={invalido ? idRegra : undefined}
          value={texto}
          disabled={gravando}
          onChange={(evento) => {
            setTexto(evento.target.value)
            setInvalido(false)
          }}
          onBlur={() => {
            if (!resolvido.current) void confirmar(false)
          }}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              evento.preventDefault()
              void confirmar(true)
            } else if (evento.key === 'Escape') {
              evento.preventDefault()
              evento.stopPropagation()
              fechar(true)
            }
          }}
          className="h-7 w-16 rounded-md border border-border bg-surface px-2 text-caption text-fg tabular-nums pointer-coarse:h-10"
        />
        {invalido && (
          <span
            id={idRegra}
            role="alert"
            className="max-w-36 text-caption text-error-fg leading-tight"
          >
            De 0 a {MAX_STORY_POINTS}, de meio em meio ponto.
          </span>
        )}
      </span>
    )
  }

  return (
    <button
      ref={botao}
      type="button"
      onClick={abrir}
      title={card.StoryPoints === null ? 'Estimar' : 'Mudar a estimativa'}
      className="group alvo-de-toque-icone relative flex h-6 min-w-6 flex-none items-center justify-center"
    >
      {/* O desenho tem 24 sempre; no toque so o alvo invisivel em volta cresce (sem esticar
          a linha). Com 40 de desenho, o circulo cinza pesava mais que o titulo e parecia um
          botao de ajuda. */}
      <span
        aria-hidden
        className="flex h-6 min-w-6 items-center justify-center whitespace-nowrap rounded-full bg-surface-sunken px-1.5 font-medium text-caption text-fg tabular-nums group-hover:ring-1 group-hover:ring-border"
      >
        {card.StoryPoints === null ? '?' : pointsShort(card.StoryPoints)}
      </span>
      <span className="sr-only">
        {card.StoryPoints === null
          ? `Estimar #${card.Number}: sem estimativa`
          : `Estimativa de #${card.Number}: ${pointsText(card.StoryPoints)}. Mudar`}
      </span>
    </button>
  )
}
