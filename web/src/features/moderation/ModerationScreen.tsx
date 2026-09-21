import { useCallback, useState } from 'react'
import type { ModerationItemViewModel, ReportModerationState } from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'
import { formatRelative } from '@/shared/lib/datetime'
import { reporterTypeLabel } from '@/shared/lib/reportTypes'

/**
 * Quem lê antes do resto do mundo.
 *
 * **A fila existe mesmo em projeto privado, e a seção não some lá.** Todo relato
 * nasce pendente — é isso que faz marcar o projeto como público depois não
 * publicar o histórico inteiro de uma vez. Esconder a fila em projeto privado
 * esconderia que ela continua enchendo, e quem publicasse um dia encontraria uma
 * fila de meses.
 *
 * **O texto aparece inteiro, e não cortado.** Quem decide publicar precisa ler o
 * que vai publicar: o que vaza costuma estar no meio de um parágrafo, e não nas
 * primeiras palavras.
 *
 * **Liberar não publica sozinho.** São duas condições, e nenhuma basta: o projeto
 * num nível público, e o relato liberado aqui. A tela diz isso quando o projeto é
 * privado, porque senão o botão prometeria o que não entrega.
 */
export function ModerationScreen() {
  const project = useCurrentProject()
  const [aba, setAba] = useState<ReportModerationState>('Pending')
  const [decidindo, setDecidindo] = useState<string | null>(null)

  const {
    data: fila,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(
      () => projectReportService.listModeration(project.PublicId, aba),
      [project.PublicId, aba],
    ),
  )

  async function decidir(item: ModerationItemViewModel, decisao: 'Approved' | 'Rejected') {
    if (decidindo) return

    setDecidindo(item.PublicId)

    try {
      await projectReportService.moderateReport(project.PublicId, item.PublicId, {
        Decision: decisao,
      })
      toast.done(
        decisao === 'Approved' ? 'Liberado para o público.' : 'Marcado como não publicável.',
      )
      reload()
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setDecidindo(null)
    }
  }

  return (
    <div className="max-w-190">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Moderação</h1>
      <p className="mb-6 text-body text-fg-muted leading-relaxed">
        O que ainda não foi lido por ninguém do time. Nada aparece para o público antes de passar
        por aqui — nem quando o projeto é público.
      </p>

      <div className="mb-5 flex items-center gap-2">
        {(['Pending', 'Approved', 'Rejected'] as const).map((estado) => (
          <button
            key={estado}
            type="button"
            onClick={() => setAba(estado)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-detail',
              aba === estado
                ? 'border-accent bg-surface-raised text-fg'
                : 'border-border bg-surface text-fg-muted',
            )}
          >
            {ABAS[estado]}
            {estado === 'Pending' && fila !== null && fila.PendingTotal > 0 && (
              <span className="ml-1.5 font-medium text-fg">{fila.PendingTotal}</span>
            )}
          </button>
        ))}
      </div>

      {failed && (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
            Não deu para carregar a fila agora. Nada foi decidido: a falha foi ao consultar.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {fila !== null && fila.Items.length === 0 && (
        <p className="text-body text-fg-muted leading-relaxed">{VAZIO[aba]}</p>
      )}

      {fila !== null && fila.Items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {fila.Items.map((item) => (
            <li
              key={item.PublicId}
              className="rounded-xl border border-border bg-surface-raised p-4"
            >
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-caption text-fg-muted">{item.TrackingCode}</span>
                <span className="text-caption text-fg-muted">{reporterTypeLabel(item.Type)}</span>
                <time dateTime={item.CreatedAt} className="text-caption text-fg-muted">
                  {formatRelative(item.CreatedAt)}
                </time>
              </div>

              {/* Inteiro, e com as quebras que a pessoa escreveu: decidir sobre um
                  resumo é decidir sobre a parte que coube. */}
              <p className="mb-3 whitespace-pre-wrap text-body text-fg leading-relaxed">
                {item.Text}
              </p>

              {item.ReporterName !== null && (
                <p className="mb-3 text-caption text-fg-muted leading-relaxed">
                  <strong className="font-medium text-fg">Assinou como:</strong> {item.ReporterName}{' '}
                  {/* Coletar é uma coisa, publicar é outra — e quem modera precisa
                      saber de qual das duas se trata antes de liberar. */}
                  {item.ReporterNameIsPublic
                    ? '— e quis que o nome aparecesse.'
                    : '— e pediu para o nome não aparecer.'}
                </p>
              )}

              {item.State === 'Pending' ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={decidindo !== null}
                    onClick={() => void decidir(item, 'Approved')}
                  >
                    Liberar
                  </Button>
                  <Button
                    size="sm"
                    disabled={decidindo !== null}
                    onClick={() => void decidir(item, 'Rejected')}
                  >
                    Não publicar
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-caption text-fg-muted">
                    {item.State === 'Approved' ? 'Liberado' : 'Não publicável'}
                    {item.ModeratedByName !== null && ` por ${item.ModeratedByName}`}
                    {item.ModeratedAt !== null && `, ${formatRelative(item.ModeratedAt)}`}
                  </span>
                  {/* Mudar de ideia é decidir de novo, e não voltar para a fila:
                      alguém já leu, e a fila não deve cobrar de novo o que foi lido. */}
                  <Button
                    size="sm"
                    disabled={decidindo !== null}
                    onClick={() =>
                      void decidir(item, item.State === 'Approved' ? 'Rejected' : 'Approved')
                    }
                  >
                    {item.State === 'Approved' ? 'Tirar do público' : 'Liberar mesmo assim'}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {fila !== null && aba === 'Pending' && fila.PendingTotal > fila.Items.length && (
        /* **Diz que há mais, e quantos.** Aqui o total não é segredo de ninguém: é
           do próprio time, e é o número que faz alguém decidir parar tudo e ler. */
        <p className="mt-4 text-caption text-fg-muted leading-relaxed">
          Mostrando os {fila.Items.length} mais antigos de {fila.PendingTotal}. Os outros aparecem
          conforme estes saírem da fila.
        </p>
      )}
    </div>
  )
}

const ABAS: Record<ReportModerationState, string> = {
  Pending: 'Esperando',
  Approved: 'Liberados',
  Rejected: 'Não publicáveis',
}

/**
 * A fila vazia diz coisas diferentes em cada aba — e a de "esperando" não é
 * comemoração: num projeto privado ela fica vazia porque ninguém precisou olhar.
 */
const VAZIO: Record<ReportModerationState, string> = {
  Pending: 'Nada esperando leitura. Todo relato que chegar aparece aqui antes de ir a público.',
  Approved:
    'Nenhum relato liberado ainda. Liberar só faz o relato aparecer se o projeto estiver num nível público.',
  Rejected: 'Nenhum relato foi marcado como não publicável.',
}
