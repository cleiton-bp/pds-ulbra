import type { ReactNode } from 'react'
import type { PublicAttachmentViewModel, PublicReopeningViewModel } from '@/contracts'
import { AttachmentGallery } from '@/shared/components/AttachmentGallery'
import { formatDateTime } from '@/shared/lib/datetime'
import { toGalleryItem } from '@/tracking/TrackingAttachments'

/**
 * As vezes em que a pessoa disse que não resolveu, com o que ela disse em cada uma.
 *
 * **Sem este bloco, o motivo sumia da página no instante em que era gravado.**
 * Reaberto, o fechamento deixa de ser o fim do relato e sai de "Como terminou" — e
 * com ele saía a única coisa que a pessoa tinha escrito ao reabrir.
 *
 * **Os prints da reabertura ficam aqui, junto do motivo**, e não embaixo do relato:
 * "ainda está quebrado, olha aqui" é outra coisa que o print de quando relatou, e
 * misturar os dois apagaria a diferença entre antes e depois.
 *
 * **O envio em andamento aparece na reabertura mais recente**, que é a dele: o
 * texto já foi gravado, e os arquivos sobem presos a ela.
 */
export function ReopenPanel({
  reaberturas,
  anexosPorReabertura,
  aoExpirar,
  progresso = null,
}: {
  reaberturas: PublicReopeningViewModel[]
  /** Os arquivos de cada reabertura, pelo identificador dela. */
  anexosPorReabertura: Map<string, PublicAttachmentViewModel[]>
  /** Um endereço venceu: quem monta a página relê os arquivos. */
  aoExpirar: () => void
  /** Os arquivos da reabertura que acabou de acontecer, subindo. */
  progresso?: ReactNode
}) {
  if (reaberturas.length === 0 && progresso === null) return null

  const ultima = reaberturas[reaberturas.length - 1]

  return (
    <section
      aria-label="Reaberturas"
      className="mt-5 rounded-xl border border-border bg-surface-raised p-5"
    >
      <ol className="flex flex-col gap-5">
        {reaberturas.map((reabertura) => {
          const anexos = anexosPorReabertura.get(reabertura.PublicId) ?? []

          return (
            <li
              key={reabertura.PublicId}
              className="border-border border-t pt-5 first:border-t-0 first:pt-0"
            >
              <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-semibold text-fg text-lead">Você reabriu este relato</h2>
                <time
                  dateTime={reabertura.ReopenedAt}
                  className="text-caption text-fg-muted tabular-nums"
                >
                  {formatDateTime(reabertura.ReopenedAt)}
                </time>
              </div>

              {/* `whitespace-pre-wrap` pelo mesmo motivo do relato: quem escreveu
                  escreveu em linhas. Sem comentário, o título já diz o que houve. */}
              {reabertura.Comment !== null && (
                <p className="whitespace-pre-wrap break-words text-body text-fg leading-relaxed">
                  {reabertura.Comment}
                </p>
              )}

              {/* Logo abaixo do motivo, no tamanho que a pessoa escolheu: o print e
                  parte do que ela disse ao reabrir. */}
              {anexos.length > 0 && (
                <div className="mt-3">
                  <AttachmentGallery
                    label="O que você anexou ao reabrir"
                    onExpired={aoExpirar}
                    items={anexos.map(toGalleryItem)}
                  />
                </div>
              )}

              {reabertura === ultima && progresso !== null && (
                <div className="mt-4">{progresso}</div>
              )}
            </li>
          )
        })}
      </ol>

      {/* Sem reabertura na lista, o envio ainda aparece: sumir com ele esconderia um
          arquivo que falhou, e a pessoa não saberia que precisa tentar de novo. */}
      {reaberturas.length === 0 && progresso}
    </section>
  )
}
