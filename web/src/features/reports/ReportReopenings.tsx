import type { PanelAttachmentViewModel, ReportReopeningViewModel } from '@/contracts'
import { AVISO_DE_ARQUIVO, toPanelGalleryItem } from '@/features/reports/ReportAttachments'
import { AttachmentGallery } from '@/shared/components/AttachmentGallery'
import { formatDateTime } from '@/shared/lib/datetime'
import { publicOutcomeLabel } from '@/shared/lib/publicOutcomes'

/**
 * As vezes em que quem relatou disse que não resolveu — e por quê.
 *
 * **É o primeiro lugar do painel onde o motivo da reabertura aparece.** Até aqui ele
 * era gravado e só virava a linha "quem relatou reabriu" no histórico: o time sabia
 * que o relato voltou, e não o que faltou. Quem pega o trabalho de novo precisa
 * ler isso antes de mexer.
 *
 * **Os arquivos da reabertura ficam junto do motivo**, e não em "Arquivos". Ali eles
 * pareceriam ter chegado com o relato — e são a prova de que o problema voltou
 * depois do encerramento, que é outra informação.
 *
 * **Não aparece nada quando nunca houve reabertura**, pelo mesmo motivo de
 * "Arquivos": uma seção vazia em todo relato só diria o que a ausência já diz.
 */
export function ReportReopenings({
  reaberturas,
  anexosPorReabertura,
  aoExpirar,
}: {
  reaberturas: ReportReopeningViewModel[]
  /** Os arquivos de cada reabertura, pelo identificador dela. */
  anexosPorReabertura: Map<string, PanelAttachmentViewModel[]>
  /** Endereço vencendo: renova sem tirar a lista da tela. */
  aoExpirar: () => void
}) {
  if (reaberturas.length === 0) return null

  return (
    <section className="border-border border-t pt-4">
      <h3 className="mb-2.5 font-medium text-detail text-fg">Reaberturas</h3>

      <ol className="flex flex-col gap-3">
        {reaberturas.map((reabertura) => {
          const anexos = anexosPorReabertura.get(reabertura.PublicId) ?? []

          return (
            <li
              key={reabertura.PublicId}
              className="rounded-xl border border-border bg-surface-sunken p-3.5"
            >
              <p className="mb-0.5 text-caption text-fg-muted">
                Quem relatou reabriu ·{' '}
                <time dateTime={reabertura.ReopenedAt} className="tabular-nums">
                  {formatDateTime(reabertura.ReopenedAt)}
                </time>
              </p>
              {/* O que foi desfeito, para quem lê entender o que a pessoa contestou. O
                  desfecho vai como rótulo, do jeito do resto do painel: dentro de uma
                  frase, "encerrado como Foi feito" não se lê. */}
              <p className="mb-1.5 text-caption text-fg-muted">
                Encerramento contestado: {publicOutcomeLabel(reabertura.Outcome)} ·{' '}
                <time dateTime={reabertura.ClosedAt} className="tabular-nums">
                  {formatDateTime(reabertura.ClosedAt)}
                </time>
              </p>

              {reabertura.Comment !== null ? (
                <p className="whitespace-pre-wrap break-words text-detail text-fg leading-relaxed">
                  {reabertura.Comment}
                </p>
              ) : (
                <p className="text-detail text-fg-muted">Reabriu sem comentário.</p>
              )}

              {anexos.length > 0 && (
                <div className="mt-3">
                  <AttachmentGallery
                    label="Imagens da reabertura"
                    fileLabel="Arquivos da reabertura"
                    fileNote={AVISO_DE_ARQUIVO}
                    onExpired={aoExpirar}
                    items={anexos.map(toPanelGalleryItem)}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
