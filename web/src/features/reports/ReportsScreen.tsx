import { useCallback, useMemo, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import {
  type ReportDetailViewModel,
  type ReportStateCountViewModel,
  type ReportSummaryViewModel,
  WITHOUT_STATE_FILTER,
} from '@/contracts'
import { describeError, projectCycleSettingsService, projectReportService } from '@/data'
import { boardColumns } from '@/features/reports/board/boardState'
import { ReportsBoard } from '@/features/reports/board/ReportsBoard'
import { useBoard } from '@/features/reports/board/useBoard'
import { NewCardDialog } from '@/features/reports/NewCardDialog'
import { useReportInbox } from '@/features/reports/useReportInbox'
import { Button } from '@/shared/components/Button'
import { CardChip } from '@/shared/components/CardChip'
import { DueChip } from '@/shared/components/DueChip'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'
import { formatDateTime, formatRelative } from '@/shared/lib/datetime'
import { canConfigure } from '@/shared/lib/projectAccess'
import { teamTypeLabel } from '@/shared/lib/teamReportTypes'

/** As duas vistas da tela de Trabalho. */
type Vista = 'lista' | 'quadro'

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
 * **Uma tela, duas vistas**: a lista, do mais recente para o mais antigo, e o
 * quadro, uma coluna por estado na ordem que o time arrumou. A ultima escolhida fica
 * guardada neste navegador, por projeto. O card abre no mesmo dialogo nas duas, e
 * so ao clicar — a frente do quadro e um resumo.
 *
 * **E a primeira tela do painel que mostra dado de fora.** Todas as outras
 * mostram o que a propria pessoa configurou; esta mostra o que um desconhecido
 * escreveu, e por isso o texto dele e o elemento maior da linha — protocolo, tipo
 * e data existem para localizar, nao para serem lidos.
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
  const [criando, setCriando] = useState(false)
  const [vista, setVista] = useVistaLembrada(project.PublicId)

  // Trocar de projeto zera o recorte, e isto vem **antes** da busca: o
  // identificador de uma coluna do projeto anterior nao existe no novo, e a API
  // recusaria a lista inteira com 404.
  const [projetoDoFiltro, setProjetoDoFiltro] = useState(project.PublicId)
  if (projetoDoFiltro !== project.PublicId) {
    setProjetoDoFiltro(project.PublicId)
    setFiltro(null)
    setArquivados(false)
  }

  const quadro = vista === 'quadro' && !arquivados

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
    loadMore,
    apply,
    prepend,
  } = useReportInbox(project.PublicId, arquivados ? null : filtro, arquivados, !quadro)

  // Depois de uma mudanca, a contagem e relida sem sair da tela (`revalidate`): pelo
  // vazio, o quadro saia da tela e voltava lido do zero a cada movimento.
  const {
    data: contagensLidas,
    failed: contagensFalharam,
    reload: recarregarContagens,
    revalidate: renovarContagens,
  } = useAsyncResource(
    useCallback(
      async () => ({
        projeto: project.PublicId,
        linhas: await projectReportService.listReportCounts(project.PublicId),
      }),
      [project.PublicId],
    ),
  )
  // A contagem de outro projeto nao serve: na troca, ela ainda e a do anterior por
  // uma renderizacao, e o quadro pediria as colunas dele ao projeto novo.
  const contagens = contagensLidas?.projeto === project.PublicId ? contagensLidas.linhas : null

  // As regras do Ciclo que a tela usa: quando o prazo fica perto, e quantos dias a
  // ultima coluna do quadro mostra. Falhando, o destaque fica no padrao de fabrica e
  // o quadro so nao diz quantos ficaram na lista — a API aplica a regra do mesmo jeito.
  const { data: ciclo } = useAsyncResource(
    useCallback(
      () => projectCycleSettingsService.getCycleSettings(project.PublicId),
      [project.PublicId],
    ),
  )
  const destaque = ciclo?.DueSoonDays ?? DESTAQUE_DE_FABRICA

  const colunasDoQuadro = useMemo(() => (contagens ? boardColumns(contagens) : null), [contagens])
  const board = useBoard(project.PublicId, colunasDoQuadro, quadro)

  /**
   * O card que mudou no dialogo, nas duas vistas: a lista troca a linha, e o quadro
   * troca os dados — e muda o card de coluna, quando foi o caso.
   */
  const aoMudar = (mudou: ReportSummaryViewModel | ReportDetailViewModel) => {
    apply(mudou)
    board.apply(mudou)
    // A contagem muda em duas colunas de uma vez — ou numa so, quando o card vai
    // para o arquivo —, e ela nao se recalcula sozinha. Sem isto as fichas
    // passariam a discordar da lista na frente de quem esta olhando.
    renovarContagens()
  }

  return (
    <div className={cn(!quadro && 'max-w-170')}>
      <div className="max-w-170">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-semibold text-screen tracking-tight">
            {arquivados ? 'Arquivados' : 'Trabalho'}
          </h1>
          <Button variant="primary" onClick={() => setCriando(true)}>
            Novo card
          </Button>
        </div>
        <p className="mb-6 text-fg-muted text-body">
          {arquivados
            ? 'Os cards que saíram da tela de Trabalho. Abra um para ler, comentar ou desarquivar.'
            : quadro
              ? 'Uma coluna por estado, na ordem que o time arrumou. Arraste os cards — no celular, segure um instante antes; no teclado, espaço pega e solta, e as setas escolhem o lugar.'
              : 'O que as pessoas escreveram pela ferramenta instalada no site e os cards que o time criou, do mais recente para o mais antigo.'}
        </p>
      </div>

      {failed && !quadro && (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
            Não deu para carregar os relatos agora. Nada se perdeu: a falha foi ao consultar, e o
            que chegou continua guardado.
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

      <div className="mb-6 flex flex-wrap items-start justify-between gap-2">
        {!arquivados && !quadro && contagens && contagens.length > 0 ? (
          <FiltroPorColuna contagens={contagens} escolhido={filtro} aoEscolher={setFiltro} />
        ) : (
          <span />
        )}

        <div className="flex flex-none items-center gap-2">
          {!arquivados && <EscolhaDeVista vista={vista} aoEscolher={setVista} />}

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

      {quadro ? (
        colunasDoQuadro === null ? (
          contagensFalharam ? (
            <div className="rounded-xl border border-border bg-surface-raised p-5">
              <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
                Não deu para carregar o quadro agora. Nada se perdeu: a falha foi ao consultar.
              </p>
              <Button onClick={recarregarContagens}>Tentar de novo</Button>
            </div>
          ) : (
            <LoadingList />
          )
        ) : (
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
            }}
          />
        )
      ) : (
        <>
          {loading && <LoadingList />}

          {reports?.length === 0 &&
            (arquivados ? (
              <div className="rounded-xl border border-border border-dashed bg-surface-raised p-6">
                <p className="text-detail text-fg-muted leading-relaxed">
                  Nenhum card arquivado. O que sai da tela de Trabalho aparece aqui.
                </p>
              </div>
            ) : filtro === null ? (
              <EmptyState installs={canConfigure(project)} aoCriar={() => setCriando(true)} />
            ) : (
              <ColunaVazia
                nome={nomeDaColuna(contagens, filtro)}
                aoVerTodos={() => setFiltro(null)}
              />
            ))}

          {reports && reports.length > 0 && (
            <>
              <ul className="flex flex-col gap-3">
                {reports.map((report) => (
                  <li key={report.PublicId}>
                    <ReportCard report={report} soonDays={destaque} />
                  </li>
                ))}
              </ul>

              <footer className="mt-5 flex items-center gap-3">
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

                {/* O numero fica fora do titulo: la ele viraria a primeira coisa lida
                    numa tela cujo assunto e o que as pessoas escreveram. */}
                <span className="text-detail text-fg-muted tabular-nums">
                  {reports.length} de {total}
                </span>
              </footer>
            </>
          )}
        </>
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
        }}
      />

      {criando && (
        <NewCardDialog
          projectPublicId={project.PublicId}
          colunas={contagens}
          aoCriar={(card) => {
            setCriando(false)
            // Nas duas vistas: no topo da lista, e no topo da coluna dele no quadro.
            prepend(card)
            board.insert(card)
            renovarContagens()
            toast.done(`#${card.Number} criado.`)
          }}
          aoCancelar={() => setCriando(false)}
        />
      )}
    </div>
  )
}

