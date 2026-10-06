import { type KeyboardEvent, useCallback, useId, useMemo, useRef, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import {
  type ReportDetailViewModel,
  type ReportStateCountViewModel,
  type ReportSummaryViewModel,
  WITHOUT_STATE_FILTER,
} from '@/contracts'
import { describeError, projectCycleSettingsService, projectReportService } from '@/data'
import { boardColumns } from '@/features/reports/board/boardState'
import { BoardSkeleton, ReportsBoard } from '@/features/reports/board/ReportsBoard'
import { useBoard } from '@/features/reports/board/useBoard'
import { NewCardDialog } from '@/features/reports/NewCardDialog'
import { ReportsTable, ReportsTableSkeleton } from '@/features/reports/ReportsTable'
import { useReportInbox } from '@/features/reports/useReportInbox'
import { Button } from '@/shared/components/Button'
import { Select } from '@/shared/components/Select'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'
import { canConfigure } from '@/shared/lib/projectAccess'

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
    // para o arquivo —, e ela nao se recalcula sozinha. Sem isto, as contagens do
    // filtro de coluna e do quadro passariam a discordar da lista na frente de quem
    // esta olhando.
    renovarContagens()
  }

  const painel = useId()

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

      {quadro ? (
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
          />
        )
      ) : (
        <>
          {loading && <ReportsTableSkeleton />}

          {reports?.length === 0 && (
            <div className="max-w-170">
              {arquivados ? (
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
              <ReportsTable reports={reports} colunas={contagens} soonDays={destaque} />

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
        <Abas vista={vista} painel={painel} aoEscolher={setVista} />
      )}

      {/* A barra de ferramentas. O recorte por coluna e so da lista: no quadro, cada
          coluna ja esta na tela, e no lugar dele fica como arrastar — no celular, o
          segurar antes nao se adivinha. */}
      <div className="my-4 flex flex-wrap items-center justify-between gap-2">
        {!arquivados && !quadro && contagens && contagens.length > 0 ? (
          <FiltroDeColuna contagens={contagens} escolhido={filtro} aoEscolher={setFiltro} />
        ) : quadro ? (
          <p className="text-caption text-fg-muted">
            Arraste os cards entre as colunas — no celular, segure um instante antes; no teclado,
            espaço pega e solta.
          </p>
        ) : (
          <span />
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

      {/* Nos arquivados nao ha abas: o conteudo e uma regiao com o nome do titulo. */}
      {arquivados ? (
        <section aria-labelledby={`${painel}-titulo`}>{conteudo}</section>
      ) : (
        <div id={painel} role="tabpanel" aria-labelledby={`${painel}-${vista}`}>
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
        }}
      />

      {criando && (
        <NewCardDialog
          projectPublicId={project.PublicId}
          colunas={contagens}
          colunaInicial={criando.coluna}
          aoCriar={(card) => {
            setCriando(null)
            // Nas duas vistas: no topo da lista, e no topo da coluna dele no quadro.
            prepend(card)
            board.insert(card)
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
}: {
  vista: Vista
  /** O id do painel que as abas controlam. */
  painel: string
  aoEscolher: (vista: Vista) => void
}) {
  const opcoes = ['lista', 'quadro'] as const
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
          {opcao === 'lista' ? 'Lista' : 'Quadro'}
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
