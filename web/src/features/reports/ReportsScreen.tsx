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
  WITHOUT_STATE_FILTER,
} from '@/contracts'
import {
  describeError,
  projectCycleSettingsService,
  projectPriorityService,
  projectReportService,
} from '@/data'
import { BulkActions } from '@/features/reports/BulkActions'
import { boardColumns, type LaneBy } from '@/features/reports/board/boardState'
import { BoardSkeleton, ReportsBoard } from '@/features/reports/board/ReportsBoard'
import { useBoard } from '@/features/reports/board/useBoard'
import {
  describeRemoteChange,
  LiveAnnouncer,
  LiveBadge,
  useAnnouncer,
} from '@/features/reports/LiveStatus'
import { NewCardDialog } from '@/features/reports/NewCardDialog'
import { ReportsTable, ReportsTableSkeleton } from '@/features/reports/ReportsTable'
import { SprintBacklog } from '@/features/reports/sprints/SprintBacklog'
import {
  CloseSprintDialog,
  NoActiveSprint,
  SprintBar,
  useSprints,
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
 * mais antigo, e o quadro, uma coluna por estado na ordem que o time arrumou. A
 * ultima escolhida fica guardada neste navegador, por projeto. O card abre no mesmo
 * dialogo nas duas, e so ao clicar — a linha e a frente do quadro sao um resumo.
 *
 * **Abaixo das abas, a barra de ferramentas**: o recorte por coluna (na lista), o
 * lembrete de como arrastar (no quadro) e os arquivados — e o lugar da busca e dos
 * filtros rapidos, quando vierem.
 *
 * **A tela usa a largura toda.** A tabela e o quadro sao feitos para comparar card
 * com card, e uma faixa estreita cortaria colunas que cabem.
 *
 * **A contagem vem de uma chamada propria**, e nao de contar as linhas que
 * chegaram: a lista traz uma pagina, e contar o que veio daria um numero errado
 * assim que o projeto passasse de vinte relatos. E dela que sai a lista de colunas
 * do quadro.
 *
 * **Coluna vazia continua na tela.** Some so a aposentada que nao segura mais
 * nada — a aposentada com relato antigo fica, senao esses relatos ficariam sem
 * caminho ate eles.
 */
export function ReportsScreen() {
  const project = useCurrentProject()

  const [filtro, setFiltro] = useState<string | null>(null)

  /**
   * Os arquivados, no lugar da lista. **Nunca os dois juntos**: misturar faria o
   * arquivado parecer de volta. O recorte por coluna sai junto — a contagem das
   * colunas e a da tela de Trabalho, e nao conta arquivado. O quadro tambem nao os
   * mostra: e a lista deles que aparece.
   */
  const [arquivados, setArquivados] = useState(false)
  /** O "Novo card" aberto — com a coluna, quando veio do "Criar" de uma coluna do quadro. */
  const [criando, setCriando] = useState<{ coluna?: string } | null>(null)
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

  // Trocar de projeto zera o recorte, e isto vem **antes** da busca: o
  // identificador de uma coluna do projeto anterior nao existe no novo, e a API
  // recusaria a lista inteira com 404.
  const [projetoDoFiltro, setProjetoDoFiltro] = useState(project.PublicId)
  if (projetoDoFiltro !== project.PublicId) {
    setProjetoDoFiltro(project.PublicId)
    setFiltro(null)
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
  const backlog = vistaEfetiva === 'backlog' && !arquivados
  const modoSprint = sprintsLigadas && quadro
  const sprintDoQuadro = modoSprint ? 'active' : undefined

  // Os filtros da tela — os mesmos na lista, no quadro e na contagem das colunas.
  const filtros = useWorkFilters(project.PublicId)
  const comFiltro = filtros.key !== ''

  // Os marcados para o lote, so na lista dos que estao em trabalho. Trocar o que a
  // lista mostra desmarca tudo: ninguem muda em lote o que nao esta vendo.
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set())
  const recorteDaLista = `${project.PublicId}|${filtro}|${filtros.key}|${arquivados}|${vistaEfetiva}`
  const [recorteMarcado, setRecorteMarcado] = useState(recorteDaLista)
  if (recorteMarcado !== recorteDaLista) {
    setRecorteMarcado(recorteDaLista)
    setMarcados(new Set())
  }
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
    hasMore,
    reload,
    refresh: releituraDaLista,
    loadMore,
    apply,
    prepend,
  } = useReportInbox(
    project.PublicId,
    arquivados ? null : filtro,
    arquivados,
    !quadro && !backlog,
    filtros.applied,
    comFiltro ? filtros.key : '',
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
  // O card que outra pessoa mudou acende — e e anunciado — quando a releitura chega, e
  // nao quando o aviso chega: no quadro, ela pode esperar o arraste terminar.
  const [destacados, destacar] = useDestaques()
  const [anuncio, anunciar] = useAnnouncer()
  /** Quando a ultima mudanca de outra pessoa entrou na tela — ver `guardaDoClique`. */
  const mudouAgora = useRef(Number.NEGATIVE_INFINITY)
  const acender = useCallback(
    (mudados: { id: string; numero?: number }[]) => {
      mudouAgora.current = performance.now()
      for (const { id } of mudados) destacar(id)
      anunciar(describeRemoteChange(mudados.map(({ numero }) => numero)))
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

  const painel = useId()

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

      {backlog ? (
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
        />
      ) : quadro && modoSprint && sprints.sprints !== null && sprints.ativa === null ? (
        <NoActiveSprint aoIrAoBacklog={() => setVista('backlog')} />
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
              aoCriar={(chave) => setCriando({ coluna: chave })}
              destacados={destacados}
              agrupar={agrupar}
              prioridades={prioridades}
            />
          </>
        )
      ) : (
        <>
          {loading && <ReportsTableSkeleton />}

          {reports?.length === 0 && (
            <div className="max-w-170">
              {comFiltro ? (
                <SemCardNoFiltro arquivados={arquivados} aoLimpar={filtros.clear} />
              ) : arquivados ? (
                <div className="rounded-xl border border-border border-dashed bg-surface-raised p-6">
                  <p className="text-detail text-fg-muted leading-relaxed">
                    Nenhum card arquivado. O que sai da tela de Trabalho aparece aqui.
                  </p>
                </div>
              ) : filtro === null ? (
                <EmptyState installs={canConfigure(project)} aoCriar={() => setCriando({})} />
              ) : (
                <ColunaVazia
                  nome={nomeDaColuna(contagens, filtro)}
                  aoVerTodos={() => setFiltro(null)}
                />
              )}
            </div>
          )}

          {reports && reports.length > 0 && (
            <>
              {!arquivados && reports.some((report) => marcados.has(report.PublicId)) && (
                <BulkActions
                  projectPublicId={project.PublicId}
                  cards={reports.filter((report) => marcados.has(report.PublicId))}
                  colunas={contagens}
                  sprints={sprintsLigadas ? (sprints.sprints ?? []) : null}
                  aoTerminar={() => {
                    setMarcados(new Set())
                    void releituraDaLista()
                    renovarContagens()
                    if (sprintsLigadas) {
                      sprints.revalidate()
                      mexeuNoBacklog()
                    }
                  }}
                  aoLimpar={() => setMarcados(new Set())}
                />
              )}
              <ReportsTable
                reports={reports}
                colunas={contagens}
                soonDays={destaque}
                destacados={destacados}
                selecao={arquivados ? undefined : selecao}
              />

              <footer className="mt-3 flex items-center gap-3">
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
                  {reports.length} de {total}
                </span>
              </footer>
            </>
          )}
        </>
      )}
    </>
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 id={`${painel}-titulo`} className="font-semibold text-screen tracking-tight">
          {arquivados ? 'Arquivados' : 'Trabalho'}
        </h1>
        <Button variant="primary" onClick={() => setCriando({})}>
          Novo card
        </Button>
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

      {/* O backlog tem a ordem do time, e nao recorte: os filtros sao da lista e do quadro. */}
      {!backlog && (
        <WorkFilterBar
          projectPublicId={project.PublicId}
          filters={filtros.filters}
          active={filtros.active}
          onChange={filtros.setFilters}
          onClear={filtros.clear}
        />
      )}

      {/* A barra de ferramentas. O recorte por coluna e so da lista: no quadro, cada
          coluna ja esta na tela, e no lugar dele fica como arrastar — no celular, o
          segurar antes nao se adivinha. */}
      <div className="my-4 flex flex-wrap items-center justify-between gap-2">
        {!arquivados && !quadro && !backlog && contagens && contagens.length > 0 ? (
          <FiltroDeColuna contagens={contagens} escolhido={filtro} aoEscolher={setFiltro} />
        ) : quadro ? (
          <p className="text-caption text-fg-muted">
            {agrupar === 'none'
              ? 'Arraste os cards entre as colunas'
              : `Arraste os cards entre as colunas e as raias — outra raia troca ${agrupar === 'assignee' ? 'o responsável' : 'a prioridade'}`}{' '}
            — no celular, segure um instante antes; no teclado, espaço pega e solta.
          </p>
        ) : backlog ? (
          <p className="text-caption text-fg-muted">
            Arraste os cards entre o backlog e as sprints, ou use o menu de cada card.
          </p>
        ) : (
          <span />
        )}

        <div className="flex flex-none items-center gap-2">
          {quadro && (
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
          <button
            type="button"
            aria-pressed={arquivados}
            onClick={() => setArquivados((valor) => !valor)}
            className={cn(
              'flex h-8 flex-none items-center rounded-lg border px-3 text-detail transition-colors',
              arquivados
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-border bg-surface text-fg-muted hover:bg-surface-sunken hover:text-fg',
            )}
          >
            Arquivados
          </button>
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
          // A subtarefa nasce como o card novo: no topo da lista e da coluna dela.
          sprints: sprintsLigadas ? (sprints.sprints ?? []) : null,
          aoCriarSubtarefa: (subtarefa: ReportDetailViewModel) => {
            prepend(subtarefa)
            board.insert(subtarefa)
            renovarContagens()
          },
        }}
      />

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
          // O "Criar" de uma coluna do quadro, com a sprint ligada, cria na sprint em
          // andamento; o "Novo card", no backlog.
          sprintPublicId={criando.coluna && modoSprint ? sprints.ativa?.PublicId : undefined}
          aoCriar={(card) => {
            setCriando(null)
            // Nas duas vistas: no topo da lista, e no topo da coluna dele no quadro —
            // que, com a sprint ligada, so mostra a sprint em andamento.
            prepend(card)
            if (!modoSprint || card.Sprint?.State === 'Active') board.insert(card)
            if (sprintsLigadas) {
              sprints.revalidate()
              mexeuNoBacklog()
            }
            renovarContagens()
            toast.done(`#${card.Number} criado.`)
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
 * saida e um clique.
 */
function SemCardNoFiltro({ arquivados, aoLimpar }: { arquivados: boolean; aoLimpar: () => void }) {
  return (
    <div className="rounded-xl border border-border border-dashed bg-surface-raised p-6">
      <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
        {arquivados ? 'Nenhum card arquivado passa nos filtros.' : 'Nenhum card passa nos filtros.'}{' '}
        Os outros continuam onde estão.
      </p>
      <Button onClick={aoLimpar}>Limpar filtros</Button>
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
 * O recorte por coluna, com a contagem de cada uma.
 *
 * **"Todas" soma as colunas**, e nao chama a API de novo. A soma e exata porque a
 * contagem ja traz todas as colunas e a linha dos sem coluna — nao ha relato fora
 * dessas linhas.
 *
 * **A coluna aposentada so aparece se ainda segurar relato.** Esconde-la sempre
 * esconderia esses relatos do unico caminho que leva ate eles; mostra-la sempre
 * encheria a lista de colunas que ninguem usa mais.
 */
function FiltroDeColuna({
  contagens,
  escolhido,
  aoEscolher,
}: {
  contagens: ReportStateCountViewModel[]
  escolhido: string | null
  aoEscolher: (valor: string | null) => void
}) {
  // A escolhida fica entre as opcoes mesmo vazia: a aposentada que acabou de perder o
  // ultimo card deixaria o campo em branco, sem dizer qual recorte esta na tela.
  const visiveis = contagens.filter(
    (item) =>
      item.IsActive || item.Total > 0 || (item.StatePublicId ?? WITHOUT_STATE_FILTER) === escolhido,
  )
  const total = contagens.reduce((soma, item) => soma + item.Total, 0)

  return (
    <Select
      className="w-60"
      size="sm"
      ariaLabel="Filtrar por coluna"
      value={escolhido ?? ''}
      onChange={(valor) => aoEscolher(valor === '' ? null : valor)}
      options={[
        { value: '', label: `Todas as colunas · ${total}` },
        ...visiveis.map((item) => {
          // A linha sem coluna nao tem identificador: o valor que a rota espera para
          // ela e uma palavra, e nao um GUID.
          const nome = item.StateName ?? 'Sem coluna'
          return {
            value: item.StatePublicId ?? WITHOUT_STATE_FILTER,
            label: `${item.IsActive ? nome : `${nome} (aposentada)`} · ${item.Total}`,
          }
        }),
      ]}
    />
  )
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
        {/* Quem e so membro nao instala nada: o link levaria a Instalação, e a
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
