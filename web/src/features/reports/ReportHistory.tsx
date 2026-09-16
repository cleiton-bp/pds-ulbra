import { useCallback } from 'react'
import type { ReportEventType, ReportHistoryEntryViewModel } from '@/contracts'
import { projectReportService } from '@/data'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { formatDateTime, formatRelative } from '@/shared/lib/datetime'

/**
 * A linha do tempo do relato.
 *
 * **Montada a partir dos eventos**, e nao de uma coluna de historico. Uma coluna
 * seria uma segunda versao do mesmo fato, e as duas divergiriam no primeiro erro
 * de gravacao sem ninguem notar.
 *
 * **O nome das colunas vem do evento**, e nao da fila de hoje. Foi gravado quando
 * a mudanca aconteceu: por isso uma coluna renomeada — ou aposentada — continua
 * aparecendo aqui com o nome que tinha na epoca, em vez de o passado ser
 * reescrito a cada renomeacao.
 *
 * **O texto dos comentarios nao aparece aqui**, e nao e esquecimento: o evento
 * registra que houve comentario, nao o que foi dito. O texto mora na tabela dele,
 * que se consegue apagar — a de eventos, nao.
 */
export function ReportHistory({
  projectPublicId,
  reportPublicId,
  versao,
}: {
  projectPublicId: string
  reportPublicId: string
  /** Muda quando algo novo aconteceu, para a linha do tempo buscar de novo. */
  versao: number
}) {
  const { data, loading, failed } = useAsyncResource(
    useCallback(
      () => projectReportService.listReportHistory(projectPublicId, reportPublicId),
      // biome-ignore lint/correctness/useExhaustiveDependencies: `versao` e o gatilho da nova busca
      [projectPublicId, reportPublicId, versao],
    ),
  )

  return (
    <section className="border-border border-t pt-4">
      <h3 className="mb-2.5 font-medium text-detail text-fg">O que já aconteceu</h3>

      {loading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      )}

      {failed && (
        <p className="text-caption text-fg-muted leading-normal">
          O histórico não carregou. O relato acima está completo.
        </p>
      )}

      {data && data.length > 0 && (
        <ol className="flex flex-col gap-2">
          {data.map((entrada) => (
            <li
              key={entrada.PublicId}
              className="flex flex-wrap items-baseline gap-x-2 text-detail"
            >
              <span className="text-fg">{descrever(entrada)}</span>
              {entrada.AuthorName && (
                <span className="text-caption text-fg-muted">por {entrada.AuthorName}</span>
              )}
              <time
                dateTime={entrada.OccurredAt}
                title={formatDateTime(entrada.OccurredAt)}
                className="text-caption text-fg-muted"
              >
                {formatRelative(entrada.OccurredAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

const DESCRICOES: Record<ReportEventType, string> = {
  ReportCreated: 'Relato recebido',
  ReportViewed: 'Alguém do time abriu',
  ReportStateChanged: 'Movido',
  ReportInternalCommented: 'Comentário entre o time',
  ReportPublicCommented: 'Comentário para quem relatou',
}

/**
 * A frase de cada linha.
 *
 * Tipo que esta versao nao conhece aparece com o proprio valor, em vez de sumir:
 * a API pode ganhar um tipo antes de o painel ser atualizado, e linha do tempo com
 * buraco e pior do que linha do tempo com nome feio.
 */
function descrever(entrada: ReportHistoryEntryViewModel): string {
  if (entrada.Type !== 'ReportStateChanged') {
    return DESCRICOES[entrada.Type] ?? entrada.Type
  }

  // Sem coluna de origem: o relato entrou na fila agora, e nao veio de lugar
  // nenhum. "Movido de nenhuma para Backlog" seria uma frase que descreve um
  // caminho que ninguem percorreu.
  const destino = entrada.ToStateName ?? 'outra coluna'

  return entrada.FromStateName
    ? `Movido de ${entrada.FromStateName} para ${destino}`
    : `Colocado em ${destino}`
}
