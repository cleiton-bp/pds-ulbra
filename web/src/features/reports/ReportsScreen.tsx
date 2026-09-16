import { useCallback, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import {
  type ReportStateCountViewModel,
  type ReportSummaryViewModel,
  WITHOUT_STATE_FILTER,
} from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { useReportInbox } from '@/features/reports/useReportInbox'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { formatDateTime, formatRelative } from '@/shared/lib/datetime'
import { teamTypeLabel } from '@/shared/lib/teamReportTypes'

/**
 * O que chegou do site do cliente.
 *
 * **E a primeira tela do painel que mostra dado de fora.** Todas as outras
 * mostram o que a propria pessoa configurou; esta mostra o que um desconhecido
 * escreveu, e por isso o texto dele e o elemento maior da linha — protocolo, tipo
 * e data existem para localizar, nao para serem lidos.
 *
 * **O filtro por coluna chegou**, e e o que responde "o que ainda nao tratei" —
 * a pergunta que antes nao tinha como ser feita aqui. Busca por texto continua
 * fora: ela se justifica quando a lista passa de uma tela, e a coluna resolve o
 * caso comum antes disso.
 *
 * **A contagem vem de uma chamada propria**, e nao de contar as linhas que
 * chegaram: a lista traz uma pagina, e contar o que veio daria um numero errado
 * assim que o projeto passasse de vinte relatos.
 *
 * **Coluna vazia continua na tela.** Some so a aposentada que nao segura mais
 * nada — a aposentada com relato antigo fica, senao esses relatos ficariam sem
 * caminho ate eles.
 */
export function ReportsScreen() {
  const project = useCurrentProject()

  const [filtro, setFiltro] = useState<string | null>(null)

  // Trocar de projeto zera o recorte, e isto vem **antes** da busca: o
  // identificador de uma coluna do projeto anterior nao existe no novo, e a API
  // recusaria a lista inteira com 404.
  const [projetoDoFiltro, setProjetoDoFiltro] = useState(project.PublicId)
  if (projetoDoFiltro !== project.PublicId) {
    setProjetoDoFiltro(project.PublicId)
    setFiltro(null)
  }

  const { reports, total, loading, failed, loadingMore, hasMore, reload, loadMore, apply } =
    useReportInbox(project.PublicId, filtro)

  const { data: contagens, reload: recarregarContagens } = useAsyncResource(
    useCallback(() => projectReportService.listReportCounts(project.PublicId), [project.PublicId]),
  )

  return (
    <div className="max-w-170">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Relatos</h1>
      <p className="mb-6 text-fg-muted text-body">
        O que as pessoas escreveram pela ferramenta instalada no seu site, do mais recente para o
        mais antigo.
      </p>

      {failed && (
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

      {contagens && contagens.length > 0 && (
        <FiltroPorColuna contagens={contagens} escolhido={filtro} aoEscolher={setFiltro} />
      )}

      {loading && <LoadingList />}

      {reports?.length === 0 &&
        (filtro === null ? (
          <EmptyState />
        ) : (
          <ColunaVazia nome={nomeDaColuna(contagens, filtro)} aoVerTodos={() => setFiltro(null)} />
        ))}

      {reports && reports.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {reports.map((report) => (
              <li key={report.PublicId}>
                <ReportCard report={report} />
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

      {/* O relato aberto e uma rota filha, e nao um estado desta tela: assim ele
          tem endereco proprio, o botao voltar do navegador fecha o dialogo em vez
          da tela inteira, e a lista continua montada atras com o recorte e a
          rolagem onde estavam. */}
      <Outlet
        context={{
          projectPublicId: project.PublicId,
          reports,
          // As colunas saem da contagem que esta tela ja carregou: mesma ordem, e
          // sem uma segunda requisicao para perguntar o que ja esta na mao.
          colunas: contagens,
          aoMover: (movido: ReportSummaryViewModel) => {
            apply(movido)
            // A contagem muda em duas colunas de uma vez, e ela nao se recalcula
            // sozinha — sem isto as fichas passariam a discordar da lista na
            // frente de quem esta olhando.
            recarregarContagens()
          },
        }}
      />
    </div>
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
    <div className="mb-6 flex flex-wrap gap-2">
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

function ReportCard({ report }: { report: ReportSummaryViewModel }) {
  return (
    // Link, e nao botao: e o que faz o relato ter endereco proprio, abrir em outra
    // aba com o meio do mouse e sobreviver a um recarregamento da pagina.
    <Link
      to={report.PublicId}
      className="block w-full rounded-xl border border-border bg-surface-raised p-4 text-left transition-colors hover:bg-surface-sunken"
    >
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className="flex-none rounded-full border border-border px-2 py-px text-caption text-fg-muted">
            {teamTypeLabel(report.Type)}
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

      <p className="mb-2.5 line-clamp-3 whitespace-pre-wrap break-words text-body text-fg leading-relaxed">
        {report.Text}
      </p>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption text-fg-muted">
        <code className="font-mono">{report.TrackingCode}</code>
        {report.Route && (
          <>
            <span aria-hidden>·</span>
            <span className="min-w-0 truncate">{report.Route}</span>
          </>
        )}
      </div>
    </Link>
  )
}

/**
 * Lista vazia nao e erro, e a tela diz o que fazer em vez de so constatar: quem
 * chega aqui no primeiro dia precisa saber que falta instalar, e nao que o
 * produto esta quebrado.
 */
function EmptyState() {
  return (
    <div className="rounded-xl border border-border border-dashed bg-surface-raised p-6">
      <h2 className="mb-1.5 font-semibold text-fg text-lead">Nenhum relato ainda</h2>
      <p className="mb-4 text-detail text-fg-muted leading-relaxed">
        Assim que alguém enviar pela ferramenta instalada no seu site, ele aparece aqui — com o
        protocolo, a página de onde saiu e o que a pessoa escreveu.
      </p>
      <Link
        to="../start"
        className="inline-flex items-center gap-1.5 font-medium text-detail text-fg underline-offset-4 hover:underline"
      >
        Ver como instalar no seu site
      </Link>
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