/**
 * A ultima vista escolhida, guardada neste navegador por projeto. **Preferencia de
 * quem olha**, e nao regra do projeto: cada pessoa do time trabalha na vista que
 * prefere. O navegador pode negar o armazenamento — janela privada, dados
 * bloqueados —, e ai a tela so nao lembra.
 */
function useVistaLembrada(projectPublicId: string) {
  const chave = `pds.web.trabalho.vista.${projectPublicId}`

  const ler = useCallback((): Vista => {
    try {
      return window.localStorage.getItem(chave) === 'quadro' ? 'quadro' : 'lista'
    } catch {
      return 'lista'
    }
  }, [chave])

  const [vista, setVistaEstado] = useState<Vista>(ler)

  // Outro projeto, outra lembranca.
  const [daChave, setDaChave] = useState(chave)
  if (daChave !== chave) {
    setDaChave(chave)
    setVistaEstado(ler())
  }

  const setVista = (nova: Vista) => {
    setVistaEstado(nova)
    try {
      window.localStorage.setItem(chave, nova)
    } catch {
      // Sem onde guardar, a vista vale ate sair da tela.
    }
  }

  return [vista, setVista] as const
}

/** Lista ou quadro: duas escolhas exclusivas, como as fichas do recorte. */
function EscolhaDeVista({
  vista,
  aoEscolher,
}: {
  vista: Vista
  aoEscolher: (vista: Vista) => void
}) {
  return (
    <fieldset className="flex rounded-lg border border-border bg-surface p-0.5">
      <legend className="sr-only">Vista</legend>
      {(['lista', 'quadro'] as const).map((opcao) => (
        <button
          key={opcao}
          type="button"
          aria-pressed={vista === opcao}
          onClick={() => aoEscolher(opcao)}
          className={cn(
            'flex h-7 items-center rounded-md px-2.5 text-detail transition-colors',
            vista === opcao ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg',
          )}
        >
          {opcao === 'lista' ? 'Lista' : 'Quadro'}
        </button>
      ))}
    </fieldset>
  )
}

