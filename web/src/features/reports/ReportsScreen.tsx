import {
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import {
  type ReportDetailViewModel,
  type ReportStateCountViewModel,
  type ReportSummaryViewModel,
  type SprintViewModel,
  WITHOUT_STATE_FILTER,
} from '@/contracts'
import {
  describeError,
  projectCycleSettingsService,
  projectPriorityService,
  projectReportService,
  projectTeamService,
} from '@/data'
import { BulkActions, BulkFailures, type Falha, useBulkUndo } from '@/features/reports/BulkActions'
import { boardColumns, type LaneBy } from '@/features/reports/board/boardState'
import { BoardSkeleton, ReportsBoard } from '@/features/reports/board/ReportsBoard'
import { useBoard } from '@/features/reports/board/useBoard'
import {
  describeRemoteChange,
  LiveAnnouncer,
  LiveBadge,
  type RemoteChange,
  useAnnouncer,
} from '@/features/reports/LiveStatus'
import { NewCardDialog } from '@/features/reports/NewCardDialog'
import { ReportsTable, ReportsTableSkeleton } from '@/features/reports/ReportsTable'
import { SprintBacklog } from '@/features/reports/sprints/SprintBacklog'
import {
  CloseSprintDialog,
  NoActiveSprint,
  SprintBar,
  SprintDialog,
  SprintsFailed,
  useSprints,
  useSprintsForFilter,
} from '@/features/reports/sprints/sprintLook'
import { useReportInbox } from '@/features/reports/useReportInbox'
import { useWorkFilters } from '@/features/reports/useWorkFilters'
import { useWorkRealtime } from '@/features/reports/useWorkRealtime'
import { WorkFilterBar } from '@/features/reports/WorkFilterBar'
import { Button } from '@/shared/components/Button'
import { Select } from '@/shared/components/Select'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'
import { canConfigure } from '@/shared/lib/projectAccess'

/** As vistas da tela de Trabalho. O backlog so com a sprint ligada. */
type Vista = 'lista' | 'quadro' | 'backlog'
const VISTAS: readonly Vista[] = ['lista', 'quadro', 'backlog']
const AGRUPAMENTOS: readonly LaneBy[] = ['none', 'assignee', 'priority']
const DICA_DO_QUADRO = ['mostrar', 'fechada'] as const

/**
 * Faltando ate quantos dias o prazo fica em destaque enquanto a regra do projeto
 * nao chega — o padrao de fabrica do Ciclo.
 */
const DESTAQUE_DE_FABRICA = 2

/**
 * O trabalho do time: o que chegou do site do cliente e os cards que o proprio time
 * criou, juntos. Cada card tem o seu numero (#42); o relato tem tambem o protocolo
 * de quem relatou.
 *
 * **Uma tela, duas vistas, em abas**: a lista, uma tabela do mais recente para o
 * mais antigo — ou na ordem que a pessoa escolheu nos cabecalhos —, e o quadro, uma
 * coluna por estado na ordem que o time arrumou. A ultima escolhida fica guardada
 * neste navegador, por projeto. O card abre no mesmo dialogo nas duas, e so ao
 * clicar — a linha e a frente do quadro sao um resumo.
 *
 * **Abaixo das abas, a barra de filtros**: a busca, os atalhos e os menus, que valem
 * na lista e no quadro; na lista, tambem a coluna, a sprint, a ordem e os arquivados.
 * No quadro, a barra de ferramentas embaixo dela tem o lembrete de como arrastar, as
 * raias e os arquivados. "/" vai a busca e "c" abre o "Novo card".
 *
 * **A tela usa a largura toda.** A tabela e o quadro sao feitos para comparar card
 * com card, e uma faixa estreita cortaria colunas que cabem.
 *
 * **A contagem vem de uma chamada propria**, e nao de contar as linhas que
 * chegaram: a lista traz uma pagina, e contar o que veio daria um numero errado
 * assim que o projeto passasse de uma pagina. E dela que sai a lista de colunas do
 * quadro — e o numero de cada coluna no filtro da lista.
 *
 * **Coluna vazia continua na tela.** Some so a aposentada que nao segura mais
 * nada — a aposentada com relato antigo fica, senao esses relatos ficariam sem
 * caminho ate eles.
 */
export function ReportsScreen() {
  const project = useCurrentProject()

  /**
   * Os arquivados, no lugar da lista. **Nunca os dois juntos**: misturar faria o
   * arquivado parecer de volta. O recorte por coluna sai junto — a contagem das
   * colunas e a da tela de Trabalho, e nao conta arquivado. O quadro tambem nao os
   * mostra: e a lista deles que aparece.
   */
  const [arquivados, setArquivados] = useState(false)
  /** O "Novo card" aberto — com a coluna, quando veio do "Criar" de uma coluna do quadro. */
  const [criando, setCriando] = useState<{ coluna?: string; titulo?: string } | null>(null)
  /** O card que acabou de nascer pelo dialogo, vindo de uma coluna do quadro: o quadro rola ate ele. */
  const [revelarNoQuadro, setRevelarNoQuadro] = useState<string | null>(null)
  const [vista, setVista] = useEscolhaLembrada(
    `pds.web.trabalho.vista.${project.PublicId}`,
    VISTAS,
    'lista',
  )
  // As raias do quadro, lembradas como a vista: preferencia de quem olha.
  const [agrupar, setAgrupar] = useEscolhaLembrada(
    `pds.web.trabalho.raias.${project.PublicId}`,
    AGRUPAMENTOS,
    'none',
  )
  // A dica de como arrastar, ate a pessoa fechar — neste navegador, em todo projeto.
  const [dicaDoQuadro, setDicaDoQuadro] = useEscolhaLembrada(
    'pds.web.trabalho.dica-do-quadro',
    DICA_DO_QUADRO,
    'mostrar',
  )

  // Trocar de projeto sai dos arquivados. O recorte por coluna mora nos filtros, que
  // sao lidos por projeto (`useWorkFilters`): a coluna de um projeto nunca vai ao outro.
  const [projetoDoFiltro, setProjetoDoFiltro] = useState(project.PublicId)
  if (projetoDoFiltro !== project.PublicId) {
    setProjetoDoFiltro(project.PublicId)
    setArquivados(false)
  }

  // As regras do Ciclo que a tela usa: quando o prazo fica perto, e quantos dias a
  // ultima coluna do quadro mostra. Falhando, o destaque fica no padrao de fabrica e
  // o quadro so nao diz quantos ficaram na lista — a API aplica a regra do mesmo jeito.
  const { data: ciclo, revalidate: renovarCiclo } = useAsyncResource(
    useCallback(
      () => projectCycleSettingsService.getCycleSettings(project.PublicId),
      [project.PublicId],
    ),
  )
  const destaque = ciclo?.DueSoonDays ?? DESTAQUE_DE_FABRICA

  // Com a sprint ligada: a aba Backlog existe, e o quadro mostra so a sprint em
  // andamento. A vista lembrada "backlog" de quando estava ligada volta a ser a lista.
  const sprintsLigadas = ciclo?.SprintsEnabled === true
  const vistaEfetiva: Vista = vista === 'backlog' && !sprintsLigadas ? 'lista' : vista
  const sprints = useSprints(project.PublicId, sprintsLigadas)
  const [concluindo, setConcluindo] = useState(false)
  /** A sprint que se inicia daqui — pelo quadro vazio, ou pelo aviso de concluida. */
  const [iniciando, setIniciando] = useState<SprintViewModel | null>(null)
  /** Sobe a cada mudanca que o backlog precisa reler: um card, uma sprint. */
  const [versaoDoBacklog, setVersaoDoBacklog] = useState(0)
  const mexeuNoBacklog = useCallback(() => setVersaoDoBacklog((n) => n + 1), [])

  const quadro = vistaEfetiva === 'quadro' && !arquivados
  // A ordem das raias de prioridade e a do projeto: lida so quando elas estao na tela.
  const { data: prioridades } = useAsyncResource(
    useCallback(
      async () =>
        quadro && agrupar === 'priority'
          ? await projectPriorityService.listPriorities(project.PublicId)
          : null,
      [project.PublicId, quadro, agrupar],
    ),
  )
  // As raias por responsavel tem o time inteiro: quem esta sem card tambem ganha a
  // dele. A mesma lista que o card aberto le para escolher o responsavel. Falhando,
  // ficam so as raias de quem tem card.
  const { data: pessoasDasRaias } = useAsyncResource(
    useCallback(
      async () =>
        quadro && agrupar === 'assignee'
          ? await projectTeamService.listMembers(project.PublicId)
          : null,
      [project.PublicId, quadro, agrupar],
    ),
  )
  const backlog = vistaEfetiva === 'backlog' && !arquivados
  const modoSprint = sprintsLigadas && quadro
  const sprintDoQuadro = modoSprint ? 'active' : undefined
  // A lista das sprints nao veio: o backlog e o quadro dizem, em vez de carregar para sempre.
  const sprintsFalharam = sprintsLigadas && sprints.failed && (backlog || modoSprint)
  // O quadro sem sprint em andamento nao tem o que filtrar nem arrastar: a barra sai.
  const quadroSemSprint =
    modoSprint && (sprintsFalharam || (sprints.sprints !== null && sprints.ativa === null))
  // O filtro "Sprint" da lista oferece tambem as concluidas, lidas a parte so para ele:
  // o Backlog, o lote, o card novo e o card aberto ficam com as abertas.
  const sprintsDoFiltro = useSprintsForFilter(
    project.PublicId,
    sprintsLigadas && !quadro && !backlog,
    sprints.sprints,
  )

  // Os filtros da tela — os mesmos na lista, no quadro e na contagem das colunas.
  const filtros = useWorkFilters(project.PublicId)
  const comFiltro = filtros.key !== ''
  // O que so a lista recorta — as colunas e a sprint —, lembrado com os filtros. Nos
  // arquivados nao vale: a contagem das colunas e a da tela de Trabalho.
  const colunasDaLista = arquivados ? [] : filtros.list.columns
  const sprintDaLista = sprintsLigadas && !arquivados ? filtros.list.sprint : null
  const comFiltroNaLista = comFiltro || colunasDaLista.length > 0 || sprintDaLista !== null
  // A chave do que vale para a lista: os filtros, as colunas, a sprint e a ordem. Vazia
  // quando e a lista de sempre — e so ai o card novo entra no topo sem reler.
  const chaveDaLista =
    comFiltroNaLista || filtros.sort
      ? JSON.stringify([filtros.key, [...colunasDaLista].sort(), sprintDaLista, filtros.sort])
      : ''
  /** O "Ver na lista" do quadro e o "Ver todos" do vazio: uma coluna so, ou nenhuma. */
  const setFiltro = (chave: string | null) =>
    filtros.setList((atual) => ({ ...atual, columns: chave ? [chave] : [] }))

  // Os marcados para o lote, so na lista dos que estao em trabalho. Trocar o que a
  // lista mostra desmarca tudo: ninguem muda em lote o que nao esta vendo.
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set())
  const recorteDaLista = `${project.PublicId}|${chaveDaLista}|${arquivados}|${vistaEfetiva}`
  /** A carga sozinha do fim da lista falhou: so o botao continua, ate o recorte mudar. */
  const [semCargaSozinha, setSemCargaSozinha] = useState(false)
  const [recorteMarcado, setRecorteMarcado] = useState(recorteDaLista)
  if (recorteMarcado !== recorteDaLista) {
    setRecorteMarcado(recorteDaLista)
    setMarcados(new Set())
    setSemCargaSozinha(false)
  }
  /**
   * O que nao mudou no ultimo lote — ou o que nao voltou no "Desfazer" —, mostrado
   * aqui: a barra pode ter saido da tela.
   */
  const [falhasDoLote, setFalhasDoLote] = useState<{
    mudaram: number
    falhas: Falha[]
    desfazendo?: boolean
  } | null>(null)
  const selecao = {
    marcados,
    definir: (ids: string[], marcar: boolean) =>
      setMarcados((atual) => {
        const novo = new Set(atual)
        for (const id of ids) {
          if (marcar) novo.add(id)
          else novo.delete(id)
        }
        return novo
      }),
  }

  // O quadro tem as proprias leituras: a lista so e lida na vista dela, e de novo a
  // cada volta — o que o quadro mudou nao passa por ela.
  const {
    reports,
    total,
    loading,
    failed,
    loadingMore,
    refreshing: relendoALista,
    hasMore,
    reload,
    refresh: releituraDaLista,
    loadMore,
    loadAll,
    apply,
    prepend,
  } = useReportInbox(
    project.PublicId,
    null,
    arquivados,
    !quadro && !backlog,
    filtros.applied,
    chaveDaLista,
    {
      columns: colunasDaLista,
      sprint: sprintDaLista ?? undefined,
      sort: filtros.sort ?? undefined,
    },
  )
  // A lista relendo com outro filtro, ou a busca esperando a pessoa parar de digitar:
  // a tabela esmaece, o campo diz "Buscando…" e o lote espera.
  const buscando = !quadro && !backlog && (relendoALista || filtros.typing)

  // O "Desfazer" do lote: roda daqui, e nao da barra, que pode ter saido da tela.
  const desfazerLote = useBulkUndo(
    () => {
      void releituraDaLista()
      renovarContagens()
      if (sprintsLigadas) {
        sprints.revalidate()
        mexeuNoBacklog()
      }
    },
    (resultado) => setFalhasDoLote({ ...resultado, desfazendo: true }),
  )

  // Depois de uma mudanca, a contagem e relida sem sair da tela (`revalidate`): pelo
  // vazio, o quadro saia da tela e voltava lido do zero a cada movimento. Os filtros
  // entram pela referencia, e trocar de filtro tambem rele sem sair da tela.
  const filtrosDaContagem = useRef<{
    aplicados: typeof filtros.applied
    ligado: boolean
    sprint?: string
  }>({
    aplicados: filtros.applied,
    ligado: comFiltro,
  })
  filtrosDaContagem.current = {
    aplicados: filtros.applied,
    ligado: comFiltro,
    sprint: sprintDoQuadro,
  }
  const {
    data: contagensLidas,
    failed: contagensFalharam,
    reload: recarregarContagens,
    revalidate: renovarContagens,
  } = useAsyncResource(
    useCallback(
      async () => ({
        projeto: project.PublicId,
        linhas:
          filtrosDaContagem.current.ligado || filtrosDaContagem.current.sprint
            ? await projectReportService.listReportCounts(
                project.PublicId,
                filtrosDaContagem.current.ligado ? filtrosDaContagem.current.aplicados : undefined,
                filtrosDaContagem.current.sprint,
              )
            : await projectReportService.listReportCounts(project.PublicId),
      }),
      [project.PublicId],
    ),
  )
  // A contagem de outro projeto nao serve: na troca, ela ainda e a do anterior por
  // uma renderizacao, e o quadro pediria as colunas dele ao projeto novo.
  const contagens = contagensLidas?.projeto === project.PublicId ? contagensLidas.linhas : null

  const colunasDoQuadro = useMemo(() => (contagens ? boardColumns(contagens) : null), [contagens])
  // Com filtro, o quadro diz "2 de 10": a contagem sem os filtros (com o recorte da
  // sprint), relida a cada vez que a dos filtros e relida.
  const comFiltroNoQuadro = quadro && comFiltro
  const { data: semFiltroLidas, revalidate: renovarSemFiltro } = useAsyncResource(
    useCallback(
      async () =>
        comFiltroNoQuadro
          ? {
              projeto: project.PublicId,
              linhas: await projectReportService.listReportCounts(
                project.PublicId,
                undefined,
                sprintDoQuadro,
              ),
            }
          : null,
      [project.PublicId, comFiltroNoQuadro, sprintDoQuadro],
    ),
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: a contagem relida e o gatilho de reler a sem filtro.
  useEffect(() => {
    if (comFiltroNoQuadro) renovarSemFiltro()
  }, [contagensLidas])
  const semFiltroDoQuadro = useMemo(
    () =>
      semFiltroLidas?.projeto === project.PublicId
        ? Object.fromEntries(
            semFiltroLidas.linhas.map((linha) => [
              linha.StatePublicId ?? WITHOUT_STATE_FILTER,
              linha.Total,
            ]),
          )
        : null,
    [semFiltroLidas, project.PublicId],
  )
  // O card que outra pessoa mudou acende — e e anunciado — quando a releitura chega, e
  // nao quando o aviso chega: no quadro, ela pode esperar o arraste terminar.
  const [destacados, destacar] = useDestaques()
  const [anuncio, anunciar] = useAnnouncer()
  /** Quando a ultima mudanca de outra pessoa entrou na tela — ver `guardaDoClique`. */
  const mudouAgora = useRef(Number.NEGATIVE_INFINITY)
  const acender = useCallback(
    (mudados: ({ id: string } & RemoteChange)[]) => {
      mudouAgora.current = performance.now()
      for (const { id } of mudados) destacar(id)
      // No quadro, cada um vem com o que aconteceu e onde ("chegou em A fazer").
      anunciar(describeRemoteChange(mudados))
    },
    [destacar, anunciar],
  )
  // A sprint entra na chave: ligar, desligar ou trocar de vista rele as colunas.
  const chaveDoQuadro = `${comFiltro ? filtros.key : ''}${sprintDoQuadro ? '|sprint' : ''}`
  const board = useBoard(
    project.PublicId,
    colunasDoQuadro,
    quadro && (!modoSprint || sprints.ativa !== null),
    acender,
    filtros.applied,
    chaveDoQuadro,
    sprintDoQuadro,
  )

  // O filtro mudou: a contagem das colunas e relida, sem tirar o quadro da tela.
  const chaveDaContagem = chaveDoQuadro
  const contagemLida = useRef(chaveDaContagem)
  useEffect(() => {
    if (contagemLida.current === chaveDaContagem) return
    contagemLida.current = chaveDaContagem
    renovarContagens()
  }, [chaveDaContagem, renovarContagens])

  // ─── O tempo real ──────────────────────────────────────────────────────────
  // O que outra pessoa muda chega como aviso, so com os identificadores, e cada parte
  // da tela rele o que e dela: o quadro, as colunas que o card tocou; a lista, as
  // paginas que estao na tela; a contagem, sem sair da tela. Avisos proximos viram uma
  // releitura so.
  const navigate = useNavigate()
  const juntarContagens = useJuntar(renovarContagens)
  /** Os cards dos avisos que a lista ainda vai reler, para acender quando ela chegar. */
  const acenderNaLista = useRef(new Set<string>())
  const juntarLista = useJuntar(() => {
    if (quadro) return
    const ids = [...acenderNaLista.current]
    acenderNaLista.current.clear()
    void releituraDaLista().then((lista) => {
      if (lista === null || ids.length === 0) return
      acender(ids.map((id) => ({ id, numero: lista.find((card) => card.PublicId === id)?.Number })))
    })
  })

  const aoVivo = useWorkRealtime(project.PublicId, (evento) => {
    switch (evento.kind) {
      case 'card': {
        const { ReportPublicId, StatePublicId, Archived } = evento.notice
        board.remoteChange(
          ReportPublicId,
          Archived ? null : (StatePublicId ?? WITHOUT_STATE_FILTER),
        )
        if (!quadro) acenderNaLista.current.add(ReportPublicId)
        juntarLista()
        juntarContagens()
        if (sprintsLigadas) {
          sprints.revalidate()
          mexeuNoBacklog()
        }
        break
      }
      case 'project':
      case 'resync':
        // A configuracao mudou, ou a conexao voltou e pode ter perdido avisos: tudo.
        renovarContagens()
        renovarCiclo()
        sprints.revalidate()
        mexeuNoBacklog()
        board.reloadAll()
        juntarLista()
        anunciar(
          evento.kind === 'project'
            ? 'A configuração do projeto mudou, e a tela foi relida.'
            : 'A atualização ao vivo voltou, e a tela foi relida.',
        )
        break
      case 'access-lost':
        // O aviso fica no hub, e nao num toast que some: quem estava no meio de um
        // comentario precisa saber por que a tela fechou.
        navigate('/projects', { replace: true, state: { leftProject: project.Name } })
        break
    }
  })

  /**
   * O card que mudou no dialogo, nas duas vistas: a lista troca a linha, e o quadro
   * troca os dados — e muda o card de coluna, quando foi o caso.
   */
  const aoMudar = (mudou: ReportSummaryViewModel | ReportDetailViewModel) => {
    apply(mudou)
    board.apply(mudou)
    // Com a sprint ligada, o card que saiu da sprint em andamento sai do quadro: a
    // coluna dele e relida com o recorte.
    if (modoSprint && mudou.Sprint?.State !== 'Active') board.remoteChange(mudou.PublicId, null)
    if (sprintsLigadas) {
      sprints.revalidate()
      mexeuNoBacklog()
    }
    // A contagem muda em duas colunas de uma vez — ou numa so, quando o card vai
    // para o arquivo —, e ela nao se recalcula sozinha. Sem isto, as contagens do
    // filtro de coluna e do quadro passariam a discordar da lista na frente de quem
    // esta olhando.
    renovarContagens()
  }

  /**
   * O card que acabou de nascer, na lista. **Na lista de sempre, vai para o topo** sem
   * reler — e o mais novo. Com filtro, coluna, sprint ou outra ordem, a lista e relida:
   * so a API sabe se ele passa nos filtros e onde ele cai na ordem — e por la ele nao
   * entra numa lista em que nao cabe ("Vencidos" com um card sem prazo). Devolve se ele
   * esta na lista, ou nulo quando nao da para saber (outra vista, a leitura falhou).
   */
  const entrarNaLista = async (card: ReportSummaryViewModel): Promise<boolean | null> => {
    if (quadro || backlog) return null
    if (chaveDaLista === '') {
      prepend(card)
      return true
    }
    const lista = await releituraDaLista()
    return lista === null ? null : lista.some((item) => item.PublicId === card.PublicId)
  }

  /**
   * O aviso do card criado diz **onde ele foi parar** quando ele nao vai ficar a vista,
   * e da a acao: abrir, ou leva-lo para a sprint do quadro. Sem isso, o card criado no
   * quadro ia para o backlog e sumia — e quem nao o via criava outro.
   */
  const avisarCriado = (
    card: ReportDetailViewModel,
    naLista: boolean | null,
    noQuadro: boolean,
  ) => {
    const abrir = { label: 'Abrir', run: () => navigate(card.PublicId) }
    const onde = sprintsLigadas ? (card.Sprint ? ` na ${card.Sprint.Name}` : ' no backlog') : ''
    const ativa = sprints.ativa
    if (quadro && !noQuadro) {
      toast.done(
        `#${card.Number} criado${onde} — não aparece no quadro da sprint.`,
        ativa
          ? { action: { label: `Levar para a ${ativa.Name}`, run: () => levarParaASprint(card) } }
          : { action: abrir },
      )
      return
    }
    // So com filtro: com so outra ordem, o card esta na lista, so mais abaixo — e culpar
    // um filtro que nao ha mandava a pessoa procurar o que desligar.
    if (naLista === false && comFiltroNaLista) {
      toast.done(
        `#${card.Number} criado${onde}. Ele não aparece aqui porque os filtros estão ligados.`,
        { action: abrir },
      )
      return
    }
    toast.done(`#${card.Number} criado${onde}.`, { action: abrir })
  }

  /** O "Levar para a Sprint 2" do aviso: o card vai para a sprint do quadro, no fim dela. */
  const levarParaASprint = (card: ReportDetailViewModel) => {
    const ativa = sprints.ativa
    if (!ativa) return
    projectReportService
      .setSprint(project.PublicId, card.PublicId, { SprintPublicId: ativa.PublicId })
      .then((movido) => {
        board.insert(movido)
        apply(movido)
        sprints.revalidate()
        mexeuNoBacklog()
        renovarContagens()
        toast.done(`#${card.Number} foi para a ${ativa.Name}.`)
      })
      .catch((falha) => toast.error(describeError(falha)))
  }

  const painel = useId()

  // Os atalhos da lista e do quadro: "/" vai a busca e "c" abre o "Novo card". Nao valem
  // com o foco num campo de texto ou numa caixa de escolha (a letra escolhe a opcao), com
  // um dialogo, menu ou lista de opcoes aberta, nem com Ctrl, ⌘ ou Alt — a tecla e de
  // quem esta escrevendo, ou de outro atalho. A caixa de marcar da tabela nao e campo de
  // texto: quem marca cards pelo teclado usa os atalhos dali.
  const atalhos = useRef({ arquivados, buscaVisivel: !backlog && !quadroSemSprint })
  atalhos.current = { arquivados, buscaVisivel: !backlog && !quadroSemSprint }
  useEffect(() => {
    const aoTeclar = (evento: globalThis.KeyboardEvent) => {
      if (evento.defaultPrevented || evento.ctrlKey || evento.metaKey || evento.altKey) return
      const alvo = evento.target as HTMLElement | null
      if (
        alvo?.closest(
          'input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"], [role="menu"], [role="combobox"]',
        )
      )
        return
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
        )
      )
        return
      if (evento.key === '/' && atalhos.current.buscaVisivel) {
        const busca = document.getElementById(`${painel}-busca`)
        if (!busca) return
        evento.preventDefault()
        busca.focus()
      } else if ((evento.key === 'c' || evento.key === 'C') && !atalhos.current.arquivados) {
        evento.preventDefault()
        setCriando({})
      }
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [painel])

  // O clique num card logo depois de a mudanca de outra pessoa entrar na tela nao abre
  // nada: o card novo no topo empurra os de baixo, e o clique mirado num cairia no
  // vizinho — e abrir grava leitura. O clique seguinte vale.
  const guardaDoClique = (evento: ReactMouseEvent) => {
    if (performance.now() - mudouAgora.current > CLIQUE_DEPOIS_DA_MUDANCA_MS) return
    if (!(evento.target as Element).closest('a[href*="/reports/"], tbody tr')) return
    evento.preventDefault()
    evento.stopPropagation()
  }

  const conteudo = (
    <>
      {failed && !quadro && (
        <div className="max-w-170 rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
            Não deu para carregar os cards agora. Nada se perdeu: a falha foi ao consultar, e o que
            chegou continua guardado.
          </p>
          <Button
            onClick={() => {
              reload()
              recarregarContagens()
            }}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {sprintsFalharam ? (
        <SprintsFailed aoTentar={sprints.reload} />
      ) : backlog ? (
        <SprintBacklog
          projectPublicId={project.PublicId}
          sprints={sprints.sprints}
          colunas={contagens}
          versao={versaoDoBacklog}
          aoMudou={() => {
            sprints.revalidate()
            mexeuNoBacklog()
            renovarContagens()
          }}
          soonDays={destaque}
          sprintWeeks={ciclo?.SprintLengthWeeks}
        />
      ) : quadro && modoSprint && sprints.sprints !== null && sprints.ativa === null ? (
        <NoActiveSprint
          proxima={sprints.sprints.find((sprint) => sprint.State === 'Planned') ?? null}
          aoIniciar={setIniciando}
          aoIrAoBacklog={() => setVista('backlog')}
        />
      ) : quadro ? (
        colunasDoQuadro === null ? (
          contagensFalharam ? (
            <div className="max-w-170 rounded-xl border border-border bg-surface-raised p-5">
              <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
                Não deu para carregar o quadro agora. Nada se perdeu: a falha foi ao consultar.
              </p>
              <Button onClick={recarregarContagens}>Tentar de novo</Button>
            </div>
          ) : (
            <BoardSkeleton />
          )
        ) : (
          <>
            {modoSprint && sprints.ativa && (
              <SprintBar sprint={sprints.ativa} aoConcluir={() => setConcluindo(true)} />
            )}
            <ReportsBoard
              projectPublicId={project.PublicId}
              board={board}
              columns={colunasDoQuadro}
              soonDays={destaque}
              lastColumnDays={ciclo?.LastColumnVisibleDays ?? 0}
              aoMudarColunas={renovarContagens}
              aoVerNaLista={(chave) => {
                setFiltro(chave)
                setVista('lista')
                // O botao que levou ate la some com o quadro: o foco vai para a aba da
                // lista, e nao para o comeco da pagina.
                document.getElementById(`${painel}-lista`)?.focus()
              }}
              aoCriar={(chave, titulo) => setCriando({ coluna: chave, titulo })}
              // O campo do alto da coluna: o card ja nasceu na coluna (e, com a sprint
              // ligada, na sprint em andamento). Acende, e o leitor de tela ouve onde.
              aoCriadoNaColuna={(card, coluna) => {
                if (!modoSprint || card.Sprint?.State === 'Active') board.insert(card)
                destacar(card.PublicId)
                anunciar(`#${card.Number} criado em ${coluna}.`)
                if (sprintsLigadas) {
                  sprints.revalidate()
                  mexeuNoBacklog()
                }
                renovarContagens()
              }}
              sprintPublicId={modoSprint ? sprints.ativa?.PublicId : undefined}
              destacados={destacados}
              agrupar={agrupar}
              prioridades={prioridades}
              pessoas={pessoasDasRaias}
              filtro={comFiltro ? { semFiltro: semFiltroDoQuadro, aoLimpar: filtros.clear } : null}
              revelar={revelarNoQuadro}
            />
          </>
        )
      ) : (
        <>
          {loading && <ReportsTableSkeleton />}

          {reports?.length === 0 && (
            <div className="max-w-170">
              {/* So uma coluna escolhida, e nada mais: o vazio e o daquela coluna. */}
              {!comFiltro && sprintDaLista === null && colunasDaLista.length === 1 ? (
                <ColunaVazia
                  nome={nomeDaColuna(contagens, colunasDaLista[0] ?? '')}
                  aoVerTodos={() => setFiltro(null)}
                />
              ) : comFiltroNaLista ? (
                <SemCardNoFiltro
                  arquivados={arquivados}
                  busca={filtros.applied.search.trim()}
                  outros={
                    filtros.activeShared -
                    (filtros.applied.search.trim() ? 1 : 0) +
                    (colunasDaLista.length > 0 ? 1 : 0) +
                    (sprintDaLista !== null ? 1 : 0)
                  }
                  aoLimpar={filtros.clear}
                />
              ) : arquivados ? (
                <div className="rounded-xl border border-border border-dashed bg-surface-raised p-6">
                  <p className="text-detail text-fg-muted leading-relaxed">
                    Nenhum card arquivado. O que sai da tela de Trabalho aparece aqui.
                  </p>
                </div>
              ) : (
                <EmptyState installs={canConfigure(project)} aoCriar={() => setCriando({})} />
              )}
            </div>
          )}

          {reports && reports.length > 0 && (
            <>
              <ReportsTable
                reports={reports}
                colunas={contagens}
                soonDays={destaque}
                destacados={destacados}
                selecao={arquivados ? undefined : selecao}
                ordem={filtros.sort}
                aoOrdenar={filtros.sortBy}
                comSprint={sprintsLigadas}
                buscando={buscando}
              />

              {/* Depois da tabela, presa embaixo da tela: marcar nao empurra as linhas. */}
              {!arquivados && reports.some((report) => marcados.has(report.PublicId)) && (
                <BulkActions
                  projectPublicId={project.PublicId}
                  cards={reports.filter((report) => marcados.has(report.PublicId))}
                  colunas={contagens}
                  colunasFalharam={contagensFalharam}
                  aoRecarregarColunas={recarregarContagens}
                  sprints={sprintsLigadas ? (sprints.sprints ?? []) : null}
                  carregados={reports.length}
                  total={total}
                  comFiltro={comFiltroNaLista}
                  aoSelecionarTodos={async () => {
                    const todos = await loadAll()
                    if (todos)
                      selecao.definir(
                        todos.map((report) => report.PublicId),
                        true,
                      )
                  }}
                  bloqueado={buscando}
                  aoTerminar={(resultado) => {
                    // A selecao fica: da para fazer outra mudanca nos mesmos cards.
                    if (resultado.falhas.length > 0) setFalhasDoLote(resultado)
                    void releituraDaLista()
                    renovarContagens()
                    if (sprintsLigadas) {
                      sprints.revalidate()
                      mexeuNoBacklog()
                    }
                  }}
                  aoDesfazer={(lote) => void desfazerLote.desfazer(lote)}
                  aoLimpar={() => setMarcados(new Set())}
                />
              )}

              <footer className="mt-3 flex flex-wrap items-center gap-3">
                {hasMore && (
                  <Button
                    disabled={loadingMore}
                    onClick={() => {
                      loadMore().catch((error) => toast.error(describeError(error)))
                    }}
                  >
                    {loadingMore ? 'Carregando…' : 'Carregar mais'}
                  </Button>
                )}

                <span className="text-detail text-fg-muted tabular-nums">
                  {reports.length} de {total} {total === 1 ? 'card' : 'cards'}
                </span>

                {/* O "Desfazer" do lote anda aqui: a barra pode ter saido da tela. */}
                <span role="status" className="text-detail text-fg-muted tabular-nums">
                  {desfazerLote.desfazendo
                    ? `Desfazendo ${desfazerLote.desfazendo.feitos} de ${desfazerLote.desfazendo.total}…`
                    : ''}
                </span>
              </footer>

              {/* Perto do fim da lista, a proxima pagina vem sozinha; o botao continua
                  para o teclado e para quando a leitura falha. */}
              {hasMore && !loadingMore && !semCargaSozinha && (
                <CarregarSozinho
                  aoChegar={() => {
                    loadMore().catch(() => {
                      // A falha para a carga sozinha — senao ela tentaria sem parar — e
                      // fica com o botao: quem clicar ve a mensagem.
                      setSemCargaSozinha(true)
                    })
                  }}
                />
              )}
            </>
          )}
        </>
      )}
    </>
  )

  return (
    // O quadro ocupa a altura que sobra da janela: as colunas rolam por dentro, e a
    // barra de rolar para os lados fica no pe da tela (ver `ReportsBoard`).
    <div className={cn(quadro && 'flex h-full flex-col')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 id={`${painel}-titulo`} className="font-semibold text-screen tracking-tight">
          {arquivados ? 'Arquivados' : 'Trabalho'}
        </h1>
        {/* Nos arquivados nao: o card novo vai para o Trabalho, e nao apareceria aqui. */}
        {!arquivados && (
          <Button variant="primary" onClick={() => setCriando({})} title="Atalho: c">
            Novo card
          </Button>
        )}
      </div>

      {arquivados ? (
        <p className="mb-4 text-detail text-fg-muted">
          Os cards que saíram da tela de Trabalho. Abra um para ler, comentar ou desarquivar.
        </p>
      ) : (
        <Abas
          vista={vistaEfetiva}
          painel={painel}
          aoEscolher={setVista}
          comBacklog={sprintsLigadas}
        />
      )}

      {/* O backlog tem a ordem do time, e nao recorte: os filtros sao da lista e do quadro.
          O backlog tem a busca dele, que esconde sem mudar a ordem. */}
      {!backlog && !quadroSemSprint && (
        <WorkFilterBar
          projectPublicId={project.PublicId}
          filters={filtros.filters}
          // So contam os que valem aqui: no quadro, as colunas e a sprint da lista nao
          // valem; nos arquivados, tambem nao — nem a sprint com as sprints desligadas.
          active={
            filtros.activeShared +
            (quadro ? 0 : (colunasDaLista.length > 0 ? 1 : 0) + (sprintDaLista !== null ? 1 : 0))
          }
          onChange={filtros.setFilters}
          onClear={filtros.clear}
          // Na lista, a coluna, a sprint e a ordem moram na mesma barra — e os
          // arquivados no fim dela: uma linha a menos antes do primeiro card.
          lista={
            quadro
              ? undefined
              : {
                  filters: filtros.list,
                  onChange: filtros.setList,
                  colunas: contagens,
                  colunasFalharam: contagensFalharam,
                  aoRecarregarColunas: recarregarContagens,
                  sprints: sprintsLigadas ? sprintsDoFiltro : null,
                  ordem: filtros.sort,
                  aoOrdenar: filtros.setSort,
                }
          }
          arquivados={arquivados}
          buscando={buscando}
          searchInputId={`${painel}-busca`}
        >
          {!quadro && (
            <BotaoArquivados
              arquivados={arquivados}
              aoAlternar={() => setArquivados((valor) => !valor)}
            />
          )}
        </WorkFilterBar>
      )}

      {/* A barra de ferramentas do quadro e do backlog: como arrastar — no celular, o
          segurar antes nao se adivinha —, as raias e os arquivados. Na lista, o que
          havia aqui foi para a barra de filtros. */}
      <div
        hidden={!quadro && !backlog}
        className="my-4 flex flex-wrap items-center justify-between gap-2"
      >
        {quadro && !quadroSemSprint ? (
          // Curta, e some no "✕": ajuda no primeiro dia e vira ruido depois — e a altura
          // e o que mais falta no quadro. Fechada fica neste navegador.
          dicaDoQuadro === 'mostrar' ? (
            <p className="flex items-center gap-1.5 text-caption text-fg-muted">
              <span>
                {agrupar === 'none'
                  ? 'Arraste para mover'
                  : `Arraste para mover; outra raia troca ${agrupar === 'assignee' ? 'o responsável' : 'a prioridade'}`}
                {' · no celular, segure · no teclado, as setas andam e espaço pega'}
              </span>
              <button
                type="button"
                onClick={() => setDicaDoQuadro('fechada')}
                aria-label="Esconder a dica de como arrastar"
                className="flex size-6 flex-none items-center justify-center rounded-md hover:bg-surface-sunken hover:text-fg"
              >
                <span aria-hidden>✕</span>
              </button>
            </p>
          ) : (
            <span />
          )
        ) : backlog ? (
          <p className="text-caption text-fg-muted">
            Arraste os cards entre o backlog e as sprints, ou use o menu de cada card.
          </p>
        ) : (
          <span />
        )}

        <div className="flex flex-none items-center gap-2">
          {quadro && !quadroSemSprint && (
            <Select
              ariaLabel="Raias do quadro"
              size="sm"
              value={agrupar}
              onChange={(valor) => setAgrupar(valor as LaneBy)}
              options={[
                { value: 'none', label: 'Sem raias' },
                { value: 'assignee', label: 'Raias por responsável' },
                { value: 'priority', label: 'Raias por prioridade' },
              ]}
            />
          )}
          <BotaoArquivados
            arquivados={arquivados}
            aoAlternar={() => setArquivados((valor) => !valor)}
          />
        </div>
      </div>

      {/* Nos arquivados nao ha abas: o conteudo e uma regiao com o nome do titulo. */}
      {arquivados ? (
        <section
          aria-labelledby={`${painel}-titulo`}
          data-work-area
          onClickCapture={guardaDoClique}
        >
          {conteudo}
        </section>
      ) : (
        <div
          id={painel}
          role="tabpanel"
          aria-labelledby={`${painel}-${vistaEfetiva}`}
          data-work-area
          onClickCapture={guardaDoClique}
          className={cn(quadro && 'flex min-h-0 flex-1 flex-col')}
        >
          {conteudo}
        </div>
      )}

      {/* O relato aberto e uma rota filha, e nao um estado desta tela: assim ele
          tem endereco proprio, o botao voltar do navegador fecha o dialogo em vez
          da tela inteira, e a lista — ou o quadro — continua montada atras com o
          recorte e a rolagem onde estavam. */}
      <Outlet
        context={{
          projectPublicId: project.PublicId,
          reports: quadro ? Object.values(board.cards) : reports,
          // As colunas saem da contagem que esta tela ja carregou: mesma ordem, e
          // sem uma segunda requisicao para perguntar o que ja esta na mao.
          colunas: contagens,
          aoMudar,
          assinarAvisos: aoVivo.assinar,
          semAoVivo: aoVivo.semAoVivo,
          // O anterior e o proximo do card aberto seguem o que esta na tela: a lista
          // como esta, ou o quadro coluna por coluna.
          ordem: quadro
            ? (colunasDoQuadro ?? []).flatMap((coluna) => board.items[coluna.key] ?? [])
            : reports?.map((report) => report.PublicId),
          podeConfigurar: canConfigure(project),
          soonDays: destaque,
          // A subtarefa nasce como o card novo: no topo da lista e da coluna dela.
          sprints: sprintsLigadas ? (sprints.sprints ?? []) : null,
          aoCriarSubtarefa: (subtarefa: ReportDetailViewModel) => {
            void entrarNaLista(subtarefa)
            board.insert(subtarefa)
            renovarContagens()
          },
        }}
      />

      {falhasDoLote && (
        <BulkFailures
          mudaram={falhasDoLote.mudaram}
          falhas={falhasDoLote.falhas}
          desfazendo={falhasDoLote.desfazendo}
          aoFechar={() => setFalhasDoLote(null)}
        />
      )}

      {concluindo && sprints.ativa && (
        <CloseSprintDialog
          projectPublicId={project.PublicId}
          sprint={sprints.ativa}
          planejadas={(sprints.sprints ?? []).filter((sprint) => sprint.State === 'Planned')}
          aoFechar={() => {
            setConcluindo(false)
            sprints.revalidate()
            mexeuNoBacklog()
            board.reloadAll()
            renovarContagens()
          }}
          aoCancelar={() => setConcluindo(false)}
          aoIniciar={setIniciando}
        />
      )}

      {iniciando && (
        <SprintDialog
          projectPublicId={project.PublicId}
          sprint={iniciando}
          mode="start"
          semanas={ciclo?.SprintLengthWeeks}
          aoSalvar={() => {
            setIniciando(null)
            sprints.revalidate()
            mexeuNoBacklog()
            board.reloadAll()
            renovarContagens()
          }}
          aoCancelar={() => setIniciando(null)}
        />
      )}

      {/* So quando a conexao fica fora de verdade (alguns segundos): a queda curta
          volta sozinha, e um selo que pisca a cada uma ensina a nao olhar para ele. */}
      <LiveBadge estado={aoVivo.semAoVivo} />
      <LiveAnnouncer anuncio={anuncio} />

      {criando && (
        <NewCardDialog
          projectPublicId={project.PublicId}
          colunas={contagens}
          colunaInicial={criando.coluna}
          tituloInicial={criando.titulo}
          // Com a sprint ligada, o dialogo diz onde o card entra: de saida, o "Criar" de
          // uma coluna do quadro cria na sprint em andamento, e o "Novo card", no backlog
          // — e a pessoa pode trocar.
          sprints={sprintsLigadas ? (sprints.sprints ?? []) : null}
          sprintInicial={criando.coluna && modoSprint ? (sprints.ativa?.PublicId ?? null) : null}
          aoCriar={(card) => {
            setCriando(null)
            // No topo da coluna dele no quadro — que, com a sprint ligada, so mostra a
            // sprint em andamento. Na lista, so se passar nos filtros.
            const noQuadro = !modoSprint || card.Sprint?.State === 'Active'
            if (noQuadro) board.insert(card)
            // Pelo "Mais detalhes" de uma coluna do quadro: o quadro rola ate ele, aceso.
            if (noQuadro && quadro && criando.coluna !== undefined) {
              destacar(card.PublicId)
              setRevelarNoQuadro(card.PublicId)
            }
            if (sprintsLigadas) {
              sprints.revalidate()
              mexeuNoBacklog()
            }
            renovarContagens()
            void entrarNaLista(card).then((naLista) => avisarCriado(card, naLista, noQuadro))
          }}
          aoCancelar={() => setCriando(null)}
        />
      )}
    </div>
  )
}

/**
 * Uma escolha de quem olha — a ultima vista, as raias do quadro —, guardada neste
 * navegador por projeto. **Preferencia de quem olha**, e nao regra do projeto: cada
 * pessoa do time trabalha como prefere. O navegador pode negar o armazenamento —
 * janela privada, dados bloqueados —, e ai a tela so nao lembra.
 */
function useEscolhaLembrada<T extends string>(chave: string, validas: readonly T[], padrao: T) {
  const ler = useCallback((): T => {
    try {
      const lida = window.localStorage.getItem(chave)
      return validas.find((valida) => valida === lida) ?? padrao
    } catch {
      return padrao
    }
  }, [chave, validas, padrao])

  const [escolha, setEscolhaEstado] = useState<T>(ler)

  // Outro projeto, outra lembranca.
  const [daChave, setDaChave] = useState(chave)
  if (daChave !== chave) {
    setDaChave(chave)
    setEscolhaEstado(ler())
  }

  const setEscolha = (nova: T) => {
    setEscolhaEstado(nova)
    try {
      window.localStorage.setItem(chave, nova)
    } catch {
      // Sem onde guardar, a escolha vale ate sair da tela.
    }
  }

  return [escolha, setEscolha] as const
}

/**
 * Lista e quadro, em abas: a escolha de **como ver**, e nao um filtro — por isso fica
 * acima da barra de ferramentas, e nao dentro dela.
 *
 * As setas trocam de aba e levam o foco junto, como em toda lista de abas; a aba
 * escolhida e a unica parada do Tab.
 */
function Abas({
  vista,
  painel,
  aoEscolher,
  comBacklog,
}: {
  vista: Vista
  /** O id do painel que as abas controlam. */
  painel: string
  aoEscolher: (vista: Vista) => void
  /** Com a sprint ligada, a terceira aba. */
  comBacklog: boolean
}) {
  const opcoes: Vista[] = comBacklog ? ['lista', 'quadro', 'backlog'] : ['lista', 'quadro']
  const botoes = useRef<Partial<Record<Vista, HTMLButtonElement | null>>>({})

  const teclas = (evento: KeyboardEvent, atual: Vista) => {
    const indice = opcoes.indexOf(atual)
    const proxima =
      evento.key === 'ArrowRight'
        ? opcoes[(indice + 1) % opcoes.length]
        : evento.key === 'ArrowLeft'
          ? opcoes[(indice - 1 + opcoes.length) % opcoes.length]
          : evento.key === 'Home'
            ? opcoes[0]
            : evento.key === 'End'
              ? opcoes[opcoes.length - 1]
              : undefined
    if (!proxima) return
    evento.preventDefault()
    aoEscolher(proxima)
    botoes.current[proxima]?.focus()
  }

  return (
    <div role="tablist" aria-label="Vista" className="flex gap-5 border-border border-b">
      {opcoes.map((opcao) => (
        <button
          key={opcao}
          ref={(no) => {
            botoes.current[opcao] = no
          }}
          id={`${painel}-${opcao}`}
          type="button"
          role="tab"
          aria-selected={vista === opcao}
          aria-controls={painel}
          tabIndex={vista === opcao ? 0 : -1}
          onClick={() => aoEscolher(opcao)}
          onKeyDown={(evento) => teclas(evento, opcao)}
          className={cn(
            '-mb-px flex h-9 items-center border-b-2 px-0.5 font-medium text-body transition-colors',
            vista === opcao
              ? 'border-accent text-fg'
              : 'border-transparent text-fg-muted hover:text-fg',
          )}
        >
          {opcao === 'lista' ? 'Lista' : opcao === 'quadro' ? 'Quadro' : 'Backlog'}
        </button>
      ))}
    </div>
  )
}

/**
 * O nome da coluna escolhida, para a tela poder dize-lo.
 *
 * Cai no generico se a contagem ainda nao chegou: melhor uma frase sem o nome do
 * que a tela em branco esperando um dado que so serve para enfeitar a frase.
 */
function nomeDaColuna(
  contagens: ReportStateCountViewModel[] | null,
  filtro: string,
): string | null {
  const achada = (contagens ?? []).find(
    (item) => (item.StatePublicId ?? WITHOUT_STATE_FILTER) === filtro,
  )
  return achada?.StateName ?? null
}

/**
 * Nada passa nos filtros. Diz isso, e nao "nenhum card ainda": os cards existem, e a
 * saida e um clique. Com a busca, diz o que foi buscado — "nenhum passa nos filtros"
 * para quem so digitou uma palavra soava como filtro esquecido.
 */
function SemCardNoFiltro({
  arquivados,
  busca,
  outros,
  aoLimpar,
}: {
  arquivados: boolean
  /** A busca que vale, ja sem os espacos das pontas; vazia sem busca. */
  busca: string
  /** Quantos filtros, alem da busca, estao ligados. */
  outros: number
  aoLimpar: () => void
}) {
  const frase = busca
    ? `${arquivados ? 'Nenhum card arquivado encontrado' : 'Nenhum card encontrado'} para “${busca}”${outros > 0 ? ' com os filtros ligados' : ''}.`
    : arquivados
      ? 'Nenhum card arquivado passa nos filtros.'
      : 'Nenhum card passa nos filtros.'
  return (
    <div className="rounded-xl border border-border border-dashed bg-surface-raised p-6">
      <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
        {frase} Os outros continuam onde estão.
      </p>
      <Button onClick={aoLimpar}>
        {busca && outros === 0 ? 'Limpar a busca' : 'Limpar filtros'}
      </Button>
    </div>
  )
}

/**
 * O vazio de um recorte **nao e** o vazio do projeto.
 *
 * O `EmptyState` diz "nenhum relato ainda" e convida a instalar a ferramenta no
 * site. Na frente de uma coluna vazia de um projeto que ja recebeu relatos, isso e
 * mentira duas vezes: sobre o que existe, e sobre o que a pessoa precisa fazer.
 */
function ColunaVazia({ nome, aoVerTodos }: { nome: string | null; aoVerTodos: () => void }) {
  return (
    <div className="rounded-xl border border-border border-dashed bg-surface-raised p-6">
      <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
        {nome ? (
          <>
            Nenhum card em <strong className="font-medium text-fg">{nome}</strong> agora.
          </>
        ) : (
          'Nenhum card neste recorte agora.'
        )}{' '}
        Os outros continuam onde estão.
      </p>
      <Button onClick={aoVerTodos}>Ver todos</Button>
    </div>
  )
}

/**
 * A chave dos arquivados: "Arquivados" fora deles, e "Sair dos arquivados" dentro — o
 * botao pressionado sozinho nao dizia como voltar.
 */
function BotaoArquivados({
  arquivados,
  aoAlternar,
}: {
  arquivados: boolean
  aoAlternar: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={arquivados}
      onClick={aoAlternar}
      className={cn(
        'flex h-8 flex-none items-center rounded-lg border px-3 text-detail transition-colors',
        arquivados
          ? 'border-accent bg-accent text-accent-fg'
          : 'border-border bg-surface text-fg-muted hover:bg-surface-sunken hover:text-fg',
      )}
    >
      {arquivados ? 'Sair dos arquivados' : 'Arquivados'}
    </button>
  )
}

/**
 * A proxima pagina sem clique: quando o fim da lista chega a uma tela de distancia, ela
 * vem sozinha. Observa dentro de quem rola — a area de trabalho, e nao a janela —, senao
 * a margem de uma tela nao valeria. Sem `IntersectionObserver` (navegador antigo, teste),
 * fica so o botao.
 */
function CarregarSozinho({ aoChegar }: { aoChegar: () => void }) {
  const marco = useRef<HTMLDivElement>(null)
  const chegar = useRef(aoChegar)
  chegar.current = aoChegar

  useEffect(() => {
    const no = marco.current
    if (!no || typeof IntersectionObserver === 'undefined') return
    let rola: HTMLElement | null = no.parentElement
    while (rola && !/(auto|scroll)/.test(getComputedStyle(rola).overflowY))
      rola = rola.parentElement
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) {
          observador.disconnect()
          chegar.current()
        }
      },
      { root: rola, rootMargin: '0px 0px 100% 0px' },
    )
    observador.observe(no)
    return () => observador.disconnect()
  }, [])

  return <div ref={marco} aria-hidden className="h-px" />
}

/**
 * Lista vazia nao e erro, e a tela diz o que fazer em vez de so constatar: quem
 * chega aqui no primeiro dia precisa saber que falta instalar, e nao que o
 * produto esta quebrado.
 */
function EmptyState({ installs, aoCriar }: { installs: boolean; aoCriar: () => void }) {
  return (
    <div className="rounded-xl border border-border border-dashed bg-surface-raised p-6">
      <h2 className="mb-1.5 font-semibold text-fg text-lead">Nada aqui ainda</h2>
      <p className="mb-4 text-detail text-fg-muted leading-relaxed">
        Assim que alguém enviar pela ferramenta instalada no site, o relato aparece aqui; aberto,
        ele mostra o protocolo, a página de onde saiu e o que a pessoa escreveu. O time também cria
        os próprios cards.
        {/* Quem e so membro nao instala nada: o link levaria a Instalacao, e a
            guarda o devolveria para ca — um clique que parece nao fazer nada. */}
        {!installs && ' Quem administra o projeto instala a ferramenta no site.'}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={aoCriar}>Criar um card</Button>
        {installs && (
          <Link
            to="../start"
            className="inline-flex items-center gap-1.5 font-medium text-detail text-fg underline-offset-4 hover:underline"
          >
            Ver como instalar no seu site
          </Link>
        )}
      </div>
    </div>
  )
}

/** Quanto tempo o card que outra pessoa mudou fica aceso. */
const DESTAQUE_MS = 2_000

/** Quanto esperar por mais avisos antes de reler: um movimento e o comentario logo depois. */
const JUNTAR_MS = 250

/** O mais que uma releitura espera: avisos sem parar nao a adiam para sempre. */
const JUNTAR_MAX_MS = 1_000

/** Quanto tempo, depois de a mudanca de outra pessoa entrar na tela, o clique num card nao vale. */
const CLIQUE_DEPOIS_DA_MUDANCA_MS = 600

/**
 * Os cards acesos agora, e quem acende um. Cada um apaga sozinho; acender de novo o
 * que ja esta aceso recomeca a conta.
 */
function useDestaques() {
  const [acesos, setAcesos] = useState<ReadonlySet<string>>(new Set())
  const apagar = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const timers = apagar.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
    }
  }, [])

  const acender = useCallback((id: string) => {
    const anterior = apagar.current.get(id)
    if (anterior) clearTimeout(anterior)
    setAcesos((atual) => new Set(atual).add(id))
    apagar.current.set(
      id,
      setTimeout(() => {
        apagar.current.delete(id)
        setAcesos((atual) => {
          const sem = new Set(atual)
          sem.delete(id)
          return sem
        })
      }, DESTAQUE_MS),
    )
  }, [])

  return [acesos, acender] as const
}

/**
 * Junta chamadas proximas numa so: chamar varias vezes em seguida roda uma vez, um
 * instante depois da ultima — e nunca mais de `JUNTAR_MAX_MS` depois da primeira, para
 * um time agitado nao deixar a tela parada. Roda a versao de agora da funcao, e nao a
 * da primeira chamada.
 */
function useJuntar(fazer: () => void) {
  const atual = useRef(fazer)
  atual.current = fazer
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  const primeira = useRef(0)

  useEffect(
    () => () => {
      if (espera.current !== null) clearTimeout(espera.current)
    },
    [],
  )

  return useCallback(() => {
    const agora = Date.now()
    if (espera.current === null) primeira.current = agora
    else clearTimeout(espera.current)
    const ms = Math.min(JUNTAR_MS, Math.max(0, primeira.current + JUNTAR_MAX_MS - agora))
    espera.current = setTimeout(() => {
      espera.current = null
      atual.current()
    }, ms)
  }, [])
}
