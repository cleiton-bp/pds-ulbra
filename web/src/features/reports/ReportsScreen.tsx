import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ReportSummaryViewModel } from '@/contracts'
import { describeError } from '@/data'
import { ReportDialog } from '@/features/reports/ReportDialog'
import { useReportInbox } from '@/features/reports/useReportInbox'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
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
 * Nao ha filtro nem busca, e nao e esquecimento: eles se justificam quando a
 * lista passa de uma tela, e o quadro por estado da etapa 3 e que vai responder
 * "o que ainda nao tratei". Inventar filtro agora seria construir a versao
 * provisoria de uma tela que ja tem sucessora.
 */
export function ReportsScreen() {
  const project = useCurrentProject()
  const { reports, total, loading, failed, loadingMore, hasMore, reload, loadMore } =
    useReportInbox(project.PublicId)

  const [opened, setOpened] = useState<ReportSummaryViewModel | null>(null)

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
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && <LoadingList />}

      {reports?.length === 0 && <EmptyState />}

      {reports && reports.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {reports.map((report) => (
              <li key={report.PublicId}>
                <ReportCard report={report} onOpen={() => setOpened(report)} />
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

      <ReportDialog
        projectPublicId={project.PublicId}
        report={opened}
        onOpenChange={(open) => {
          if (!open) setOpened(null)
        }}
      />
    </div>
  )
}

/**
 * A linha inteira e o botao, e nao um "ver mais" no canto: o alvo do clique e o
 * relato, e dividir a linha em area clicavel e area morta obriga a mirar.
 */
function ReportCard({ report, onOpen }: { report: ReportSummaryViewModel; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-xl border border-border bg-surface-raised p-4 text-left transition-colors hover:bg-surface-sunken"
    >
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <span className="flex-none rounded-full border border-border px-2 py-px text-caption text-fg-muted">
          {teamTypeLabel(report.Type)}
        </span>

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
    </button>
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