/**
 * A linha inteira e o botao, e nao um "ver mais" no canto: o alvo do clique e o
 * relato, e dividir a linha em area clicavel e area morta obriga a mirar.
 */
/**
 * As fichas de recorte, com a contagem de cada coluna.
 *
 * **"Todos" soma as colunas**, e nao chama a API de novo. A soma e exata porque a
 * contagem ja traz todas as colunas e a linha dos sem coluna — nao ha relato fora
 * dessas linhas.
 *
 * **A coluna aposentada so aparece se ainda segurar relato.** Escondê-la sempre
 * esconderia esses relatos do unico caminho que leva ate eles; mostra-la sempre
 * encheria a barra de colunas que ninguem usa mais.
 */
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
            Nenhum relato em <strong className="font-medium text-fg">{nome}</strong> agora.
          </>
        ) : (
          'Nenhum relato neste recorte agora.'
        )}{' '}
        Os outros continuam onde estão.
      </p>
      <Button onClick={aoVerTodos}>Ver todos</Button>
    </div>
  )
}

function FiltroPorColuna({
  contagens,
  escolhido,
  aoEscolher,
}: {
  contagens: ReportStateCountViewModel[]
  escolhido: string | null
  aoEscolher: (valor: string | null) => void
}) {
  const visiveis = contagens.filter((item) => item.IsActive || item.Total > 0)
  const total = contagens.reduce((soma, item) => soma + item.Total, 0)

  return (
    <div className="flex flex-wrap gap-2">
      <Ficha
        rotulo="Todos"
        total={total}
        ativa={escolhido === null}
        aoClicar={() => aoEscolher(null)}
      />

      {visiveis.map((item) => {
        // A linha sem coluna nao tem identificador: o valor que a rota espera para
        // ela e uma palavra, e nao um GUID.
        const valor = item.StatePublicId ?? WITHOUT_STATE_FILTER
        const rotulo = item.StateName ?? 'Sem coluna'

        return (
          <Ficha
            key={valor}
            rotulo={item.IsActive ? rotulo : `${rotulo} (aposentada)`}
            total={item.Total}
            ativa={escolhido === valor}
            aoClicar={() => aoEscolher(valor)}
          />
        )
      })}
    </div>
  )
}

function Ficha({
  rotulo,
  total,
  ativa,
  aoClicar,
}: {
  rotulo: string
  total: number
  ativa: boolean
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      // O espaco entre o rotulo e o numero e visual, feito pelo `gap` — no texto
      // nao ha nada entre os dois, e o leitor de tela anunciaria "Todos55". O nome
      // proprio tambem diz o que o numero conta, que a tela deixa implicito.
      aria-label={`${rotulo}, ${total} ${total === 1 ? 'relato' : 'relatos'}`}
      onClick={aoClicar}
      className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-detail transition-colors ${
        ativa
          ? 'border-accent bg-accent text-accent-fg'
          : 'border-border bg-surface text-fg hover:bg-surface-sunken'
      }`}
    >
      {rotulo}
      <span className={ativa ? 'opacity-80' : 'text-fg-muted'}>{total}</span>
    </button>
  )
}

function ReportCard({ report, soonDays }: { report: ReportSummaryViewModel; soonDays: number }) {
  const doTime = report.Kind === 'Team'
  const titulo = report.Title ?? report.ReporterTitle

  return (
    // Link, e nao botao: e o que faz o relato ter endereco proprio, abrir em outra
    // aba com o meio do mouse e sobreviver a um recarregamento da pagina.
    <Link
      to={report.PublicId}
      className="block w-full rounded-xl border border-border bg-surface-raised p-4 text-left transition-colors hover:bg-surface-sunken"
    >
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          {/* O numero e como o time fala do card — no grupo, no commit, em voz alta. */}
          <span className="flex-none font-mono text-caption text-fg">#{report.Number}</span>
          <span className="flex-none rounded-full border border-border px-2 py-px text-caption text-fg-muted">
            {doTime ? 'Do time' : report.Type ? teamTypeLabel(report.Type) : 'Relato'}
          </span>

          {/* Onde ele esta na fila. Sem ficha quando nao ha coluna: desenhar
              "Sem coluna" em todo cartao de um projeto que ainda nao criou
              nenhuma encheria a lista de um aviso que nao pede acao. */}
          {report.StateName && (
            <span className="min-w-0 truncate text-caption text-fg-muted">{report.StateName}</span>
          )}
        </div>

        {/* O relativo responde "isto e recente?", que e a pergunta de quem passa
            os olhos; a data exata fica no `title`, para quem precisa dela. */}
        <time
          dateTime={report.CreatedAt}
          title={formatDateTime(report.CreatedAt)}
          className="flex-none text-caption text-fg-muted"
        >
          {formatRelative(report.CreatedAt)}
        </time>
      </header>

      {/* O titulo do time, senao o que quem relatou escreveu — e o texto dela logo
          abaixo, que continua sendo o que ela escreveu. Sem titulo nenhum, o comeco
          do texto faz as vezes de titulo. */}
      {titulo ? (
        <>
          <p className="line-clamp-2 break-words font-medium text-body text-fg">{titulo}</p>
          {!doTime && (
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-detail text-fg-muted leading-relaxed">
              {report.Text}
            </p>
          )}
        </>
      ) : (
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-body text-fg leading-relaxed">
          {report.Text}
        </p>
      )}

      <CardFacts report={report} soonDays={soonDays} />

      {!doTime && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption text-fg-muted">
          <code className="font-mono">{report.TrackingCode}</code>
          {report.Route && (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate">{report.Route}</span>
            </>
          )}
        </div>
      )}
    </Link>
  )
}

/**
 * O que o time deu ao card, numa faixa so: prioridade, etiquetas, quem esta com
 * ele e o prazo. Some quando nao ha nada — a lista de um time que nao usa os campos
 * nao ganha uma linha vazia em cada card.
 */
function CardFacts({ report, soonDays }: { report: ReportSummaryViewModel; soonDays: number }) {
  const { Priority, Labels, Assignee, DueDate } = report
  if (!Priority && Labels.length === 0 && !Assignee && !DueDate) return null

  // Tres etiquetas e um "+2": a linha e para passar os olhos, e o card aberto
  // mostra todas.
  const visiveis = Labels.slice(0, 3)
  const restantes = Labels.length - visiveis.length

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-caption text-fg-muted">
      {Priority && (
        <CardChip color={Priority.Color}>
          {Priority.IsActive ? Priority.Name : `${Priority.Name} (aposentada)`}
        </CardChip>
      )}
      {visiveis.map((etiqueta) => (
        <CardChip key={etiqueta.PublicId} color={etiqueta.Color}>
          {etiqueta.Name}
        </CardChip>
      ))}
      {restantes > 0 && <span>+{restantes}</span>}
      {Assignee && (
        <span className="min-w-0 truncate">
          {/* Sem nome no Google, a API ja manda o e-mail no lugar. */}
          {Assignee.Name || 'Sem nome'}
          {!Assignee.InTeam && ' (saiu do time)'}
        </span>
      )}
      {DueDate && <DueChip day={DueDate} soonDays={soonDays} />}
    </div>
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
        Assim que alguém enviar pela ferramenta instalada no site, o relato aparece aqui — com o
        protocolo, a página de onde saiu e o que a pessoa escreveu. O time também cria os próprios
        cards.
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

function LoadingList() {
  return (
    <div className="flex flex-col gap-3">
      {['w-11/12', 'w-3/4', 'w-2/3'].map((width) => (
        <div key={width} className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="mb-3 flex justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="mb-2 h-3 w-full" />
          <Skeleton className={`mb-3 h-3 ${width}`} />
          <Skeleton className="h-2 w-28" />
        </div>
      ))}
    </div>
  )
}
